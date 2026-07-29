import { describeError, REFUSALS } from "./errors.js";

/**
 * Current operational timeout for one PageNode.loadAsync() call.
 *
 * This 10-second value is implementation behavior, not part of the public
 * contract. The contract is only that every page load is bounded and a timeout
 * becomes PAGE_LOAD_TIMEOUT. Keeping the value here gives every Phase 10 read
 * and destructive scan one policy without introducing scheduler knobs.
 */
export const PAGE_LOAD_TIMEOUT_MS = 10_000;

export interface StructuredPageError {
    code: string;
    message: string;
    details?: any;
}

export interface PageErrorEntry {
    pageId: string;
    error: StructuredPageError;
}

export interface PageCoverage {
    complete: boolean;
    /**
     * Change 8 (F4): distinct pages this command tried to resolve, load, or
     * read. `complete: true` alone was ambiguous — it was returned both by a
     * document-wide scan in which every page succeeded and by a call that never
     * touched a page at all (`page_info` with no args, `variable_list` without
     * `includeConsumers`, `annotation_list` in node mode). Those are different
     * epistemic states, and a caller deciding whether it has seen the whole
     * document must be able to tell them apart. `pagesAttempted: 0` means no
     * page access was required, never "all pages checked out fine".
     */
    pagesAttempted: number;
    pageErrors: PageErrorEntry[];
}

export type PageFailureReason =
    | "not_found"
    | "not_page"
    | "load_failed"
    | "timeout"
    | "scan_failed";

export interface PageLoadFailure {
    ok: false;
    error: StructuredPageError;
    reason: PageFailureReason;
}

export type PageLoadResult =
    | { ok: true; page: PageNode }
    | PageLoadFailure;

export interface PageLoadCoordinator {
    load(page: PageNode): Promise<PageLoadResult>;
    resolve(pageId: string): Promise<PageLoadResult>;
    require(pageId: string): Promise<PageNode>;
    /**
     * Records a post-load read failure. It can only ever produce a failure, and
     * the type says so — callers used to guard it with `if (!failed.ok)`, a
     * branch that could never be false and read as a fallback that never ran.
     */
    fail(pageId: string, cause: any): PageLoadFailure;
    coverage(): PageCoverage;
}

/**
 * Builds a per-command loader. Successful and failed page attempts are cached,
 * so overlapping node roots cannot load or report the same page twice.
 *
 * Tests may pass a shorter timeout to this internal coordinator. Production
 * handlers always use the default above; no MCP input can weaken or extend it.
 */
