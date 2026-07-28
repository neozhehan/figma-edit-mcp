/**
 * Rejects exactly-empty optional names at the plugin mutation boundary.
 *
 * Figma normalizes an assigned empty name to a native default, so accepting
 * `""` would report a requested value that did not persist. Omission remains
 * valid and preserves each creator's existing default. Whitespace is an
 * intentional, non-empty name and must not be normalized or rejected here.
 */
export function assertNonEmptyExplicitCreatorName(
    value: unknown,
    parameterName: "name" | "componentSetName",
    command: string,
): void {
    if (value === "") {
        throw new Error(
            `${command}: ${parameterName} must not be empty. Omit ${parameterName} to use the default name.`,
        );
    }
}
