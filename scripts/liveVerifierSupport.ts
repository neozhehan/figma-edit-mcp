import { setTimeout as wait } from "node:timers/promises";

/**
 * Keeps failure diagnostics useful without letting a verbose server consume an
 * unbounded amount of verifier memory or pollute the JSON evidence stream.
 */
export class DiagnosticTail {
    private value = "";

    constructor(readonly maxCharacters = 32 * 1024) {
        if (!Number.isInteger(maxCharacters) || maxCharacters < 1) {
            throw new Error("DiagnosticTail maxCharacters must be a positive integer");
        }
    }

    append(chunk: unknown): void {
        let text: string;
        try {
            text = typeof chunk === "string"
                ? chunk
                : (chunk as any)?.toString?.() ?? String(chunk);
        } catch {
            text = "[unrenderable diagnostic]";
        }
        this.value = `${this.value}${text}`.slice(-this.maxCharacters);
    }

    snapshot(): string {
        return this.value.trimEnd();
    }
}

export function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function diagnosticBlock(label: string, diagnostics: DiagnosticTail): string {
    const tail = diagnostics.snapshot();
    return tail.length > 0
        ? `\n--- ${label} diagnostic tail ---\n${tail}\n--- end ${label} diagnostic tail ---`
        : `\n--- ${label} diagnostic tail: empty ---`;
}

export function verifierFailure(
    error: unknown,
    context: string,
    diagnostics?: DiagnosticTail,
): Error {
    let message: string;
    try {
        message = error instanceof Error ? error.message : String(error);
    } catch {
        message = "unrenderable failure";
    }
    const suffix = diagnostics ? diagnosticBlock("server", diagnostics) : "";
    return new Error(`${context}: ${message}${suffix}`, { cause: error });
}

interface RetryOptions {
    timeoutMs: number;
    intervalMs?: number;
    label: string;
}

/** Retry only explicitly classified transient failures until a real deadline. */
export async function retryTransient<T>(
    attempt: () => Promise<T>,
    isTransient: (error: unknown) => boolean,
    options: RetryOptions,
): Promise<T> {
    const intervalMs = options.intervalMs ?? 100;
    const deadline = Date.now() + options.timeoutMs;
    let lastError: unknown;

    while (true) {
        try {
            return await attempt();
        } catch (error) {
            if (!isTransient(error)) throw error;
            lastError = error;
        }

        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw verifierFailure(
                lastError,
                `${options.label} did not become ready within ${options.timeoutMs}ms`,
            );
        }
        await wait(Math.min(intervalMs, remaining));
    }
}
