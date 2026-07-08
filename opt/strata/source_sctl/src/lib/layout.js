import path from "node:path";
import { ensureDir } from "./common.js";

export function layout(root) {
  const strata = path.join(root, ".strata");
  const context = path.join(strata, "context");
  const classC = path.join(context, "C");
  const classD = path.join(context, "D_trace");
  const cycles = path.join(strata, "cycles");
  const directorEntry = path.join(cycles, "director_entry");
  return {
    root,
    strata,
    context,
    classA: path.join(context, "A"),
    classB: path.join(context, "B"),
    classC,
    classD,
    classCThreads: path.join(classC, "threads"),
    classCSessions: path.join(classC, "sessions"),
    sessionLifecycle: path.join(classC, "sessions", "lifecycle"),
    dispatchLog: path.join(classD, "dispatch_log"),
    dispatchPackets: path.join(classD, "dispatch_packets"),
    telemetry: path.join(classD, "telemetry"),
    returnLedgers: path.join(classD, "return_ledgers"),
    returnDiagnostics: path.join(classD, "return_diagnostics"),
    coordinationThreadsGit: path.join(classD, "coordination_threads"),
    coordinationTrace: path.join(classD, "coordination_threads"),
    cyclesTrace: path.join(classD, "cycles"),
    coordinatorLifecycle: path.join(classD, "coordinator_lifecycle"),
    returns: path.join(strata, "returns"),
    dispatchOutbox: path.join(strata, "dispatch_outbox"),
    cycles,
    directorEntry,
    directorEntryFile: path.join(directorEntry, "director_governing_entry.md"),
    // Backward-compatible aliases for older CLI/harness names. The directory is
    // now the Director Entry inbox, not a manual-cycle-entry contract parser.
    cycleManualEntry: directorEntry,
    cycleEntry: directorEntry,
    cycleEntryInbox: directorEntry,
    cycleEntryFile: path.join(directorEntry, "director_governing_entry.md"),
    cycleRecords: path.join(classD, "cycles"),
    evidence: path.join(strata, "evidence"),
    exports: path.join(strata, "exports"),
    failures: path.join(strata, "failures"),
  };
}

export function ensureLayout(root) {
  const l = layout(root);
  for (const dir of [
    l.strata, l.context, l.classA, l.classB, l.classC, l.classD,
    l.classCThreads, l.classCSessions, l.sessionLifecycle, l.dispatchLog, l.dispatchPackets, l.telemetry,
    l.returnLedgers, l.returnDiagnostics, l.coordinationThreadsGit, l.cyclesTrace, l.coordinatorLifecycle,
    l.returns, l.dispatchOutbox, l.cycles, l.directorEntry, l.cycleManualEntry, l.cycleEntry, l.cycleEntryInbox, l.cycleRecords,
    l.evidence, l.exports, l.failures,
  ]) ensureDir(dir);
  return l;
}
