#!/usr/bin/env bash
set -euo pipefail
# ============================================================================
# Strata Edge Launcher v0.9 — 一键安装器
# ============================================================================
# 用法: chmod +x install.sh && ./install.sh
# 此安装器自包含——直接使用 zip 中的 package/ 和 bin/ 目录。
# 不需要外部路径依赖。
# ============================================================================

# -- 颜色定义 ---------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*"; }
info() { echo -e "${CYAN}[*]${NC} $*"; }
step() { echo ""; echo -e "${BOLD}>>> $*${NC}"; echo ""; }

# -- 检测安装器所在目录（zip 解压根目录） -----------------------------------
INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_SRC="$INSTALLER_DIR/package"
BIN_SRC="$INSTALLER_DIR/bin"

# -- 默认目标路径 -----------------------------------------------------------
TARGET="${STRATA_TARGET:-$HOME/strata-runtime-edge}"
BIN_TARGET="${STRATA_BIN_TARGET:-$HOME/bin}"
SKIP_BUILD="${STRATA_SKIP_BUILD:-0}"
DRY_RUN="${STRATA_DRY_RUN:-0}"
USER_NAME="${USER:-$(whoami)}"

# -- 参数解析 ---------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)      TARGET="$2"; shift 2 ;;
    --bin-target)  BIN_TARGET="$2"; shift 2 ;;
    --skip-build)  SKIP_BUILD=1; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --help|-h)
      echo "Strata Edge Launcher v0.9 — 一键安装器"
      echo ""
      echo "用法: ./install.sh [选项]"
      echo ""
      echo "选项:"
      echo "  --target PATH      安装载荷到 PATH (默认: ~/strata-runtime-edge)"
      echo "  --bin-target PATH  安装启动脚本到 PATH (默认: ~/bin)"
      echo "  --skip-build       跳过 npm ci + 编译 + 测试"
      echo "  --dry-run          预览模式"
      exit 0
      ;;
    *) err "未知选项: $1"; exit 1 ;;
  esac
done

# -- 打印横幅 ---------------------------------------------------------------
echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║         Strata Edge Launcher v0.9 一键安装器            ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""
info "安装器目录   : $INSTALLER_DIR"
info "载荷源       : $PACKAGE_SRC"
info "脚本源       : $BIN_SRC"
info "安装目标     : $TARGET"
info "脚本目标     : $BIN_TARGET"
info "用户名       : $USER_NAME"
info "跳过编译     : $([ "$SKIP_BUILD" = "1" ] && echo 是 || echo 否)"
info "预览模式     : $([ "$DRY_RUN" = "1" ] && echo 是 || echo 否)"

# -- 前置检查 ---------------------------------------------------------------
step "阶段 0: 环境检查"

MISSING=0
check_cmd() {
  if command -v "$1" &>/dev/null; then
    log "  ✓  $1 已安装"
  else
    warn "  ✗  $1 未安装 — 请先安装"
    MISSING=$((MISSING + 1))
  fi
}

check_cmd node
check_cmd npm
check_cmd tmux

if [[ "$MISSING" -gt 0 ]]; then
  err "缺少 $MISSING 个必要组件。请参考使用手册第 2 节进行安装。"
  exit 1
fi

NODE_VER=$(node -v)
info "Node.js 版本: $NODE_VER"

# -- 辅助函数 ---------------------------------------------------------------
do_mkdir() { [[ "$DRY_RUN" = "1" ]] && echo "  [预览] mkdir -p $1" || mkdir -p "$1"; }
do_cp_r()  { [[ "$DRY_RUN" = "1" ]] && echo "  [预览] cp -r $1 -> $2" || cp -r "$1" "$2"; }
do_cp()    { [[ "$DRY_RUN" = "1" ]] && echo "  [预览] cp $1 -> $2" || cp "$1" "$2"; }

do_write() {
  if [[ "$DRY_RUN" = "1" ]]; then
    echo "  [预览] 写入 $1"
  else
    mkdir -p "$(dirname "$1")"
    printf '%s\n' "$2" > "$1"
    chmod +x "$1" 2>/dev/null || true
  fi
}

