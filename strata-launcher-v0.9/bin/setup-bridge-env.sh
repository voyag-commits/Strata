#!/usr/bin/env bash
set -euo pipefail
# ============================================================================
# Strata DeepSeek Bridge 快速配置脚本
# ============================================================================
# 此脚本帮助你快速创建 DeepSeek 桥接的 .env 文件。
# 你可以直接输入 API Key，也可以从已有的密钥文件中读取。
# ============================================================================

BRIDGE_DIR="${BRIDGE_DIR:-$HOME/strata/bridge/bridge}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo ""
echo "================================="
echo " DeepSeek Bridge 快速配置"
echo "================================="
echo ""
echo "桥接目录: $BRIDGE_DIR"
echo ""

# 确保目录存在
mkdir -p "$BRIDGE_DIR"

# 如果 .env 已存在，询问是否覆盖
if [[ -f "$BRIDGE_DIR/.env" ]]; then
  echo -e "${YELLOW}⚠  $BRIDGE_DIR/.env 已存在${NC}"
  echo -n "是否覆盖? [y/N] "
  read -r REPLY
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo "跳过。保留现有 .env"
    exit 0
  fi
fi

# 获取 API Key
echo "请选择 API Key 输入方式:"
echo "  1) 直接输入"
echo "  2) 从文件中读取 (如 ~/.deepseek_key)"
echo "  3) 从环境变量读取 (DEEPSEEK_API_KEY)"
echo ""
echo -n "选择 [1-3]: "
read -r CHOICE

case "$CHOICE" in
  1)
    echo -n "请输入 DeepSeek API Key (sk-...): "
    read -rs API_KEY
    echo ""
    if [[ -z "$API_KEY" ]]; then
      echo -e "${RED}错误: API Key 不能为空${NC}"
      exit 1
    fi
    ;;
  2)
    echo -n "密钥文件路径: "
    read -r KEY_FILE
    KEY_FILE="${KEY_FILE/#\~/$HOME}"
    if [[ ! -f "$KEY_FILE" ]]; then
      echo -e "${RED}错误: 文件不存在: $KEY_FILE${NC}"
      exit 1
    fi
    API_KEY=$(head -1 "$KEY_FILE" | tr -d '\n\r')
    ;;
  3)
    API_KEY="${DEEPSEEK_API_KEY:-}"
    if [[ -z "$API_KEY" ]]; then
      echo -e "${RED}错误: DEEPSEEK_API_KEY 环境变量未设置${NC}"
      exit 1
    fi
    ;;
  *)
    echo -e "${RED}无效选择${NC}"
    exit 1
    ;;
esac

# 验证密钥格式
if [[ ! "$API_KEY" =~ ^sk- ]]; then
  echo -e "${YELLOW}警告: API Key 通常以 'sk-' 开头，输入的值未匹配此格式${NC}"
  echo -n "是否继续? [y/N] "
  read -r REPLY
  [[ "$REPLY" =~ ^[Yy]$ ]] || exit 1
fi

# 生成随机的桥接认证令牌
BRIDGE_AUTH=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || echo "change-me-please-$(date +%s)")

# 写入 .env
cat > "$BRIDGE_DIR/.env" << EOF
# Strata DeepSeek Bridge 配置
# 生成时间: $(date -Iseconds)

BRIDGE_AUTH_KEY=$BRIDGE_AUTH
DEEPSEEK_API_KEY=$API_KEY
PORT=38441
EOF

chmod 600 "$BRIDGE_DIR/.env"

echo ""
echo -e "${GREEN}✓ 配置完成！${NC}"
echo ""
echo "  .env 路径 : $BRIDGE_DIR/.env"
echo "  桥接端口  : 38441"
echo ""
echo "--- 下一步 ---"
echo ""
echo "  1. 确保桥接入口文件存在: $BRIDGE_DIR/dist/src/index.js"
echo "  2. 启动桥接: cd $BRIDGE_DIR && node dist/src/index.js &"
echo "  3. 测试: curl http://127.0.0.1:38441/health"
echo ""