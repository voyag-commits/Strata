import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRuntimeContext, readJson, writeJson } from "../src/common.js";
import { injectNotice, renderBoundedNotice } from "../src/dispatch_edge.js";
import { providerDoctor, validateLauncherDelegateConfig, writeLauncherDelegateTemplate } from "../src/provider.js";
import { sessionNameFor } from "../src/runtime.js";
function tempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "strata-launcher-delegate-"));
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
test("launcher delegate template externalizes secrets", () => {
    const root = tempRoot();
    const ctx = createRuntimeContext(process.cwd(), root);
    const configPath = writeLauncherDelegateTemplate(ctx);
    const config = readJson(configPath);
    assert.equal(config.contract_id, "strata.runtime_edge.launcher_delegate_config.v1");
    assert.equal(config.secret_policy, "externalized_no_secret_material_in_package");
    assert.doesNotMatch(JSON.stringify(config), /api[_-]?key|sk-[A-Za-z0-9_-]{8,}/i);
});
test("provider doctor can call a local mock launcher without bridge knowledge", () => {
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
test("runtime-edge notice injection dry-run writes evidence only", () => {
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
test("session name convention is stable", () => {
    assert.equal(sessionNameFor("coder", "A001"), "STRATA-CODER-A001");
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
