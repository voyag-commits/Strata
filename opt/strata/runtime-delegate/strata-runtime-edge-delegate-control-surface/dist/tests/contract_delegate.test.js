import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRuntimeContext, readJson, readText, sha256Text, writeJson, writeText } from "../src/common.js";
import { injectNotice, renderBoundedNotice } from "../src/dispatch_edge.js";
import { providerDoctor, validateLauncherDelegateConfig, writeLauncherDelegateTemplate } from "../src/provider.js";
import { captureRegisteredSession, deliverDispatchPacket, dropReturnFiles, listRegisteredSessions, registerSession, reportReturnDir, terminateRegisteredSession, } from "../src/contract_delegate.js";
import { ContractError, failureResult } from "../src/contract_shapes.js";
function tempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "strata-delegate-contract-"));
}
function installFakeTmux(root) {
    const binDir = path.join(root, "fakebin");
    fs.mkdirSync(binDir, { recursive: true });
    const pastePath = path.join(root, "pasted.txt");
    const logPath = path.join(root, "tmux.log");
    const bufferPath = path.join(root, "tmux-buffer.txt");
    const tmuxPath = path.join(binDir, "tmux");
    const script = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        `PASTE=${JSON.stringify(pastePath)}`,
        `LOG=${JSON.stringify(logPath)}`,
        `BUFFER=${JSON.stringify(bufferPath)}`,
        "cmd=\"${1:-}\"; shift || true",
        "case \"$cmd\" in",
        "  -V) echo 'tmux 3.4';;",
        "  display-message)",
        "    printf 'session=STRATA-DESKTOP-0625-104113\\twindow=0\\tpane=0\\tpane_id=%%0\\tcmd=node\\tcwd=/wsl/workspace\\ttitle=Codex-TUI\\n';;",
        "  has-session) exit 0;;",
        "  load-buffer)",
        "    file=\"${@: -1}\"",
        "    cp \"$file\" \"$BUFFER\"",
        "    echo load-buffer >> \"$LOG\";;",
        "  show-buffer) cat \"$BUFFER\";;",
        "  paste-buffer)",
        "    cat \"$BUFFER\" >> \"$PASTE\"",
        "    echo paste-buffer >> \"$LOG\";;",
        "  delete-buffer) echo delete-buffer >> \"$LOG\";;",
        "  send-keys) echo \"send-keys $*\" >> \"$LOG\";;",
        "  capture-pane) echo 'Codex-TUI active capture: ready for dispatch';;",
        "  kill-session) echo \"kill-session $*\" >> \"$LOG\";;",
        "  kill-pane) echo \"kill-pane $*\" >> \"$LOG\";;",
        "  new-session) echo new-session >> \"$LOG\";;",
        "  set-option|rename-window) echo \"$cmd $*\" >> \"$LOG\";;",
        "  *) echo \"unsupported fake tmux command: $cmd $*\" >&2; exit 2;;",
        "esac",
        "",
    ].join("\n");
    fs.writeFileSync(tmuxPath, script, { mode: 0o755 });
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;
    return { bin: tmuxPath, pastePath, logPath };
}
function sampleNotice() {
    return {
        contract_id: "strata.runtime_edge_notice.v1",
        commit_sha: "abc123",
        changed_files: ["class_b/entries/B-1.md"],
        report_id: "report-1",
        assignment_id: "A001",
        worker_id: "coder_001",
        nonce: "STRATA_NONCE_A001_001",
        suggested_command_options: ["strata context export-markdown"],
        target_session: "STRATA-IC-A001",
    };
}
test("provider template externalizes secrets", () => {
    const root = tempRoot();
    const ctx = createRuntimeContext(process.cwd(), root);
    const configPath = writeLauncherDelegateTemplate(ctx);
    const config = readJson(configPath);
    assert.equal(config.contract_id, "strata.runtime_edge.launcher_delegate_config.v1");
    assert.equal(config.secret_policy, "externalized_no_secret_material_in_package");
    assert.doesNotMatch(JSON.stringify(config), /api[_-]?key|sk-[A-Za-z0-9_-]{8,}/i);
});
test("provider doctor can call a local mock launcher", () => {
    const root = tempRoot();
    const launcher = path.join(root, "mock-strata-codex.sh");
    fs.writeFileSync(launcher, "#!/usr/bin/env bash\necho MOCK_STRATA_CODEX_LAUNCHER $@\n", { mode: 0o755 });
    const configPath = path.join(root, ".strata-runtime", "config", "launcher_delegate.local.json");
    writeJson(configPath, {
        contract_id: "strata.runtime_edge.launcher_delegate_config.v1",
        provider_name: "mock_local_launcher",
        mode: "exec",
        launcher_command: launcher,
        launcher_args: [],
        working_directory: null,
        healthcheck_args: ["--version"],
        env_passthrough: ["PATH"],
        secret_policy: "externalized_no_secret_material_in_package",
    });
    const ctx = createRuntimeContext(process.cwd(), root);
    const result = providerDoctor(ctx, configPath);
    assert.equal(result.ok, true);
    assert.match(result.healthcheck?.stdout ?? "", /MOCK_STRATA_CODEX_LAUNCHER/);
});
test("legacy notice injection dry-run remains available but deprecated", () => {
    const root = tempRoot();
    const noticePath = path.join(root, "notice.json");
    writeJson(noticePath, sampleNotice());
    const ctx = createRuntimeContext(process.cwd(), root);
    const result = injectNotice(ctx, { noticePath, dryRun: true });
    assert.equal(result.ok, true);
    assert.equal(result.dry_run, true);
    assert.ok(fs.existsSync(result.message_path));
    assert.match(renderBoundedNotice(sampleNotice()), /IC owns interpretation/);
});
test("session-register writes contract binding for existing WSL tmux Codex target", () => {
    const root = tempRoot();
    installFakeTmux(root);
    const ctx = createRuntimeContext(process.cwd(), root);
    const result = registerSession(ctx, {
        assignmentId: "A_FLOWMAP_02_LIVE_DEFAULT_001",
        cycleId: "CYCLE_001",
        role: "Delegated Coordinator",
        sessionId: "delegated_coordinator_001",
        tmuxTarget: "STRATA-DESKTOP-0625-104113:0.0",
    });
    assert.equal(result.ok, true);
    assert.equal(result.operation, "session_register");
    assert.equal(result.runtime, "tmux_codex_cli");
    assert.equal(result.tmux_session_name, "STRATA-DESKTOP-0625-104113");
    assert.equal(result.tmux_pane_id, "%0");
    assert.equal(result.return_dir, ".strata/returns/A_FLOWMAP_02_LIVE_DEFAULT_001/delegated_coordinator_001");
    const bindingPath = path.join(root, ".strata-runtime", "session_bindings", "delegated_coordinator_001.json");
    assert.ok(fs.existsSync(bindingPath));
});
test("dispatch-deliver resolves session binding and pastes exact packet", () => {
    const root = tempRoot();
    const fake = installFakeTmux(root);
    const ctx = createRuntimeContext(process.cwd(), root);
    registerSession(ctx, { assignmentId: "A001", cycleId: "CYCLE_001", role: "Coordinator", sessionId: "delegated_coordinator_001", tmuxTarget: "STRATA-DESKTOP-0625-104113:0.0" });
    const packet = [
        "The director has assigned the task definition and authoritative goals.",
        "",
        "assignment_id: A001",
        "",
        "# Below is system level full context picture.",
        "",
        "Context may mention nonce: and commit_sha: as content; delegate must not render or reject it.",
        "",
        "# This is the template you use for submission",
        "",
        "Submit coordinator_work_order.md under the return path.",
    ].join("\n");
    const packetPath = path.join(root, "dispatch_packet.md");
    writeText(packetPath, packet);
    const expectedSha = sha256Text(packet);
    const dispatchLog = path.join(root, "dispatch_log.json");
    const result = deliverDispatchPacket(ctx, { sessionId: "delegated_coordinator_001", packetPath, dispatchLogPath: dispatchLog });
    assert.equal(result.ok, true);
    assert.equal(result.packet_sha256, expectedSha);
    assert.equal(readText(fake.pastePath), packet);
    assert.match(readText(fake.logPath), /paste-buffer/);
    assert.equal(readJson(dispatchLog).packet_sha256, expectedSha);
});
test("return-drop copies files only under the contract return directory", () => {
    const root = tempRoot();
    const ctx = createRuntimeContext(process.cwd(), root);
    const packet = path.join(root, "packet.json");
    const report = path.join(root, "operational_report.md");
    writeText(packet, "{\"ok\":true}\n");
    writeText(report, "# report\n");
    const result = dropReturnFiles(ctx, { assignmentId: "A001", sessionId: "delegated_coordinator_001", files: [packet, report] });
    assert.equal(result.ok, true);
    assert.equal(result.copied_files.length, 2);
    assert.equal(result.return_dir, ".strata/returns/A001/delegated_coordinator_001");
    assert.ok(fs.existsSync(path.join(root, result.return_dir, "packet.json")));
    assert.ok(fs.existsSync(path.join(root, result.return_dir, "operational_report.md")));
});
test("return-dir reports the contract directory without writing returns", () => {
    const root = tempRoot();
    const ctx = createRuntimeContext(process.cwd(), root);
    const result = reportReturnDir(ctx, { assignmentId: "A001", sessionId: "delegated_coordinator_001" });
    assert.equal(result.ok, true);
    assert.equal(result.return_dir, ".strata/returns/A001/delegated_coordinator_001");
    assert.ok(!fs.existsSync(path.join(root, ".strata", "returns")));
});
test("return path contract rejects dot-only assignment/session ids", () => {
    const root = tempRoot();
    const ctx = createRuntimeContext(process.cwd(), root);
    assert.throws(() => reportReturnDir(ctx, { assignmentId: "..", sessionId: "delegated_coordinator_001" }), /dot-only path segment/);
    assert.throws(() => reportReturnDir(ctx, { assignmentId: "A001", sessionId: ".." }), /dot-only path segment/);
    const packet = path.join(root, "packet.json");
    writeText(packet, "{}\n");
    assert.throws(() => dropReturnFiles(ctx, { assignmentId: "..", sessionId: "..", files: [packet] }), /dot-only path segment/);
});
test("session-capture works and session-terminate requires explicit destructive policy", () => {
    const root = tempRoot();
    const fake = installFakeTmux(root);
    const ctx = createRuntimeContext(process.cwd(), root);
    registerSession(ctx, { assignmentId: "A001", cycleId: null, role: "Coordinator", sessionId: "delegated_coordinator_001", tmuxTarget: "STRATA-DESKTOP-0625-104113:0.0" });
    const capture = captureRegisteredSession(ctx, { sessionId: "delegated_coordinator_001", lines: 3 });
    assert.equal(capture.ok, true);
    assert.match(readText(path.join(root, capture.capture_path)), /Codex-TUI/);
    assert.throws(() => terminateRegisteredSession(ctx, { sessionId: "delegated_coordinator_001" }), /explicit-only/);
    const terminated = terminateRegisteredSession(ctx, { sessionId: "delegated_coordinator_001", retirePolicy: "kill-session" });
    assert.equal(terminated.ok, true);
    assert.equal(terminated.retire_policy, "kill-session");
    assert.match(readText(fake.logPath), /kill-session/);
});
test("session-list returns registered bindings", () => {
    const root = tempRoot();
    installFakeTmux(root);
    const ctx = createRuntimeContext(process.cwd(), root);
    registerSession(ctx, { assignmentId: "A001", cycleId: null, role: "Coordinator", sessionId: "delegated_coordinator_001", tmuxTarget: "STRATA-DESKTOP-0625-104113:0.0" });
    const result = listRegisteredSessions(ctx);
    assert.equal(result.ok, true);
    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].session_id, "delegated_coordinator_001");
});
test("missing packet failure is machine-readable through ContractError", () => {
    const root = tempRoot();
    const ctx = createRuntimeContext(process.cwd(), root);
    let caught;
    try {
        deliverDispatchPacket(ctx, { sessionId: "missing", packetPath: path.join(root, "none.md") });
    }
    catch (error) {
        caught = error;
    }
    assert.ok(caught instanceof ContractError);
    const failure = failureResult(caught);
    assert.equal(failure.ok, false);
    assert.equal(failure.error_code, "SESSION_BINDING_NOT_FOUND");
    assert.equal(failure.recoverable, true);
});
test("config validator rejects embedded-secret policy drift", () => {
    assert.throws(() => validateLauncherDelegateConfig({
        contract_id: "strata.runtime_edge.launcher_delegate_config.v1",
        provider_name: "bad",
        mode: "exec",
        launcher_command: "codex",
        launcher_args: [],
        working_directory: null,
        healthcheck_args: [],
        env_passthrough: [],
        secret_policy: "inline_secret_allowed",
    }), /secret_policy/);
});
