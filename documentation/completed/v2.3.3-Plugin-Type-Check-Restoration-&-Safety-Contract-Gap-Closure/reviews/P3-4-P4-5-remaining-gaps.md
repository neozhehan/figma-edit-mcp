# Remaining Gaps: P3-4 and P4-5

Updated after the 2026-07-24 adversarial recheck.

## P3-4 — Directive ranges are authoritative, but directive classification is not

**Status:** Partially fixed; safety-relevant false negatives remain.

### Remaining gap

The checker now obtains recognized directive ranges from TypeScript through `sourceFile.commentDirectives`, correctly fixing the earlier template, regex-interpolation, and multiline-block defects.

However, it declares TypeScript's `directive.type` at `scripts/check-suppressions.ts:55` and then ignores it. Instead, it reclassifies the recognized range using `@ts-ignore\b` at line 98 and removes the expect-error marker using another word boundary at lines 110–113.

TypeScript recognizes directive prefixes without requiring that word boundary. Consequently, each of these active suppressions bypasses `checkContent()`:

```ts
// @ts-ignorefoo
missingSymbol;

// @ts-ignore_legacy
missingSymbol;

// @ts-ignore123
missingSymbol;
```

For every example, TypeScript classifies the directive as `Ignore`, suppresses `TS2304`, and the checker returns no violation.

The meaningful-description rule can likewise be bypassed:

```ts
// @ts-expect-error_
missingSymbol;
```

TypeScript recognizes the directive and suppresses `TS2304`, but the checker accepts it even though `_` contains no alphanumeric description.

The same reclassification also causes a false positive:

```ts
// @ts-expect-error TS2304: replace old @ts-ignore usage
missingSymbol;
```

TypeScript classifies this as `ExpectError`, but the checker sees the later `@ts-ignore` text and incorrectly reports a forbidden ignore.

### Impact

A forbidden active `@ts-ignore`, or an `@ts-expect-error` without the required meaningful description, can bypass the suppression gate and conceal a genuine type error. Valid described expect-errors can also be rejected when their explanation mentions `@ts-ignore`.

### Required remediation

- Branch on TypeScript's `directive.type` instead of searching the complete range for `@ts-ignore`.
- For an `ExpectError` directive, locate the canonical `@ts-expect-error` marker and inspect only the suffix after its fixed length, without a word-boundary requirement.
- Fail closed if TypeScript returns an unknown directive type.
- Add regression fixtures covering:
  - `@ts-ignorefoo`, `@ts-ignore_legacy`, and `@ts-ignore123`;
  - the same suffix forms in `///`, single-line block, and starred final-line block comments;
  - punctuation-only suffixed expect-errors such as `@ts-expect-error_`;
  - a valid described expect-error whose description mentions `@ts-ignore`.

### Acceptance criteria

- Every directive TypeScript classifies as `Ignore` is rejected, regardless of suffix.
- Every recognized `ExpectError` requires an alphanumeric description after the canonical marker.
- A described `ExpectError` is not misclassified because its description mentions another directive.
- Differential fixtures, `bun run check:suppressions`, and `bun run check:types:plugin` pass.

---

## P4-5 — Production factories are correct, but the executable source-use invariant is incomplete

**Status:** Production implementation fixed; regression enforcement remains incomplete.

### Current correct implementation

- `figma_plugin/utils/errors.ts:65` contains exactly the 19 required factories: 10 operational, 7 D5, and 2 D6.
- All 11 live coded plugin throws call `REFUSALS` directly.
- `UNKNOWN_ERROR` has only the two deliberate definitions in `figma_plugin/utils/errors.ts` and `src/shared/errorCodes.ts`; production consumers import them.
- Legacy `ERRORS` contains no ratified v2.3.3 code.
- Q27's two-registry decision and Q29's schema-local refinement decision are implemented consistently.

### Remaining gap

The AST invariant at `src/mcp_server/tests/unit/figma_plugin/v2.3.3.phase4.test.ts:437–476` scans only for exact ratified-code string literals outside `utils/errors.ts`. It does not prove that the complete thrown object came directly from a factory.

For example, both of these factory-bypassing regressions evade the current scan:

```ts
throw {
    code: REFUSALS.VARIABLE_NAME_MISSING().code,
    message: "locally authored replacement",
};

throw {
    ...REFUSALS.VARIABLE_NAME_MISSING(),
    message: "locally authored replacement",
};
```

Additional enforcement gaps:

- `UNKNOWN_ERROR` is excluded from the AST invariant.
- `connectHandlers.test.ts:49–53` explicitly accepts either the imported constant or a quoted `"UNKNOWN_ERROR"` literal, so the previously fixed hardcoding could return without failing CI.
- Recovery-content tests cover operational and name-verification factories, but `VARIABLE_SCOPES_MISSING` receives only the generic nonempty-message assertion. Reducing its message to `"x"` still satisfies the applicable checks.

### Impact

The current production source is correct, but a future locally authored coded message, spread-and-override throw, reintroduced `UNKNOWN_ERROR` literal, or non-actionable `VARIABLE_SCOPES_MISSING` message could pass CI while violating the centralized-factory contract.

### Required remediation

- Strengthen the AST invariant so coded plugin throws must throw the direct result of `REFUSALS.<CODE>(...)`, not a reconstructed or spread-and-overridden object.
- Scan `UNKNOWN_ERROR` across plugin and server sources, allowing string definitions only in:
  - `figma_plugin/utils/errors.ts`;
  - `src/shared/errorCodes.ts`.
- Change the connect-handler test to require the imported `UNKNOWN_ERROR` identifier and reject a quoted literal.
- Add a specific recovery-content assertion for `VARIABLE_SCOPES_MISSING`.
- Add negative fixtures or durable mutation tests proving each forbidden regression turns the relevant test red.

### Acceptance criteria

- A direct `throw REFUSALS.<CODE>(...)` passes.
- Reconstructing or overriding any factory-produced coded error fails the source-use invariant.
- Reintroducing a quoted `UNKNOWN_ERROR` outside its two approved definitions fails CI.
- Weakening `VARIABLE_SCOPES_MISSING` to a non-actionable message fails its recovery test.
- The focused Phase 4 suite and full test suite pass.
