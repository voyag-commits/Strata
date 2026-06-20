# SCTL/Strata 链路维护兼职需求文档

## 1. 项目背景

我们有一个本地运行的 SCTL/Strata 工具链，用于管理 AI 编程会话的工作流。当前目标不是重新设计系统，也不是开发复杂新功能，而是修复和稳定最小运行链路。

当前主要问题是：本地 shell 脚本调用了错误的 session 启动入口，导致 session 无法稳定创建、注册、派发和记录。需要一名熟悉 Node.js/TypeScript CLI、Linux Shell、WSL、tmux 和 Git 的工程师协助维护链路。

## 2. 工作目标

只维护和修复以下三段核心链路：

```text
session launch -> session dispatch -> context commit
```

具体含义：

1. **session launch**：通过正确的 `strata-runtime-edge` CLI 启动 session。
2. **session dispatch**：通过正确的 runtime-edge dispatch 命令向已存在 session 注入任务。
3. **context commit**：确保 SCTL 能把 Class A / Class B 上下文文件正确提交到 Git，并留下可追踪记录。

## 3. 当前正确 CLI 边界

稳定入口应为：

```bash
strata-runtime-edge
```

或其别名：

```bash
strata-codex-delegate
```

该 CLI 负责：

```text
session launch
session list
session capture
session terminate
dispatch inject
provider doctor
```

SCTL 不应直接调用：

```text
/home/hou16/bin/strata-codex-local
/home/hou16/bin/strata-codex-linux-desktop
```

这两个脚本属于更底层的 Codex/本地启动入口，不应作为 SCTL live workflow 的主 session 生命周期入口。

## 4. 需要修复的范围

### 4.1 Session 启动链路

需要检查和修复脚本中 session 创建逻辑，确保流程为：

```text
SCTL 请求 runtime-edge 启动 session
runtime-edge 创建实际 session
SCTL 查询 session list
SCTL 解析实际 runtime session name
SCTL 记录 logical session id + runtime session name
如果找不到实际 session，必须失败，不允许假注册
```

核心要求：

```text
没有 runtime-edge 确认的 session，就不能写入 SCTL session 注册记录。
```

### 4.2 Dispatch 注入链路

需要确保 dispatch 使用 runtime-edge 的实际 session name，而不是 SCTL 自己生成的逻辑名称。

正确方向：

```bash
strata-runtime-edge dispatch inject --notice notice.json --session <runtime_session_name>
```

不应把 raw tmux paste 当作主链路。tmux 可以用于诊断，但不应作为正式派发入口。

### 4.3 Context commit 链路

需要确保：

```text
Director Markdown -> Class A commit
Coordinator Work Order / operational report -> Class B commit
```

要求：

- Director Markdown 是权威输入，不需要 frontmatter、heading 或固定格式。
- SCTL 不应解析 Director 文档语义。
- SCTL 只需提交文件、记录路径、SHA、Git commit。
- Class B 报告只做结构检查，不判断工作质量。
- 提交后 Git 状态应可检查、可追踪。

## 5. 不需要做的事情

本任务不需要：

```text
不需要训练模型
不需要设计新的 AI Agent 架构
不需要写前端页面
不需要做普通 Web 后端业务
不需要重写整个系统
不需要优化 prompt
不需要做复杂产品功能
```

重点是本地链路稳定性、脚本正确性、CLI 调用正确性、日志和故障诊断。

## 6. 技术要求

候选人最好熟悉：

```text
Node.js / TypeScript
Linux / WSL
Bash / Shell
tmux
Git
CLI 工具开发
JSON / Markdown 文件工作流
child_process / spawn
错误码和日志诊断
```

加分项：

```text
做过本地开发工具链
做过 DevOps 自动化脚本
做过 tmux/session 控制
做过 WSL 环境调试
做过 Node.js CLI 项目
```

## 7. 交付物

需要交付：

1. 修复后的代码 patch。
2. 说明修改了哪些脚本/模块。
3. 一份简单测试记录。
4. 如果仍失败，提供明确 failure report。
5. 标明实际使用的 runtime session name、dispatch notice path、context commit hash。

## 8. 验收标准

### 8.1 Session launch 验收

运行后必须能证明：

```text
runtime-edge 成功创建 session
session list 能看到该 session
SCTL 记录了 actual runtime_session_name
没有实际 session 时不会注册成功
```

### 8.2 Session dispatch 验收

必须能证明：

```text
dispatch inject 使用 runtime_session_name
任务文本被注入到正确 session
注入结果被记录到 operational log
```

### 8.3 Context commit 验收

必须能证明：

```text
Director Markdown 被提交到 Class A
Class B 工作报告能结构化提交
Git commit 可查
工作区停止时 Git 状态干净或差异明确
```

## 9. 故障报告格式

如果任务失败，请按以下格式报告：

```text
失败阶段：
- session launch / session list / dispatch inject / context commit / other

实际执行命令：

实际输出：

期望结果：

实际结果：

判断原因：

下一步建议：
```

## 10. 沟通要求

请不要只汇报“已修复”或“运行成功”。每次报告需要包含：

```text
执行了什么命令
看到什么输出
写入了哪些文件
Git commit 是什么
session name 是什么
如果失败，失败在哪一步
```

## 11. 推荐岗位名称

建议用以下岗位名称发布需求：

```text
兼职 Node.js/TypeScript CLI 工具链 + Linux Shell 自动化工程师
```

也可以写成：

```text
Node.js/TypeScript 工具链开发工程师（Linux/WSL/tmux/CLI 自动化方向）
```
