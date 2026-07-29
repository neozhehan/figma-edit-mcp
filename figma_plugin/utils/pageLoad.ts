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
    pageErrors: PageErrorEntry[];
}

export type PageLoadResult =
    | { ok: true; page: PageNode }
    | {
        ok: false;
        error: StructuredPageError;
        reason: "not_found" | "not_page" | "load_failed" | "timeout";
    };

export interface PageLoadCoordinator {
    load(page: PageNode): Promise<PageLoadResult>;
    resolve(pageId: string): Promise<PageLoadResult>;
    require(pageId: string): Promise<PageNode>;
    fail(pageId: string, cause: any): PageLoadResult;
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

    const recordError = (
        pageId: string,
        error: StructuredPageError,
        reason: "not_found" | "not_page" | "load_failed" | "timeout",
    ): PageLoadResult => {
        if (!pageErrors.has(pageId)) {
            pageErrors.set(pageId, { pageId, error });
        }
        return { ok: false, error, reason };
    };

    const load = (page: PageNode): Promise<PageLoadResult> => {
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
            if (node.type !== "PAGE") {
                return recordError(
                    pageId,
                    REFUSALS.TARGET_NOT_PAGE(pageId, node.type),
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
        fail(pageId: string, cause: any) {
            return recordError(
                pageId,
                REFUSALS.PAGE_LOAD_FAILED(pageId, describeError(cause)),
                "load_failed",
            );
        },
        coverage() {
            const errors = Array.from(pageErrors.values());
            return {
                complete: errors.length === 0,
                pageErrors: errors,
            };
        },
    };
}
