#!/usr/bin/env node
import path from "node:path";
import { createRuntimeContext, readJson, resolveWorkspacePath, writeJson } from "./common.js";
import { injectNotice, renderBoundedNotice, validateNotice } from "./dispatch_edge.js";
import { providerDoctor, writeLauncherDelegateTemplate } from "./provider.js";
import { captureSession, launchSession, listSessionRecords, sessionNameFor, terminateSession } from "./runtime.js";

interface ParsedArgs { positionals: string[]; flags: Record<string, string | boolean> }

function parse(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) { positionals.push(item); continue; }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) flags[key] = true;
    else { flags[key] = next; i += 1; }
  }
  return { positionals, flags };
}

function opt(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
function req(flags: Record<string, string | boolean>, key: string): string {
  const value = opt(flags, key);
  if (!value) throw new Error(`Missing --${key}.`);
  return value;
}
function bool(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true || flags[key] === "true";
}
function num(flags: Record<string, string | boolean>, key: string): number | undefined {
  const value = opt(flags, key);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number`);
  return parsed;
}
function splitExtra(flags: Record<string, string | boolean>): string[] {
  const value = opt(flags, "extra-args");
  if (!value) return [];
  return value.split(" ").filter(Boolean);
}
function emit(value: unknown): void {
  if (typeof value === "string") { console.log(value); return; }
  console.log(JSON.stringify(value, null, 2));
  if (value && typeof value === "object" && "ok" in value && (value as { ok?: unknown }).ok === false) process.exitCode = 1;
}
function help(): string {
  return [
    "Strata Runtime Edge Launcher Delegate",
    "",
    "Professional pattern: launcher delegate / BYOR runtime provider / adapter stub.",
    "This package exposes stable Strata commands but delegates real Codex/DeepSeek startup to your local launcher.",
    "",
    "Usage:",
    "  strata-runtime-edge provider init-template [--out .strata-runtime/config/launcher_delegate.local.json]",
    "  strata-runtime-edge provider doctor [--config path] [--skip-healthcheck]",
    "  strata-runtime-edge session name --role coder --assignment-id A001",
    "  strata-runtime-edge session launch --role coder --assignment-id A001 [--config path] [--replace] [--extra-args \"...\"]",
    "  strata-runtime-edge session list",
    "  strata-runtime-edge session capture --session STRATA-CODER-A001",
    "  strata-runtime-edge session terminate --session STRATA-CODER-A001",
    "  strata-runtime-edge dispatch render --notice notice.json [--max-bytes 3900]",
    "  strata-runtime-edge dispatch inject --notice notice.json [--session STRATA-IC-A001] [--dry-run] [--no-submit]",
    "",
    "Secret rule: no API key belongs in this package. Keep secrets inside your existing launcher/provider.",
  ].join("\n");
}

async function main(): Promise<void> {
  const parsed = parse(process.argv.slice(2));
  if (!parsed.positionals.length || parsed.flags.help || parsed.positionals.includes("help")) { console.log(help()); return; }
  const ctx = createRuntimeContext(process.cwd(), opt(parsed.flags, "workspace") ?? process.cwd());
  const [a, b] = parsed.positionals;
  if (a === "provider" && b === "init-template") return emit({ ok: true, config_path: writeLauncherDelegateTemplate(ctx, opt(parsed.flags, "out")) });
  if (a === "provider" && b === "doctor") return emit(providerDoctor(ctx, opt(parsed.flags, "config"), bool(parsed.flags, "skip-healthcheck")));
  if (a === "session" && b === "name") return emit({ session_name: sessionNameFor(req(parsed.flags, "role"), req(parsed.flags, "assignment-id")) });
  if (a === "session" && b === "launch") return emit(launchSession(ctx, { role: req(parsed.flags, "role"), assignmentId: req(parsed.flags, "assignment-id"), workerId: opt(parsed.flags, "worker-id"), sessionName: opt(parsed.flags, "session"), configPath: opt(parsed.flags, "config"), replace: bool(parsed.flags, "replace"), extraArgs: splitExtra(parsed.flags) }));
  if (a === "session" && b === "list") return emit({ contract_id: "strata.runtime_edge.session_list.v1", sessions: listSessionRecords(ctx) });
  if (a === "session" && b === "capture") return emit(captureSession(ctx, req(parsed.flags, "session")));
  if (a === "session" && b === "terminate") return emit(terminateSession(ctx, req(parsed.flags, "session")));
  if (a === "dispatch" && b === "render") {
    const notice = validateNotice(readJson<unknown>(resolveWorkspacePath(ctx, req(parsed.flags, "notice"))));
    return emit(renderBoundedNotice(notice, num(parsed.flags, "max-bytes") ?? 3900));
  }
  if (a === "dispatch" && b === "inject") return emit(injectNotice(ctx, { noticePath: req(parsed.flags, "notice"), sessionName: opt(parsed.flags, "session"), dryRun: bool(parsed.flags, "dry-run"), submit: !bool(parsed.flags, "no-submit"), maxBytes: num(parsed.flags, "max-bytes") }));
  console.error(`Unknown command: ${parsed.positionals.join(" ")}`);
  console.log(help());
  process.exitCode = 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
