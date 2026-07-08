# SCTL Operational WSL Distro — 打包验收清单

> 本清单由实际运行 `live_cycle_harness.sh` 的 preflight gate 序列反推得出,每一条对应 harness 中一个会 fail-loud 的检查点。打包者按此清单逐项满足后,harness 应能越过 preflight 阶段,进入真正的 cycle 执行。任何一项缺失,harness 会在对应 gate 报错退出,错误码见各条标注。

## 一、基础运行时依赖

Harness 启动时(`startup` gate,源码 `live_cycle_harness.sh:643`)按以下顺序检查命令是否存在,任一缺失报 `BLOCKED_MISSING_COMMAND`:

- `node` — Node.js 运行时(实测 v22.17.1 可用)
- `git` — 版本控制(实测 v2.43.0 可用)
- `bash` — shell 本体
- `python3` — Python 3
- `npm` — 仅当未传 `--skip-npm-test` 时需要(用于跑 SCTL 包测试)

此外 harness 还会调用 `tmux`(实测 v3.4 可用)来管理 runtime session,虽不在 `need_cmd` 列表中,但 delegate adapter 会依赖它。**必须预装。**

**验收方式:** 在新 distro 内执行 `node --version && git --version && bash --version && python3 --version && npm --version && tmux -V`,全部有输出。

## 二、SCTL Kernel 包

Harness 的第一个 preflight gate(源码 `:645-646`)检查:

- `BLOCKED_MISSING_PACKAGE_ROOT` — `--package-root` 指向的目录必须存在
- `BLOCKED_MISSING_SCTL_CLI` — 该目录下必须有 `src/cli.js`

**必须打包的内容:**

- A004 handoff build 的完整 `source_sctl/` 目录
- 必须包含 `src/lib/maintenance.js` — 这是 wrapper 层的唯一真实判别标志(版本号不可靠,详见下文"版本陷阱")
- 必须包含 `PACKAGE_CHECKSUMS.sha256`(实测 present,114 entries)— `sctl doctor` 会校验其存在与可解析性
- 必须包含 9 个 wsl_tmux adapter 脚本(`scripts/wsl_tmux/sctl-*`),否则报 `BLOCKED_MISSING_ADAPTER`:
  - `sctl-dispatch-inject` `sctl-dispatch-render` `sctl-git-panel` `sctl-return-dir` `sctl-return-drop` `sctl-session-capture` `sctl-session-list` `sctl-session-new` `sctl-session-retire`
- 这 9 个脚本必须有可执行权限(`-x`),preflight 用 `[ -x ]` 检查

**npm 依赖:** SCTL 包 `package.json` 的 `dependencies` 和 `devDependencies` 均为空 `{}`,**无需 `npm install`**。但 preflight 默认会跑 `npm test`(`BROKEN_PACKAGE_TESTS` gate),打包时需确认 `npm test` 在 distro 内通过,或运行 harness 时传 `--skip-npm-test`。

**验收方式:**

```bash
cd <PACKAGE_ROOT>
[ -f src/lib/maintenance.js ] && echo "wrapper: OK" || echo "wrapper: MISSING"
[ -f PACKAGE_CHECKSUMS.sha256 ] && echo "checksums: OK" || echo "checksums: MISSING"
node src/cli.js doctor   # 应返回 ok:true,5 项 checks 全绿
bash -lc 'for s in scripts/wsl_tmux/sctl-*; do bash -n "$s" || exit 1; done' && echo "adapter syntax: OK"
```

## 三、Runtime Delegate Launcher

Harness preflight(源码 `:465-470`)解析 delegate 二进制路径:

- 优先取 `--runtime-delegate-bin` 或环境变量 `SCTL_RUNTIME_DELEGATE_BIN`
- 否则从 `--runtime-delegate-root` 推导为 `$ROOT/dist/src/cli.js`
- 文件不存在则报 `BROKEN_RUNTIME_DELEGATE`

**必须打包的内容:**

