/**
 * Shared batch-result derivation for the four D7 aggregators
 * (`node_delete`, `text_set_content`, `annotation_set`, `instance_set_overrides`).
 *
 * One formula for the tri-state `status` and the derived boolean so the four
 * handlers cannot drift (ratification 4, review P6-12): the invariant
 * `success === (status === "success")` holds by construction. Per D7:
 *   succeeded > 0 && failed === 0 && skipped === 0  ⇒ "success"
 *   succeeded > 0 (with any failed/skipped)          ⇒ "partial_success"
 *   succeeded === 0                                  ⇒ "failed"
 */
export type BatchStatus = "success" | "partial_success" | "failed";

export function deriveBatchStatus(succeeded: number, failed: number, skipped: number): BatchStatus {
    if (succeeded > 0 && failed === 0 && skipped === 0) return "success";
    if (succeeded > 0) return "partial_success";
    return "failed";
}

/**
 * Builds the shared envelope counts + derived status/success (Q26: only the
 * shared count vocabulary — no tool-specific duplicate counts). Spread the
 * result into each aggregator's return alongside `results` and any genuinely
 * tool-specific non-count fields (e.g. `commandId`).
 */
export function batchEnvelope(requested: number, succeeded: number, failed: number, skipped: number) {
    const status = deriveBatchStatus(succeeded, failed, skipped);
    return {
        success: status === "success",
        status,
        requestedCount: requested,
        succeededCount: succeeded,
        failedCount: failed,
        skippedCount: skipped,
    };
}