# -- 阶段 1: 复制载荷 -------------------------------------------------------
step "阶段 1/4: 复制 v0.9 载荷"

if [[ ! -d "$PACKAGE_SRC" ]]; then
  err "未找到 package/ 目录。请确认你在 zip 解压根目录中运行此脚本。"
  exit 1
fi

# 清理旧安装
if [[ -d "$TARGET" ]]; then
  warn "目标目录已存在: $TARGET"
  if [[ "$DRY_RUN" != "1" ]]; then
    echo -n "是否覆盖? [y/N] "
    read -r REPLY
    if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
      info "安装取消"
      exit 0
    fi
    rm -rf "$TARGET"
  fi
fi

do_mkdir "$TARGET"

# 复制目录
for d in src dist tests scripts specifications; do
  if [[ -d "$PACKAGE_SRC/$d" ]]; then
    log "复制 $d/"
    do_cp_r "$PACKAGE_SRC/$d" "$TARGET/$d"
  fi
done

# 复制根文件
for f in package.json package-lock.json tsconfig.json ARCHITECTURE.md CONTRACTS.md \
         FREEZE_LOCK MANIFEST.json PACKAGE_CHECKSUMS.sha256 PACKAGE_CONTENTS.txt \
         PACKAGE_SHA_NOTE.md README.md; do
  [[ -f "$PACKAGE_SRC/$f" ]] && do_cp "$PACKAGE_SRC/$f" "$TARGET/$f"
done

# 复制运行时目录结构
do_mkdir "$TARGET/.strata-runtime/config"
do_mkdir "$TARGET/.strata-runtime/notices"
do_mkdir "$TARGET/.strata-runtime/sessions"
do_mkdir "$TARGET/.strata-runtime/evidence"
[[ -f "$PACKAGE_SRC/.strata-runtime/config/launcher_delegate.local.json" ]] && \
  do_cp "$PACKAGE_SRC/.strata-runtime/config/launcher_delegate.local.json" \
    "$TARGET/.strata-runtime/config/launcher_delegate.local.json"

log "载荷已复制到: $TARGET"

# -- 阶段 2: 复制启动脚本 ---------------------------------------------------
step "阶段 2/4: 安装启动器脚本"

do_mkdir "$BIN_TARGET"

if [[ ! -d "$BIN_SRC" ]]; then
  warn "未找到 bin/ 目录。跳过启动器脚本安装。"
else
  for script in strata-codex-local strata-codex-linux-desktop strata-fleet-launch; do
    if [[ -f "$BIN_SRC/$script" ]]; then
      log "安装 $script"
      if [[ "$DRY_RUN" = "1" ]]; then
        echo "  [预览] 写入 $BIN_TARGET/$script (用户名替换后)"
      else
        # 读脚本，替换用户名和目标路径
        content=$(cat "$BIN_SRC/$script")
        content=$(echo "$content" | sed "s|/home/hou16|/home/${USER_NAME}|g" | sed "s|hou16|${USER_NAME}|g")

        # 针对 fleet-launch: 更新 PAYLOAD_DIR
        if [[ "$script" == "strata-fleet-launch" ]]; then
          content=$(echo "$content" | sed "s|PAYLOAD_DIR=.*|PAYLOAD_DIR=\"$TARGET\"|")
        fi

        printf '%s\n' "$content" > "$BIN_TARGET/$script"
        chmod +x "$BIN_TARGET/$script"
      fi
    else
      warn "跳过 $script (未找到)"
    fi
  done
fi

# 确保 ~/bin 在 PATH 中
if [[ ":$PATH:" != *":$BIN_TARGET:"* ]]; then
  warn "注意: $BIN_TARGET 不在你的 PATH 中"
  echo "  请将以下行添加到 ~/.bashrc:"
  echo "    export PATH=\"$BIN_TARGET:\$PATH\""
fi

log "启动脚本已安装到: $BIN_TARGET"

# -- 阶段 3: 编译 -----------------------------------------------------------
step "阶段 3/4: 安装依赖并编译"

