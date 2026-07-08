// Minimal Node.js ambient declarations for offline package verification when
// @types/node is not installed. Production development may still install
// @types/node for full editor and type coverage.
declare const process: any;
declare const Buffer: any;

declare module "node:fs" {
  const fs: any;
  export = fs;
}

declare module "node:path" {
  const path: any;
  export = path;
}

declare module "node:crypto" {
  const crypto: any;
  export = crypto;
}

declare module "node:os" {
  const os: any;
  export = os;
}

declare module "node:child_process" {
  export type SpawnSyncOptionsWithStringEncoding = any;
  export const spawnSync: any;
}

declare module "node:assert/strict" {
  const assert: any;
  export default assert;
}

declare module "node:test" {
  const test: any;
  export default test;
}
