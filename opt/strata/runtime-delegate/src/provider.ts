import fs from "node:fs";
import path from "node:path";
import { exists, fileStamp, iso, layoutFor, readJson, runCommand, safePart, type CommandResult, type RuntimeContext, writeJson } from "./common.js";

export type LauncherDelegateMode = "exec" | "shell" | "windows_shortcut";

export interface LauncherDelegateConfig {
  contract_id: "strata.runtime_edge.launcher_delegate_config.v1";
  provider_name: string;
  mode: LauncherDelegateMode;
  launcher_command: string;
  launcher_args: string[];
  working_directory: string | null;
  healthcheck_args: string[];
  env_passthrough: string[];
  secret_policy: "externalized_no_secret_material_in_package";
  notes?: string;
}

export interface ResolvedLauncherCommand {
  mode: LauncherDelegateMode;
  command: string;
  args: string[];
  cwd: string | undefined;
  human_readable_command: string;
}

export interface ProviderDoctorResult {
  contract_id: "strata.runtime_edge.provider_doctor.v1";
  ok: boolean;
  checked_at: string;
  config_path: string;
  config: Omit<LauncherDelegateConfig, "launcher_args" | "healthcheck_args"> & { launcher_args_count: number; healthcheck_args_count: number };
  resolved: ResolvedLauncherCommand;
  healthcheck: CommandResult | null;
  evidence_path: string;
}

function validateStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${key} must be string[]`);
  return value;
}

function validateMode(value: unknown): LauncherDelegateMode {
  if (value === "exec" || value === "shell" || value === "windows_shortcut") return value;
  throw new Error("mode must be exec, shell, or windows_shortcut");
}

export function validateLauncherDelegateConfig(raw: unknown): LauncherDelegateConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("delegate config must be a JSON object");
  const obj = raw as Record<string, unknown>;
  if (obj.contract_id !== "strata.runtime_edge.launcher_delegate_config.v1") throw new Error("contract_id must be strata.runtime_edge.launcher_delegate_config.v1");
  const providerName = typeof obj.provider_name === "string" && obj.provider_name.trim() ? obj.provider_name : "local_launcher_delegate";
  const launcherCommand = typeof obj.launcher_command === "string" && obj.launcher_command.trim() ? obj.launcher_command : null;
  if (!launcherCommand) throw new Error("launcher_command must be a non-empty string");
  const workingDirectory = obj.working_directory == null ? null : (typeof obj.working_directory === "string" ? obj.working_directory : null);
  if (obj.working_directory != null && workingDirectory == null) throw new Error("working_directory must be string or null");
  if (obj.secret_policy !== "externalized_no_secret_material_in_package") throw new Error("secret_policy must be externalized_no_secret_material_in_package");
  return {
    contract_id: "strata.runtime_edge.launcher_delegate_config.v1",
    provider_name: providerName,
    mode: validateMode(obj.mode),
    launcher_command: launcherCommand,
    launcher_args: validateStringArray(obj.launcher_args ?? [], "launcher_args"),
    working_directory: workingDirectory,
    healthcheck_args: validateStringArray(obj.healthcheck_args ?? [], "healthcheck_args"),
    env_passthrough: validateStringArray(obj.env_passthrough ?? ["PATH", "HOME", "USER", "WSL_DISTRO_NAME"], "env_passthrough"),
    secret_policy: "externalized_no_secret_material_in_package",
    notes: typeof obj.notes === "string" ? obj.notes : undefined,
  };
}

export function defaultConfigPath(ctx: RuntimeContext): string {
  return path.join(layoutFor(ctx.workspaceRoot).config, "launcher_delegate.local.json");
}

export function readLauncherDelegateConfig(ctx: RuntimeContext, configPath?: string | null): { config: LauncherDelegateConfig; path: string } {
  const resolvedPath = configPath ? (path.isAbsolute(configPath) ? configPath : path.resolve(ctx.workspaceRoot, configPath)) : defaultConfigPath(ctx);
  return { config: validateLauncherDelegateConfig(readJson<unknown>(resolvedPath)), path: resolvedPath };
}

export function writeLauncherDelegateTemplate(ctx: RuntimeContext, outPath?: string | null): string {
  const target = outPath ? (path.isAbsolute(outPath) ? outPath : path.resolve(ctx.workspaceRoot, outPath)) : defaultConfigPath(ctx);
  const template: LauncherDelegateConfig = {
    contract_id: "strata.runtime_edge.launcher_delegate_config.v1",
    provider_name: "local_codex_deepseek_launcher",
    mode: "exec",
    launcher_command: "strata-codex-local",
    launcher_args: [],
    working_directory: null,
    healthcheck_args: ["--version"],
    env_passthrough: ["PATH", "HOME", "USER", "WSL_DISTRO_NAME"],
    secret_policy: "externalized_no_secret_material_in_package",
    notes: "Replace launcher_command with your already-working WSL command or use mode=windows_shortcut for a Windows desktop shortcut path. Do not put API keys in this file.",
  };
  return writeJson(target, template);
}

export function resolveLauncherCommand(ctx: RuntimeContext, config: LauncherDelegateConfig, extraArgs: string[] = []): ResolvedLauncherCommand {
  const cwd = config.working_directory ? (path.isAbsolute(config.working_directory) ? config.working_directory : path.resolve(ctx.workspaceRoot, config.working_directory)) : undefined;
  if (config.mode === "exec") {
    const args = [...config.launcher_args, ...extraArgs];
    return { mode: config.mode, command: config.launcher_command, args, cwd, human_readable_command: [config.launcher_command, ...args].join(" ") };
  }
  if (config.mode === "shell") {
    const commandLine = [config.launcher_command, ...config.launcher_args, ...extraArgs].join(" ");
    return { mode: config.mode, command: "bash", args: ["-lc", commandLine], cwd, human_readable_command: commandLine };
  }
  const commandLine = `start "" "${config.launcher_command}" ${[...config.launcher_args, ...extraArgs].join(" ")}`.trim();
  return { mode: config.mode, command: "cmd.exe", args: ["/c", commandLine], cwd, human_readable_command: `cmd.exe /c ${commandLine}` };
}

export function providerDoctor(ctx: RuntimeContext, configPath?: string | null, skipHealthcheck = false): ProviderDoctorResult {
  const layout = layoutFor(ctx.workspaceRoot);
  const { config, path: resolvedConfigPath } = readLauncherDelegateConfig(ctx, configPath);
  const resolved = resolveLauncherCommand(ctx, config, config.healthcheck_args);
  let healthcheck: CommandResult | null = null;
  if (!skipHealthcheck) {
    healthcheck = runCommand(resolved.command, resolved.args, { cwd: resolved.cwd, encoding: "utf8" });
  }
  const ok = exists(resolvedConfigPath) && (skipHealthcheck || Boolean(healthcheck?.ok));
  const evidencePath = path.join(layout.providerChecks, `provider_doctor_${safePart(config.provider_name)}_${fileStamp(ctx.now)}.json`);
  const result: ProviderDoctorResult = {
    contract_id: "strata.runtime_edge.provider_doctor.v1",
    ok,
    checked_at: iso(ctx.now),
    config_path: resolvedConfigPath,
    config: {
      contract_id: config.contract_id,
      provider_name: config.provider_name,
      mode: config.mode,
      launcher_command: config.launcher_command,
      launcher_args_count: config.launcher_args.length,
      working_directory: config.working_directory,
      healthcheck_args_count: config.healthcheck_args.length,
      env_passthrough: config.env_passthrough,
      secret_policy: config.secret_policy,
      notes: config.notes,
    },
    resolved,
    healthcheck,
    evidence_path: evidencePath,
  };
  writeJson(evidencePath, result);
  return result;
}

export function commandExistsForExecMode(command: string): boolean {
  if (command.includes("/") || command.includes("\\")) return fs.existsSync(command);
  const result = runCommand("bash", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`]);
  return result.ok;
}
