// Barrel re-export for backward compatibility.
// All original notice-render logic moved to dispatch_notice_legacy.ts.
// The new contract-native dispatch-deliver logic lives in contract_delegate.ts.
// @deprecated Use contract_delegate.ts deliverDispatchPacket() for ADR_06_18 SCTL integration path.

export {
  type RuntimeEdgeNotice,
  type InjectNoticeResult,
  validateNotice,
  renderBoundedNotice,
  injectNotice,
} from "./dispatch_notice_legacy.js";
