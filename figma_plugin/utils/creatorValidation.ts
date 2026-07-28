/**
 * Rejects exactly-empty explicit names at the plugin mutation boundary.
 *
 * Figma normalizes an assigned empty name to a native default (live-verified:
 * `create_shape` → `Rectangle`, `node_rename` → `Rectangle`, `node_group` →
 * `Group`), so accepting `""` would silently apply a name the caller never
 * asked for and report success. Omission remains valid and preserves each
 * tool's existing default. Whitespace is an intentional, non-empty name and is
 * preserved by Figma (live-verified: `" "`, `"   "`, and `"\t"` all persist
 * exactly), so it must not be normalized or rejected here.
 *
 * This guards every tool that ASSIGNS a user-visible name. Lookup and
 * verification fields (`nodeName`, `styleName`, `propertyName`, …) are
 * deliberately excluded: a present-empty verification value is compared
 * exactly, per the C9 resolution.
 */
export function assertNonEmptyExplicitName(
    value: unknown,
    parameterName: string,
    command: string,
): void {
    if (value === "") {
        throw new Error(
            `${command}: ${parameterName} must not be empty. Omit ${parameterName} to use the default name.`,
        );
    }
}
