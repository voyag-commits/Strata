#!/usr/bin/env node
import { createRuntimeContext, readJson, resolveWorkspacePath } from "./common.js";
import { injectNotice, renderBoundedNotice, validateNotice } from "./dispatch_edge.js";
import { providerDoctor, writeLauncherDelegateTemplate } from "./provider.js";
import { captureSession, launchSession, listSessionRecords, sessionNameFor, terminateSession } from "./runtime.js";
import { captureRegisteredSession, createSession, deliverDispatchPacket, dropReturnFiles, listRegisteredSessions, registerSession, reportReturnDir, terminateRegisteredSession, } from "./contract_delegate.js";
import { ContractError, failureResult } from "./contract_shapes.js";
function setFlag(flags, key, value) {
    const prior = flags[key];
    if (prior === undefined)
        flags[key] = value;
    else if (Array.isArray(prior))
        prior.push(String(value));
    else
        flags[key] = [String(prior), String(value)];
}
function parse(argv) {
    const positionals = [];
    const flags = {};
    for (let i = 0; i < argv.length; i += 1) {
        const item = argv[i];
        if (!item.startsWith("--")) {
            positionals.push(item);
            continue;
        }
        const key = item.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith("--"))
            setFlag(flags, key, true);
        else {
            setFlag(flags, key, next);
            i += 1;
        }
    }
    return { positionals, flags };
}
function opt(flags, key) {
    const value = flags[key];
    if (Array.isArray(value))
        return value.length ? value[value.length - 1] : undefined;
    return typeof value === "string" && value.trim() ? value : undefined;
}
function opts(flags, key) {
    const value = flags[key];
    if (Array.isArray(value))
        return value.filter((x) => x.trim());
    if (typeof value === "string" && value.trim())
        return [value];
    return [];
}
function req(flags, key) {
    const value = opt(flags, key);
    if (!value)
        throw new ContractError("MISSING_ARGUMENT", `Missing --${key}.`, true);
    return value;
}
function bool(flags, key) {
    const value = flags[key];
    return value === true || value === "true" || (Array.isArray(value) && value.includes("true"));
}
function num(flags, key) {
    const value = opt(flags, key);
    if (!value)
        return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        throw new ContractError("INVALID_ARGUMENT", `--${key} must be a number`, true);
    return parsed;
}
function splitExtra(flags) {
    const value = opt(flags, "extra-args");
    if (!value)
        return [];
    return value.split(" ").filter(Boolean);
}
function retirePolicy(flags, fallback) {
    const value = opt(flags, "retire-policy") ?? fallback;
    if (!value)
        return undefined;
    if (value === "kill-session" || value === "kill-pane" || value === "send-exit-then-kill" || value === "explicit-only")
        return value;
    throw new ContractError("INVALID_ARGUMENT", "--retire-policy must be kill-session, kill-pane, send-exit-then-kill, or explicit-only", true);
}
function emit(value) {
    if (typeof value === "string") {
        console.log(value);
        return;
    }
    console.log(JSON.stringify(value, null, 2));
    if (value && typeof value === "object" && "ok" in value && value.ok === false)
        process.exitCode = 1;
}
function help() {
    return [
        "Strata Runtime Edge Delegate Control Surface",
        "",
        "ADR_06_26 contract path:",
        "  strata-runtime-edge delegate session-register --assignment-id A001 --cycle-id CYCLE_001 --role \"Delegated Coordinator\" --session-id delegated_coordinator_001 --tmux-target STRATA-DESKTOP-0625-104113:0.0 [--workspace path] [--retire-policy explicit-only|kill-session]",
        "  strata-runtime-edge delegate session-create --assignment-id A001 --cycle-id CYCLE_001 --role \"Change Author\" --session-id change_author_001 [--config path] [--replace] [--resolve-existing] [--extra-args \"...\"]",
        "  strata-runtime-edge delegate dispatch-deliver --session-id delegated_coordinator_001 --packet dispatch_packet.md [--dispatch-log path] [--no-submit] [--workspace path]",
        "  strata-runtime-edge delegate return-drop --assignment-id A001 --session-id delegated_coordinator_001 --file packet.json --file operational_report.md [--workspace path]",
        "  strata-runtime-edge delegate return-dir --assignment-id A001 --session-id delegated_coordinator_001 [--workspace path]",
        "  strata-runtime-edge delegate session-capture --session-id delegated_coordinator_001 [--lines 80] [--workspace path]",
        "  strata-runtime-edge delegate session-terminate --session-id delegated_coordinator_001 [--retire-policy explicit-only|kill-session] [--workspace path]",
        "  strata-runtime-edge delegate session-list [--workspace path]",
        "",
        "Provider/config:",
        "  strata-runtime-edge provider init-template [--out .strata-runtime/config/launcher_delegate.local.json]",
        "  strata-runtime-edge provider doctor [--config path] [--skip-healthcheck]",
        "",
        "Legacy utilities, not ADR_06_18 canonical dispatch path:",
        "  strata-runtime-edge dispatch render --notice notice.json [--max-bytes 3900]",
        "  strata-runtime-edge dispatch inject --notice notice.json [--session STRATA-IC-A001] [--dry-run] [--no-submit]",
    ].join("\n");
}
async function main() {
    try {
        const parsed = parse(process.argv.slice(2));
        if (!parsed.positionals.length || parsed.flags.help || parsed.positionals.includes("help")) {
            console.log(help());
            return;
        }
        const ctx = createRuntimeContext(process.cwd(), opt(parsed.flags, "workspace") ?? process.cwd());
        const [a, b] = parsed.positionals;
        if (a === "delegate" && b === "session-register")
            return emit(registerSession(ctx, {
                assignmentId: req(parsed.flags, "assignment-id"),
                cycleId: opt(parsed.flags, "cycle-id") ?? null,
                role: req(parsed.flags, "role"),
                sessionId: req(parsed.flags, "session-id"),
                tmuxTarget: req(parsed.flags, "tmux-target"),
                sessionMode: opt(parsed.flags, "session-mode") ?? "existing_wsl_tmux",
                runtime: opt(parsed.flags, "runtime") ?? "tmux_codex_cli",
                retirePolicy: retirePolicy(parsed.flags, "kill-session"),
            }));
        if (a === "delegate" && b === "session-create")
            return emit(createSession(ctx, {
                assignmentId: req(parsed.flags, "assignment-id"),
                cycleId: opt(parsed.flags, "cycle-id") ?? null,
                role: req(parsed.flags, "role"),
                sessionId: req(parsed.flags, "session-id"),
                sessionMode: opt(parsed.flags, "session-mode") ?? "live_tmux",
                configPath: opt(parsed.flags, "config"),
                replace: bool(parsed.flags, "replace"),
                extraArgs: splitExtra(parsed.flags),
                resolveExisting: bool(parsed.flags, "resolve-existing"),
                runtime: opt(parsed.flags, "runtime") ?? "tmux_codex_cli",
                retirePolicy: retirePolicy(parsed.flags, "kill-session"),
            }));
        if (a === "delegate" && b === "dispatch-deliver")
            return emit(deliverDispatchPacket(ctx, {
                sessionId: req(parsed.flags, "session-id"),
                packetPath: opt(parsed.flags, "packet") ?? req(parsed.flags, "dispatch-packet"),
                dispatchLogPath: opt(parsed.flags, "dispatch-log") ?? null,
                submit: !bool(parsed.flags, "no-submit"),
            }));
        if (a === "delegate" && b === "return-drop")
            return emit(dropReturnFiles(ctx, {
                assignmentId: req(parsed.flags, "assignment-id"),
                sessionId: req(parsed.flags, "session-id"),
                files: opts(parsed.flags, "file").length ? opts(parsed.flags, "file") : [req(parsed.flags, "source")],
            }));
        if (a === "delegate" && b === "return-dir")
            return emit(reportReturnDir(ctx, {
                assignmentId: req(parsed.flags, "assignment-id"),
                sessionId: req(parsed.flags, "session-id"),
            }));
        if (a === "delegate" && b === "session-capture")
            return emit(captureRegisteredSession(ctx, {
                sessionId: req(parsed.flags, "session-id"),
                lines: num(parsed.flags, "lines") ?? 200,
            }));
        if (a === "delegate" && b === "session-terminate")
            return emit(terminateRegisteredSession(ctx, {
                sessionId: req(parsed.flags, "session-id"),
                retirePolicy: retirePolicy(parsed.flags),
            }));
        if (a === "delegate" && b === "session-list")
            return emit(listRegisteredSessions(ctx));
        if (a === "provider" && b === "init-template")
            return emit({ ok: true, config_path: writeLauncherDelegateTemplate(ctx, opt(parsed.flags, "out")) });
        if (a === "provider" && b === "doctor")
            return emit(providerDoctor(ctx, opt(parsed.flags, "config"), bool(parsed.flags, "skip-healthcheck")));
        if (a === "session" && b === "name")
            return emit({ session_name: sessionNameFor(req(parsed.flags, "role"), req(parsed.flags, "assignment-id"), opt(parsed.flags, "session-id")) });
        if (a === "session" && b === "launch")
            return emit(launchSession(ctx, { role: req(parsed.flags, "role"), assignmentId: req(parsed.flags, "assignment-id"), sessionId: opt(parsed.flags, "session-id"), workerId: opt(parsed.flags, "worker-id"), sessionName: opt(parsed.flags, "session"), configPath: opt(parsed.flags, "config"), replace: bool(parsed.flags, "replace"), extraArgs: splitExtra(parsed.flags) }));
        if (a === "session" && b === "list")
            return emit({ contract_id: "strata.runtime_edge.session_list.v1", sessions: listSessionRecords(ctx) });
        if (a === "session" && b === "capture")
            return emit(captureSession(ctx, req(parsed.flags, "session")));
        if (a === "session" && b === "terminate")
            return emit(terminateSession(ctx, req(parsed.flags, "session")));
        if (a === "dispatch" && b === "render") {
            const notice = validateNotice(readJson(resolveWorkspacePath(ctx, req(parsed.flags, "notice"))));
            return emit(renderBoundedNotice(notice, num(parsed.flags, "max-bytes") ?? 3900));
        }
        if (a === "dispatch" && b === "inject")
            return emit(injectNotice(ctx, { noticePath: req(parsed.flags, "notice"), sessionName: opt(parsed.flags, "session"), dryRun: bool(parsed.flags, "dry-run"), submit: !bool(parsed.flags, "no-submit"), maxBytes: num(parsed.flags, "max-bytes") }));
        throw new ContractError("UNKNOWN_COMMAND", `Unknown command: ${parsed.positionals.join(" ")}`, true);
    }
    catch (error) {
        if (error instanceof ContractError)
            emit(failureResult(error));
        else
            emit(failureResult(new ContractError("INTERNAL_ERROR", error instanceof Error ? error.message : String(error), false)));
    }
}
main();