if [[ "$SKIP_BUILD" = "1" ]]; then
  warn "跳过编译阶段 (--skip-build)"
else
  if [[ "$DRY_RUN" = "1" ]]; then
    echo "  [预览] cd $TARGET && npm ci && npm run build && npm test"
  else
    cd "$TARGET"

    log "运行 npm ci ..."
    npm ci || { err "npm ci 失败。请检查 Node.js 版本 (需要 >=22)"; exit 1; }

    log "运行 npm run build ..."
    npm run build || { err "编译失败。请检查 TypeScript 源码。"; exit 1; }

    log "运行 npm test ..."
    npm test && log "✓ 所有测试通过" || warn "部分测试未通过 — 请查看上方输出。"
  fi
fi

# -- 阶段 4: 验证 -----------------------------------------------------------
step "阶段 4/4: 安装验证"

VERIFY_FILES=(
  "CLI入口:$TARGET/dist/src/cli.js"
  "通用模块:$TARGET/dist/src/common.js"
  "调度模块:$TARGET/dist/src/dispatch_edge.js"
  "提供者模块:$TARGET/dist/src/provider.js"
  "运行时模块:$TARGET/dist/src/runtime.js"
  "测试文件:$TARGET/dist/tests/launcher_delegate.test.js"
  "配置文件:$TARGET/.strata-runtime/config/launcher_delegate.local.json"
)

IFS=":"; VERIFY_SCRIPTS=(
  "底层启动器:$BIN_TARGET/strata-codex-local"
  "桌面启动器:$BIN_TARGET/strata-codex-linux-desktop"
  "舰队启动器:$BIN_TARGET/strata-fleet-launch"
)

PASS=0; FAIL=0
for entry in "${VERIFY_FILES[@]}"; do
  IFS=":" read -r label path <<< "$entry"
  if [[ -e "$path" ]]; then
    log "  ✓  $label"
    PASS=$((PASS + 1))
  else
    err "  ✗  $label  缺失: $path"
    FAIL=$((FAIL + 1))
  fi
done
for entry in "${VERIFY_SCRIPTS[@]}"; do
  IFS=":" read -r label path <<< "$entry"
  if [[ -e "$path" ]]; then
    log "  ✓  $label"
    PASS=$((PASS + 1))
  else
    warn "  -  $label  未安装"
  fi
done

echo ""
echo "  验证结果: $PASS 通过, $FAIL 缺失"

# -- 完成 -------------------------------------------------------------------
echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║              安装完成！ 🎉                              ║"
if [[ "$DRY_RUN" = "1" ]]; then
echo "  ║          （这是预览模式，未实际写入文件）                  ║"
fi
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""
echo "📁  载荷目录   : $TARGET"
echo "📁  脚本目录   : $BIN_TARGET"
echo ""
echo "--- 🚀 快速开始 ---"
echo ""
echo "  1. 将 ~/bin 加入 PATH (如尚未加入):"
echo "       echo 'export PATH=\"\$HOME/bin:\$PATH\"' >> ~/.bashrc"
echo "       source ~/.bashrc"
echo ""
echo "  2. 配置 API 密钥 (参考使用手册第 5 节):"
echo "       编辑 ~/strata/bridge/bridge/.env"
echo "       填入 DEEPSEEK_API_KEY"
echo ""
echo "  3. 运行健康检查:"
echo "       cd $TARGET"
echo "       node dist/src/cli.js provider doctor"
echo ""
echo "  4. 启动舰队:"
echo "       strata-fleet-launch --count 3"
echo ""
echo "--- 📖 详细文档 ---"
echo ""
echo "  使用手册: $INSTALLER_DIR/使用手册.md"
echo ""

if [[ "$DRY_RUN" != "1" ]]; then
  echo "是否立即启动舰队? (需要先配置 API 密钥) [y/N] "
  read -r LAUNCH_NOW
  if [[ "$LAUNCH_NOW" =~ ^[Yy]$ ]]; then
    export PATH="$BIN_TARGET:$PATH"
    strata-fleet-launch --count 3 || warn "启动失败 — 请先完成 API 密钥配置"
  fi
fi