export function createPageLoadCoordinator(
    timeoutMs: number = PAGE_LOAD_TIMEOUT_MS,
): PageLoadCoordinator {
    const boundedTimeoutMs = Math.max(1, timeoutMs);
    const pageLoads = new Map<string, Promise<PageLoadResult>>();
    const pageResolutions = new Map<string, Promise<PageLoadResult>>();
    const pageErrors = new Map<string, PageErrorEntry>();
    const attemptedPages = new Set<string>();

    const recordError = (
        pageId: string,
        error: StructuredPageError,
        reason: PageFailureReason,
    ): PageLoadFailure => {
        attemptedPages.add(pageId);
        if (!pageErrors.has(pageId)) {
            pageErrors.set(pageId, { pageId, error });
        }
        return { ok: false, error, reason };
    };

    const load = (page: PageNode): Promise<PageLoadResult> => {
        attemptedPages.add(page.id);
        const cached = pageLoads.get(page.id);
        if (cached) return cached;

        const attempt = new Promise<PageLoadResult>((resolve) => {
            let acceptingSettlement = true;
            const finish = (result: PageLoadResult) => {
                if (!acceptingSettlement) return;
                acceptingSettlement = false;
                clearTimeout(timer);
                resolve(result);
            };

            const timer = setTimeout(() => {
                if (!acceptingSettlement) return;
                acceptingSettlement = false;
                resolve(recordError(
                    page.id,
                    REFUSALS.PAGE_LOAD_TIMEOUT(page.id, boundedTimeoutMs),
                    "timeout",
                ));
            }, boundedTimeoutMs);

            // Promise.resolve().then(...) also captures a synchronous throw from
            // a hostile/mocked loadAsync implementation. Once the timer wins,
            // both late fulfillment and late rejection are deliberately inert:
            // they cannot mutate the returned coverage or authorize a scan.
            Promise.resolve()
                .then(() => page.loadAsync())
                .then(
                    () => finish({ ok: true, page }),
                    (error: any) => finish(recordError(
                        page.id,
                        REFUSALS.PAGE_LOAD_FAILED(page.id, describeError(error)),
                        "load_failed",
                    )),
                );
        });

        pageLoads.set(page.id, attempt);
        return attempt;
    };

    const resolvePage = (pageId: string): Promise<PageLoadResult> => {
        const cached = pageResolutions.get(pageId);
        if (cached) return cached;

        const resolution = (async (): Promise<PageLoadResult> => {
            attemptedPages.add(pageId);
            let node: BaseNode | null;
            try {
                node = await figma.getNodeByIdAsync(pageId);
            } catch (error: any) {
                return recordError(
                    pageId,
                    REFUSALS.PAGE_LOAD_FAILED(pageId, describeError(error)),
                    "load_failed",
                );
            }

            if (!node) {
                return recordError(
                    pageId,
                    REFUSALS.PAGE_NOT_FOUND(pageId),
                    "not_found",
                );
            }
            // Change 8 (F6): a document page is a PAGE parented directly to the
            // document root. The second half of that test was dropped when page
            // resolution moved here; it is restored as deliberate defense in
            // depth, and the reported `actualType` stays honest about which
            // half failed rather than emitting "is not a PAGE (type: PAGE)".
            if (node.type !== "PAGE") {
                return recordError(
                    pageId,
                    REFUSALS.TARGET_NOT_PAGE(pageId, node.type),
                    "not_page",
                );
            }
            // Change 9 (C9-F2): direct-root membership is a fail-closed target
            // predicate. The Change 8 guard prevented a crash but skipped the
            // predicate when figma.root.id was unreadable, accepting a detached
            // PAGE. Read both operands defensively; an unreadable relationship
            // is a structured resolution failure, never permission to load.
            let documentRootId: string;
            try {
                documentRootId = figma.root.id;
            } catch (error: any) {
                return recordError(
                    pageId,
                    REFUSALS.PAGE_LOAD_FAILED(
                        pageId,
                        `document root identity could not be verified: ${describeError(error)}`,
                    ),
                    "load_failed",
                );
            }

            let parentId: string | undefined;
            try {
                parentId = node.parent?.id;
            } catch (error: any) {
                return recordError(
                    pageId,
                    REFUSALS.PAGE_LOAD_FAILED(
                        pageId,
                        `direct document parent could not be verified: ${describeError(error)}`,
                    ),
                    "load_failed",
                );
            }

            if (parentId !== documentRootId) {
                return recordError(
                    pageId,
                    REFUSALS.TARGET_NOT_PAGE(
                        pageId,
                        "PAGE, but not a direct child of the document root",
                    ),
                    "not_page",
                );
            }
            return load(node);
        })();

        pageResolutions.set(pageId, resolution);
        return resolution;
    };

    return {
        load,
        resolve: resolvePage,
        async require(pageId: string) {
            const result = await resolvePage(pageId);
            if (!result.ok) {
                // The object was constructed by the canonical REFUSALS factory
                // and is rethrown unchanged for single-page commands.
                throw result.error;
            }
            return result.page;
        },
        // Every caller of `fail` has already loaded the page successfully and
        // then failed while READING it, so this is PAGE_SCAN_FAILED, not
        // PAGE_LOAD_FAILED (Change 8, F2). The originating cause is preserved
        // in `details.cause` either way.
        fail(pageId: string, cause: any) {
            return recordError(
                pageId,
                REFUSALS.PAGE_SCAN_FAILED(pageId, describeError(cause)),
                "scan_failed",
            );
        },
        coverage() {
            const errors = Array.from(pageErrors.values());
            return {
                complete: errors.length === 0,
                pagesAttempted: attemptedPages.size,
                pageErrors: errors,
            };
        },
    };
}
