import { exists, hasMarkdownHeading, markdownSectionContent, parseSimpleFrontmatter, readText, resultEnvelope, sha256File, workspacePath } from "./common.js";

export const REQUIRED_REPORT_SECTIONS = [
  "Operational Summary",
  "Progress Delta",
  "Trunk Integration",
  "Verification",
  "Evidence",
  "Risks / Blockers",
  "Next Action",
];

function evidenceDefault(input = {}) {
  if (input.evidence === "none_required") return "No evidence required for this report; the operational state is the evidence statement.";
  if (input.evidence && input.evidence !== "included") return input.evidence;
  return "Evidence is included in this report body.";
}

export function defaultOperationalReportBody(input = {}) {
  return [
    `# ${input.title || "Operational Report"}`,
    "",
    "## Operational Summary",
    "",
    input.summary || input.body || "Operational state is recorded for this assignment.",
    "",
    "## Progress Delta",
    "",
    input.progressDelta || "Template progress delta.",
    "",
    "## Trunk Integration",
    "",
    input.trunkIntegration || "Template trunk integration statement.",
    "",
    "## Verification",
    "",
    input.verification || "Template verification statement.",
    "",
    "## Evidence",
    "",
    input.evidenceDetail || input.evidence_detail || evidenceDefault(input),
    "",
    "## Risks / Blockers",
    "",
    input.risks || "No open blocker recorded in this template.",
    "",
    "## Next Action",
    "",
    input.nextAction || "Continue with the next SCTL dispatch.",
    "",
  ].join("\n");
}

export function validateOperationalReportText(text, options = {}) {
  const errors = [];
  for (const section of REQUIRED_REPORT_SECTIONS) {
    if (!hasMarkdownHeading(text, section)) errors.push(`section required: ## ${section}`);
    else if (options.requireNonEmptySections && !markdownSectionContent(text, section).trim()) errors.push(`section must not be empty: ## ${section}`);
  }
  if (options.requireFrontmatter) {
    const parsed = parseSimpleFrontmatter(text);
    if (!parsed.hasFrontmatter) errors.push("frontmatter is required");
  }
  return errors;
}

export function validateOperationalReportFile(root, input = {}) {
  const file = workspacePath(root, input.file || input.path || input.report_path);
  const errors = [];
  if (!file) errors.push("report file is required");
  else if (!exists(file)) errors.push("report file is missing");
  else errors.push(...validateOperationalReportText(readText(file), input));
  return resultEnvelope("sctl.report.validate_operational.v1", errors.length === 0, { file, sha256: file && exists(file) ? sha256File(file) : null }, errors, file && exists(file) ? [file] : []);
}
