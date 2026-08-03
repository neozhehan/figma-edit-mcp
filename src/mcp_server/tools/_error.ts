import { UNKNOWN_ERROR } from "../../shared/errorCodes.js";

export type SafeErrorPropertyRead = {
    readable: boolean;
    value?: any;
};

/**
 * Reads one property from an arbitrary thrown value without trusting accessors
 * or Proxies. `PropertyKey` includes the non-wire Symbol used for channel-join
 * attempt metadata.
 */
export function readThrownProperty(
    value: any,
    property: PropertyKey,
): SafeErrorPropertyRead {
    try {
        return {
            readable: true,
            value: value[property],
        };
    } catch {
        return { readable: false };
    }
}

function renderThrownValue(value: any): string {
    if (typeof value === "string") return value || "Error executing command";
    try {
        const rendered = String(value);
        return rendered || "Error executing command";
    } catch {
        return "Error executing command";
    }
}

/**
 * Copies optional details into a plain, safely reusable value. A later consumer
 * must never touch the original error object again: getters or Proxy traps may
 * throw on a second read, and an unreadable optional field is omitted under the
 * total error-transport contract.
 */
function copyReadableThrownDetails(value: any): any {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== "object") return value;
    try {
        if (Array.isArray(value)) return [...value];
        return { ...value };
    } catch {
        return undefined;
    }
}

export type DescribedThrownError = {
    hasExplicitCode: boolean;
    code: string;
    message: string;
    details?: any;
};

/**
 * Takes one safe snapshot of an arbitrary JavaScript thrown value.
 *
 * A readable string code remains authoritative even when optional details are
 * unreadable. Message and details are copied now so downstream formatting,
 * guidance, and recovery merging never re-read the untrusted origin.
 */
export function describeThrownForToolBoundary(error: any): DescribedThrownError {
    const isObj = error !== null && typeof error === "object";
    const codeRead: SafeErrorPropertyRead = isObj
        ? readThrownProperty(error, "code")
        : { readable: false };
    const messageRead: SafeErrorPropertyRead = isObj
        ? readThrownProperty(error, "message")
        : { readable: false };
    const detailsRead: SafeErrorPropertyRead = isObj
        ? readThrownProperty(error, "details")
        : { readable: false };
    const hasExplicitCode =
        codeRead.readable && typeof codeRead.value === "string";
    const result: DescribedThrownError = {
        hasExplicitCode,
        code: hasExplicitCode ? codeRead.value : UNKNOWN_ERROR,
        message:
            messageRead.readable &&
            typeof messageRead.value === "string" &&
            messageRead.value.length > 0
                ? messageRead.value
                : renderThrownValue(error),
    };
    if (detailsRead.readable) {
        const details = copyReadableThrownDetails(detailsRead.value);
        if (details !== undefined) result.details = details;
    }
    return result;
}
