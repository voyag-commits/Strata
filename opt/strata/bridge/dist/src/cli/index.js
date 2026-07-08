#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAssignment } from "../backend/assignments/index.js";
import { formatTable, createCommandContext, readText } from "../backend/common.js";
import { runDoctor } from "../backend/doctor/index.js";
import { findRun, loadRunsIndex } from "../backend/runs/index.js";
import { runAssignment } from "../backend/runner/index.js";
import { runSecretScan } from "../backend/secret_scan/index.js";
import { initWorkspace } from "../backend/workspace/index.js";
function parseArgs(argv) {
    const positionals = [];
    const flags = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith("--")) {
            positionals.push(token);
            continue;
        }
        const key = token.slice(2);
        const next = argv[index + 1];
        if (!next || next.startsWith("--")) {
            flags[key] = true;
            continue;
        }
        flags[key] = next;
        index += 1;
    }
    return { positionals, flags };
}
function splitList(value) {
    if (!value || typeof value !== "string")
        return [];
    return value
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean);
}
function helpText() {
    return [
        "Strata CLI",
        "",
        "Usage:",
        "  strata init [--workspace <path>]",
        "  strata doctor [--workspace <path>]",
        "  strata assignment create --objective <text> [--workspace <control-path>] [--target-workspace <target-path>] [--allowed-files a;b] [--forbidden-files x;y] [--expected-output <text>] [--stop-conditions a;b] [--runtime-mode appserver] [--title <text>] [--id <id>]",
        "  strata assignment run --assignment <path> [--workspace <path>] [--secret-file <path>]",
        "  strata runs list [--workspace <path>]",
        "  strata result show --run <run-id|assignment-id> [--workspace <path>]",
        "  strata trace show --run <run-id|assignment-id> [--workspace <path>]",
        "  strata secret-scan [--workspace <path>] [--secret-file <path>]",
    ].join("\n");
}
async function main() {
    const { positionals, flags } = parseArgs(process.argv.slice(2));
    if (positionals.length === 0 || flags.help || positionals.includes("help")) {
        console.log(helpText());
        return;
    }
    const workspace = typeof flags.workspace === "string" ? flags.workspace : process.cwd();
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const context = createCommandContext(projectRoot, workspace);
    const [command, subcommand] = positionals;
    if (command === "init") {
        const result = initWorkspace(context);
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (command === "doctor") {
        const result = await runDoctor(context);
        console.log(result.text);
        if (result.overall === "FAIL")
            process.exitCode = 1;
        return;
    }
    if (command === "assignment" && subcommand === "create") {
        if (typeof flags.objective !== "string") {
            throw new Error("Missing --objective.");
        }
        if (flags["runtime-mode"] !== undefined && flags["runtime-mode"] !== "appserver") {
            throw new Error("Unsupported --runtime-mode. This backend currently supports appserver only.");
        }
        const result = createAssignment(context, {
            id: typeof flags.id === "string" ? flags.id : undefined,
            title: typeof flags.title === "string" ? flags.title : undefined,
            objective: flags.objective,
            workspacePath: typeof flags["target-workspace"] === "string" ? flags["target-workspace"] : workspace,
            allowedFiles: splitList(flags["allowed-files"]),
            forbiddenFiles: splitList(flags["forbidden-files"]),
            expectedOutput: typeof flags["expected-output"] === "string" ? flags["expected-output"] : "Concise final message",
            stopConditions: splitList(flags["stop-conditions"]),
            runtimeMode: "appserver",
        });
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (command === "assignment" && subcommand === "run") {
        if (typeof flags.assignment !== "string") {
            throw new Error("Missing --assignment.");
        }
        const result = await runAssignment(context, flags.assignment, typeof flags["secret-file"] === "string" ? flags["secret-file"] : undefined);
        console.log(JSON.stringify(result, null, 2));
        if (!result.summary.ok || result.secretScanStatus === "FAIL")
            process.exitCode = 1;
        return;
    }
    if (command === "runs" && subcommand === "list") {
        const rows = [["run id", "assignment id", "status", "created time", "result path", "trace path"]];
        for (const item of loadRunsIndex(context)) {
            rows.push([item.runId, item.assignmentId, item.status, item.createdAt, item.resultPath ?? "", item.tracePath ?? ""]);
        }
        console.log(formatTable(rows));
        return;
    }
    if (command === "result" && subcommand === "show") {
        if (typeof flags.run !== "string")
            throw new Error("Missing --run.");
        const run = findRun(context, flags.run);
        if (!run?.resultPath)
            throw new Error(`No result found for ${flags.run}.`);
        console.log(readText(run.resultPath));
        return;
    }
    if (command === "trace" && subcommand === "show") {
        if (typeof flags.run !== "string")
            throw new Error("Missing --run.");
        const run = findRun(context, flags.run);
        if (!run?.tracePath)
            throw new Error(`No trace found for ${flags.run}.`);
        console.log(readText(run.tracePath));
        return;
    }
    if (command === "secret-scan") {
        const result = runSecretScan(context, {
            secretFile: typeof flags["secret-file"] === "string" ? flags["secret-file"] : undefined,
        });
        console.log(JSON.stringify(result, null, 2));
        if (result.status === "FAIL")
            process.exitCode = 1;
        return;
    }
    console.log(helpText());
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
