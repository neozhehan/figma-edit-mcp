/**
 * Rejects exactly-empty explicit names at the plugin mutation boundary.
 *
 * Figma normalizes an assigned empty name to a native default (live-verified:
 * `create_shape` → `Rectangle`, `node_rename` → `Rectangle`, `node_group` →
 * `Group`), so accepting `""` would silently apply a name the caller never
 * asked for and report success. Whether omission is valid depends on the
 * assigning field: some fields use a native default, some leave an existing
 * name unchanged, and some are required. Whitespace is an intentional,
 * non-empty value and must not be normalized or rejected here (live-verified
 * for layer names: `" "`, `"   "`, and `"\t"` persist exactly).
 *
 * Apply this only when the field assigns a user-visible name. A field that is
 * an assignment for one action and a lookup for another must call this helper
 * only in the assigning action, preserving exact lookup semantics.
 */
export function assertNonEmptyExplicitName(
    value: unknown,
    parameterName: string,
    command: string,
    recovery: string,
): void {
    if (value === "") {
        throw new Error(
            `${command}: ${parameterName} must not be empty. ${recovery}`,
        );
    }
}
