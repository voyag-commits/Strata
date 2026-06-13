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

  "class_c_team_message": JSON.stringify({
    frontmatter: {
      contract_id: "strata.class_c.team_message.v1",
      class: "C",
      message_id: "TM_<assignment>_<sequence>",
      thread_id: "THREAD_<assignment>",
      assignment_id: "<assignment_id>",
      from_role: "Change Author",
      from_id: "change_author_001",
      to_role: "Reviewer / QC Engineer",
      to_id: "reviewer_001",
      message_kind: "qc_review_request",
      status: "open",
      requires_response: true,
      related_class_b: ".strata/context/B/<report>.md",
      created_at: "<ISO-8601>"
    },
    required_sections: ["Message", "Requested Handling"]
  }, null, 2),

  "dispatch_packet": JSON.stringify({
    contract_id: "strata.dispatch.packet.v2_deterministic_context_export",
    dispatch_format: "deterministic_class_c_plus_context_export_v1",
    assignment_id: "<assignment_id>",
    nonce: "<nonce>",
    from: { role: "Change Author", id: "change_author_001" },
    to: { role: "Reviewer / QC Engineer", id: "reviewer_001" },
    class_c_message_path: ".strata/context/C/threads/<thread>/<message>.md",
    context_export: {
      include_classes: ["A", "B"],
      empty_context_valid: true,
      markdown_path: ".strata/context/D_trace/dispatch_packets/<assignment>/<target>/<nonce>/context_export/context.md"
    },
    runtime_delivery: "paste_only_deterministic_envelope_ready",
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
