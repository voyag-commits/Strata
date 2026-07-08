// ADR_06_18 Runtime Session Delegate normalized surface.
// SCTL owns validation, commits, context export, envelope rendering, metadata logs,
// return ingestion, and cycle progression. This package controls runtime endpoints only.
export class ContractError extends Error {
    errorCode;
    recoverable;
    evidencePath;
    constructor(errorCode, message, recoverable = true, evidencePath) {
        super(message);
        this.name = "ContractError";
        this.errorCode = errorCode;
        this.recoverable = recoverable;
        this.evidencePath = evidencePath;
    }
}
export function failureResult(error) {
    return {
        ok: false,
        error_code: error.errorCode,
        message: error.message,
        evidence_path: error.evidencePath ?? null,
        recoverable: error.recoverable,
    };
}
export const PACKET_CONTRACT_ID = "strata.dispatch.packet.v3_context_envelope";
