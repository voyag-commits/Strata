import { resultEnvelope } from "./common.js";

const templates = {
  "worker_return_packet.operational_report_ready": JSON.stringify({
    contract_id: "worker_return_packet.v1",
    return_id: "ret_<assignment>_<role_id>_<timestamp>",
    assignment_id: "<assignment_id>",
    agent_id: "<role_instance_id>",
    role: "Change Author",
    return_kind: "OPERATIONAL_REPORT_READY",
    status: "report_ready_not_class_b_intake",
    summary: "Concise report-ready notice. Class B remains a validated Git file commit.",
    nonce: "<dispatch_nonce>",
    report_scope: "actionable_report",
    implementation_repository: "TEMPLATE_ONLY",
    implementation_commit: null,
    trunk_branch: "main",
    short_lived_branch: null,
    integration_mode: "direct_to_trunk",
    supersedes_entry_id: null,
    message_path: null,
    question_path: null,
    report_path: ".strata/returns/<assignment>/<role_instance>/operational_report.md",
    diagnostic_path: null,
    created_at: "<ISO-8601>"
  }, null, 2),

  "class_b_file": JSON.stringify({
    frontmatter: {
      contract_id: "strata.class_b.file.v1",
      class: "B",
      id: "<class_b_file_id>",
      title: "<title>",
      scope: "actionable_report",
      assignment_id: "<assignment_id>",
      agent_id: "<sender_role_id>",
      role: "Change Author",
      status: "ready",
      evidence: "included",
      loaded_context_epoch: "<loaded_current_class_b_revision>",
      accepted_class_b_revision: "<assigned_by_sctl_on_commit>",
      created_at: "<ISO-8601>",
      accepted_at: "<ISO-8601>"
    },
    required_sections: ["Operational Summary", "Progress Delta", "Trunk Integration", "Verification", "Evidence", "Risks / Blockers", "Next Action"],
    validation: "frontmatter enums, ISO timestamps, numeric context fields, and non-empty sections are enforced"
  }, null, 2),

  "class_b.coordinator_work_order": JSON.stringify({
    template_path: "templates/work_products/coordinator_work_order.template.md",
    contract_id: "strata.class_b.coordinator_work_order.v1",
    class: "B",
    authoring_role: "Coordinator",
    target_role: "Change Author",
    submission_rule: "Coordinator submits this as Class B; SCTL validates and commits it before Change Author dispatch.",
    required_sections: ["Objective", "Required Change Items", "General Work Rules", "Scope", "Codebase Assignment", "Acceptance Criteria", "Validation", "Return Contract", "Evidence Required", "Stop / Escalation Conditions", "Merge / Completion Expectation"]
  }, null, 2),

  "dispatch_packet": JSON.stringify({
    contract_id: "strata.dispatch.packet.v3_context_envelope",
    dispatch_format: "sctl.context_dispatch_envelope.v1",
    envelope_type: "initial_task_coordination | sctl_dispatch",
    assignment_id: "<assignment_id>",
    nonce: "<nonce>",
    from: { role: "SCTL Context Commit Trigger", id: "sctl_context_git" },
    to: { role: "Change Author | Code Reviewer | Coordinator", id: "<target_id>", session: "<target_session_or_null>" },
    pasted_body_metadata_policy: "assignment_id_only",
    canonical_pasted_body: [
      "# Initial task coordination envelope OR # SCTL Dispatch Envelope",
      "assignment_id: <assignment_id>",
      "<fixed role-selected instruction paragraph>",
      "# Below is system level full context picture.",
      "<context export>",
      "# This is the template you use for submission",
      "<role-selected submission/work-product template>"
    ],
    submission_template_selection: {
      initial_coordinator: ["templates/work_products/coordinator_work_order.template.md"],
      change_author: ["templates/packets/worker_return_packet.operational_report_ready.template.json", "templates/reports/operational_report.template.md"],
      reviewer: ["templates/packets/worker_return_packet.operational_report_ready.template.json", "templates/reports/review_outcome.template.md"],
      recurring_coordinator: ["templates/work_products/coordinator_work_order.template.md"]
    },
    runtime_delivery: "paste_only_context_envelope_ready",
    dispatch_to_git_is_primary_evidence: true,
    chatbox_inspection_required: false,
    session_policy: "disposable_by_default"
  }, null, 2),

  "context_freshness_math": JSON.stringify({
    loaded_context_epoch: 7,
    current_class_b_revision: 14,
    calculation: "14-7=7",
    policy: "delta 1-5 exports Class B delta; delta greater than 5 exports full Class A/B context; Class A changes retire session"
  }, null, 2),
};

export function template(name) {
  if (!templates[name]) throw new Error(`unknown template: ${name}`);
  return templates[name];
}
export function listTemplates() { return Object.keys(templates).sort(); }
export function templateEnvelope(name) { return resultEnvelope("sctl.protocol.template.v1", true, { name, template: template(name) }, [], []); }