- `strata-runtime-edge-delegate-control-surface/` 完整目录
- 必须包含 `dist/src/cli.js`(编译后的 delegate CLI,实测 11089 bytes)
- 必须包含 `node_modules/`(实测已预装 `@types` `typescript` `undici-types`)— delegate 是 TypeScript 项目,`dist/` 是编译产物,但运行时仍需 node_modules 中的类型依赖
- 必须包含 `PACKAGE_CHECKSUMS.sha256`

**验收方式:**

```bash
DELEGATE_ROOT=<path>
[ -f "$DELEGATE_ROOT/dist/src/cli.js" ] && echo "delegate bin: OK" || echo "MISSING"
node "$DELEGATE_ROOT/dist/src/cli.js" --help   # 应输出 8 个 delegate verbs
```

## 四、Delegate Launcher 配置(关键缺口)

这是当前环境最容易被忽略的一层。Delegate `provider doctor` 会查找:

```
$CODEBASE_REPO/.strata-runtime/config/launcher_delegate.local.json
```

**文件不存在时报错:** `ENOENT: no such file or directory`(实测已复现)。

**该文件的默认模板**(由 `provider init-template` 生成)中,`launcher_command` 是占位符 `"strata-codex-local"`,**必须替换为真实可用的 Codex CLI 命令**。

**必须满足:**

- 配置文件存在于 codebase repo 的 `.strata-runtime/config/` 下(不是 workspace,是 codebase)
- `launcher_command` 指向一个真实存在的、可在 distro 内执行的 Codex CLI 二进制或脚本
- `healthcheck_args: ["--version"]` 能对该命令成功执行
- 不得在配置文件中放 API key(`secret_policy: externalized_no_secret_material_in_package`)

**验收方式:**

```bash
node "$DELEGATE_ROOT/dist/src/cli.js" provider doctor --config <config_path>
# 应返回 ok:true
# 若返回 INTERNAL_ERROR + ENOENT,说明配置缺失
# 若返回 healthcheck 失败,说明 launcher_command 不可用
```

**这一条是 distro 打包的核心价值所在:** 占位符 `strata-codex-local` 必须在 distro 内被替换为预装好的真实 Codex CLI,否则 harness 会在 session-create 阶段挂起 360 秒后报 `BLOCKED_TIMEOUT`。

## 五、目标 Codebase Git Repo

Harness preflight(源码 `:651`)检查:

- `BLOCKED_MISSING_CODEBASE_GIT` — `--codebase-repo` 指向的目录必须有 `.git/`

**必须满足:**

- 是一个初始化好的 git repo(`git init`)
- 有 `main` 分支(与 `--trunk-branch main` 对应,默认值)
- 至少有一个 commit(harness 会创建 change branch 并推送)
- distro 内的当前用户对该 repo 有写权限(创建 branch、commit、merge)
- 若使用 `--allow-merge`,还需能执行 `git merge` 和 `git push`(或本地 ff-only merge)

**验收方式:**

```bash
cd <CODEBASE_REPO>
git rev-parse --is-inside-work-tree && echo "git repo: OK"
git rev-parse --abbrev-ref HEAD    # 应为 main
git log --oneline -1               # 应有至少一个 commit
test -w . && echo "writable: OK"
```

## 六、SCTL Workspace(外部化,不入 rootfs)

这是架构原则,不是 preflight gate,但决定了 distro 的可升级性:

- `.strata/context` 是 SCTL 的操作真相(Git-backed),**不可放入 disposable rootfs**
- Workspace 应位于 distro 外部(`/mnt/c/...` 或独立 vhdx 挂载点)
- Distro 只负责提供代码和运行时,通过 `STRATA_WORKSPACE` 环境变量指向外部 workspace

**Harness 要求 workspace 在运行前已完成:**

1. `sctl init-workspace` — 创建 `.strata/` 布局并 bootstrap context Git
2. `sctl entry-template --write` — 生成 Director Entry Markdown 文件
3. `sctl validate-entry` — 校验通过

**若未初始化,harness 报:** `BLOCKED_MISSING_CYCLE_ENTRY_DIR`(实测已复现)。Harness 自身不调用 `init-workspace`,这是操作者的前置责任。

**验收方式:**

