import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadRuntimeConfig } from "../config/index.js";
import { ensureContextLayout, fileExists, formatTable, type CommandContext } from "../common.js";

export interface DoctorCheck {
  name: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
}

export interface DoctorResult {
  overall: "PASS" | "WARN" | "FAIL";
  checks: DoctorCheck[];
  text: string;
}

function runVersion(command: string, args: string[]): string | null {
  try {
    if (process.platform === "win32" && !command.includes("\\") && !command.includes("/")) {
      return execFileSync("cmd.exe", ["/d", "/s", "/c", command, ...args], { encoding: "utf8" }).trim();
    }
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function checkBridgeHealth(port: number): Promise<DoctorCheck> {
  const url = `http://127.0.0.1:${port}/health`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { name: "bridge health", status: "WARN", detail: `HTTP ${response.status}` };
    }
    return { name: "bridge health", status: "PASS", detail: `Bridge responded on ${url}` };
  } catch {
    return { name: "bridge health", status: "WARN", detail: "Bridge is not running on the expected local port." };
  }
}

function checkWritePermission(targetDir: string): DoctorCheck {
  const probe = path.join(targetDir, `.doctor-write-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return { name: "write permissions", status: "PASS", detail: `Writable: ${targetDir}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name: "write permissions", status: "FAIL", detail: message };
  }
}

export async function runDoctor(context: CommandContext): Promise<DoctorResult> {
  const runtimeConfig = loadRuntimeConfig(context.projectRoot);
  const layout = ensureContextLayout(context.workspaceRoot);
  const checks: DoctorCheck[] = [];
  const nodeVersion = runVersion("node", ["-v"]);
  checks.push({
    name: "node",
    status: nodeVersion ? "PASS" : "FAIL",
    detail: nodeVersion ?? "Node.js not found in PATH.",
  });
  const npmVersion = runVersion("npm", ["-v"]);
  checks.push({
    name: "npm",
    status: npmVersion ? "PASS" : "FAIL",
    detail: npmVersion ?? "npm not found in PATH.",
  });
  const codexVersion = runtimeConfig.codexExe ? runVersion(runtimeConfig.codexExe, ["--version"]) : null;
  checks.push({
    name: "codex cli",
    status: codexVersion ? "PASS" : "FAIL",
    detail: codexVersion ?? `Codex CLI not available at ${runtimeConfig.codexExe}.`,
  });
  checks.push({
    name: "codex config path",
    status: fileExists(runtimeConfig.codexConfigPath) ? "PASS" : "WARN",
    detail: runtimeConfig.codexConfigPath,
  });
  checks.push({
    name: "model/provider config",
    status: runtimeConfig.model && runtimeConfig.modelProvider && runtimeConfig.modelReasoningEffort ? "PASS" : "FAIL",
    detail: `provider=${runtimeConfig.modelProvider}; model=${runtimeConfig.model}; effort=${runtimeConfig.modelReasoningEffort}; bridge=${runtimeConfig.bridgeBaseUrl}`,
  });
  checks.push({
    name: "workspace folders",
    status: fileExists(layout.assignments) && fileExists(layout.results) && fileExists(layout.appserverEvents) ? "PASS" : "FAIL",
    detail: "Verified required A/B/C/D folders.",
  });
  checks.push(checkWritePermission(layout.root));
  checks.push(await checkBridgeHealth(runtimeConfig.bridgePort));
  const overall: DoctorResult["overall"] = checks.some((item) => item.status === "FAIL")
    ? "FAIL"
    : checks.some((item) => item.status === "WARN")
      ? "WARN"
      : "PASS";
  const rows = [["check", "status", "detail"], ...checks.map((item) => [item.name, item.status, item.detail])];
  return {
    overall,
    checks,
    text: `Overall: ${overall}\n\n${formatTable(rows)}`,
  };
}
