import { resultEnvelope } from "./common.js";

export const TOOLS = [
  { tool_id: "sctl.context.bootstrap.v1", component: "1", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.context.repo_status.v1", component: "1", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.context.put.v1", component: "1", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.context.export_markdown.v2", component: "1", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.context.freshness.v1", component: "1", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.classb.put_file.v2", component: "1", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.classb.validate_file.v2", component: "1", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.classb.commit_file.v2", component: "1", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.message.send.v1", component: "3", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.message.validate.v1", component: "3", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.sessions.register.v1", component: "3", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.sessions.retire.v1", component: "3", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.sessions.list.v1", component: "3", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.dispatch.record.v3", component: "3", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.dispatch.record_injection.v1", component: "3", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.returns.classify.v1", component: "4", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.fixtures.list_scenes.v1", component: "4", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.fixtures.run_scene.v1", component: "4", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.protocol.template.v1", component: "4", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false },
  { tool_id: "sctl.secret_scan.v1", component: "1", operator_role: "Tooling / Dispatch Operator", runtime_tmux: false, watches_implementation_git: false }
];

export function listTools() { return resultEnvelope("sctl.tools.list.v1", true, { tools: TOOLS }, [], []); }
export function inspectTool(toolId) {
  const tool = TOOLS.find((x) => x.tool_id === toolId);
  return resultEnvelope("sctl.tools.inspect.v1", Boolean(tool), { tool: tool || null }, tool ? [] : [`unknown tool: ${toolId}`], []);
}