```bash
export STRATA_WORKSPACE=<external_path>
cd <PACKAGE_ROOT>
node src/cli.js init-workspace     # ok:true
node src/cli.js entry-template --write  # ok:true
node src/cli.js validate-entry     # ok:true, sha256 有值
node src/cli.js status             # head 有值, active_cycle=null
```

## 七、环境变量与配置约定

Harness 读取以下环境变量(源码 `:15-21`):

- `STRATA_WORKSPACE` — workspace 路径(manual #1 的变量名;manual #2 写的 `SCTL_WORKSPACE` **不被实现识别**,已确认 F2)
- `SCTL_RUNTIME_DELEGATE_ROOT` — delegate 根目录
- `SCTL_RUNTIME_DELEGATE_BIN` — delegate CLI 路径(覆盖上面的自动推导)
- `SCTL_RUNTIME_LAUNCH_CONFIG` — launcher 配置路径
- `SCTL_RUNTIME_SESSION_EXTRA_ARGS` — 透传给 launcher 的额外参数
- `SCTL_DISPATCH_PASTE_DELAY` — dispatch 注入延迟(默认 5s)
- `SCTL_GIT_PANEL` — git 面板工具(默认 `git-status`)

**Distro 打包时应:** 在 `/etc/profile.d/` 或 `~/.bashrc` 中预设 `STRATA_WORKSPACE` 之外的所有变量(指向 distro 内固定路径),只把 `STRATA_WORKSPACE` 留给用户在运行时指定。

## 八、版本陷阱(打包者必读)

当前目录下存在 5 个 SCTL build,其中 4 个**缺少 wrapper 层**,但版本号与 A004 相同或相近:

| Build | package.json version | maintenance.js | wrapper CLI |
|---|---|---|---|
| sctl_kernel_v0_9_3 | 0.9.3-classc-notice | absent | 不可用 |
| strata-verification/Strata | 0.9.4-simplified-runtime | absent | 不可用 |
| adr0626_full_bundle/Strata | 0.9.5-delegate-contract | absent | 不可用 |
| strata-sctl-v0.9.5/Strata | 0.9.5-delegate-contract | absent | 不可用 |
| **A004 source_sctl** | **0.9.5-delegate-contract** | **present** | **可用** |

注意:ADR0626 和 A004 的 `package.json` 版本号**完全相同**(`0.9.5-delegate-contract`),但 CLI banner 不同(ADR0626 报 `v0.9.5-cycle-entry`,实际无 wrapper)。**版本号和 name 字段均不可作为判别依据。**

**唯一可靠判别:** `src/lib/maintenance.js` 文件存在性。打包时必须确认该文件在 distro 内存在。

## 九、端到端验收命令

以上全部满足后,在 distro 内执行以下命令应能越过 preflight 并进入 cycle 执行(即到达 `0 cycle start` step):

```bash
<PACKAGE_ROOT>/flowmaps/flowmap02/live_cycle_harness.sh \
  --assignment-id A_ACCEPTANCE_001 \
  --package-root <PACKAGE_ROOT> \
  --runtime-delegate-root <DELEGATE_ROOT> \
  --runtime-launch-config <CONFIG_PATH> \
  --sctl-workspace <EXTERNAL_WORKSPACE> \
  --codebase-repo <CODEBASE_REPO> \
  --short-name acceptance-probe \
  --skip-npm-test \
  --skip-adapter-syntax
```

**预期行为(验收通过):**

- 不出现任何 `BLOCKED_*` 或 `BROKEN_*` 诊断行
- 到达 `0 cycle start` step 并产出 `CYCLE_A_ACCEPTANCE_001_...` cycle_id
- 到达 `session new coordinator` step 并注册 coordinator session
- 到达 `dispatch inject` step 并注入 author packet
- 在 `wait_for_return` 处等待 Change Author 返回(此时取决于真实 Codex CLI 是否在运行并产出 return packet)

**若卡在 `wait_for_return` 且 360s 后报 `BLOCKED_TIMEOUT`:** 说明前 8 条全部通过,问题收窄到真实 Codex CLI 的运行时行为(return packet 未产出)。这不再是环境打包问题,而是 runtime session 的功能性调试。
