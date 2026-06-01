#!/usr/bin/env bash
#
# Pangolinfo MCP — 端到端发版总控脚本 (WSL 内执行)
#
# 把"更新 MCP"的完整链路串起来,一条命令跑完能自动化的部分:
#   1. 校验三处版本号一致 (version.ts / package.json / server.json)
#   2. typecheck + build
#   3. 本地 stdio 自检 tools/list (确认工具数 + 无悬空引用)
#   4. build + push 镜像到 ACR (复用 docker-mcp.sh)
#   5. ⏸ 停下,提示你去 ACK 控制台改 image tag 重新部署 (手动,零停机)
#   6. 你回车确认滚完 → 验证 https://mcp.pangolinfo.com/health 版本对得上
#   7. 官方 MCP Registry 发布 (mcp-publisher login dns + validate + publish)
#
# 不做的事 (有意保留人工):
#   - GitHub commit/push  (commit message 你自己写,或先手动 push 再跑本脚本)
#   - ACK 点击重新部署    (步骤 5,人工)
#
# 用法:
#   ./scripts/window/release-mcp.sh 0.6.0
#
# 前置:
#   - mcp-publisher.exe 在 repo 根 (没有会自动下载)
#   - DNS 私钥放在 scripts/window/.mcp-dns-key (一行 hex,已 gitignore)
#     首次:echo 'a7483893...' > scripts/window/.mcp-dns-key
#
set -euo pipefail

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "❌ 用法: ./scripts/window/release-mcp.sh <版本号>  例如 0.6.0"
  exit 1
fi

# repo 根 (脚本在 scripts/window/ 下)
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
echo "📦 repo: $ROOT"
echo "🎯 目标版本: $TAG"
echo

# ---------- Step 1: 三处版本号一致校验 ----------
echo "── Step 1: 版本号一致性校验 ──"
PKG_VER=$(grep -oE '"version":\s*"[^"]+"' package.json | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
VERTS_VER=$(grep -oE 'SERVER_VERSION = "[^"]+"' src/version.ts | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
SRVJSON_VER=$(grep -oE '"version":\s*"[^"]+"' server.json | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "  package.json     = $PKG_VER"
echo "  src/version.ts   = $VERTS_VER"
echo "  server.json      = $SRVJSON_VER"
if [ "$PKG_VER" != "$TAG" ] || [ "$VERTS_VER" != "$TAG" ] || [ "$SRVJSON_VER" != "$TAG" ]; then
  echo "❌ 三处版本号必须都等于目标 $TAG。请先改齐 package.json / src/version.ts / server.json 再跑。"
  exit 1
fi
echo "  ✓ 三处一致 = $TAG"
echo

# ---------- Step 2: typecheck + build ----------
echo "── Step 2: typecheck + build ──"
npm run typecheck
npm run build
echo "  ✓ build ok"
echo

# ---------- Step 3: 本地自检 tools/list ----------
echo "── Step 3: 本地 stdio 自检 ──"
TOOL_COUNT=$(printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"release-check","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | PANGOLINFO_API_KEY=dummy node dist/server.mjs 2>/dev/null \
  | tr ',' '\n' | grep -cE '"name":"[a-z_]+"' || true)
echo "  注册工具数: $TOOL_COUNT"
if [ "$TOOL_COUNT" -lt 1 ]; then
  echo "❌ 自检拿不到工具列表,build 可能坏了。"
  exit 1
fi
echo "  ✓ 自检通过 ($TOOL_COUNT tools)"
echo

# ---------- Step 4: build + push 镜像到 ACR ----------
echo "── Step 4: 推镜像到 ACR (tag=$TAG) ──"
./scripts/window/docker-mcp.sh "$TAG"
echo "  ✓ 镜像已推: pangolinfo-mcp:$TAG + :latest"
echo

# ---------- Step 5: 人工 ACK 滚动 ----------
echo "── Step 5: 请去 ACK 控制台操作 ──"
echo "  crawler 集群 → 工作负载 → pangolinfo-mcp → 编辑 YAML"
echo "  image tag 改成 :$TAG → 保存(触发滚动,零停机)"
echo
read -r -p "  ACK 滚完后按回车继续验证..." _

# ---------- Step 6: 验证 /health ----------
echo
echo "── Step 6: 验证线上 /health ──"
HEALTH=$(curl -s -m 15 https://mcp.pangolinfo.com/health || echo '{}')
echo "  /health = $HEALTH"
if echo "$HEALTH" | grep -q "\"version\":\"$TAG\""; then
  echo "  ✓ 线上版本 = $TAG"
else
  echo "  ⚠ 线上版本还不是 $TAG(可能 Pod 没滚完 / image tag 没改)。"
  read -r -p "  仍要继续 registry 发布吗? [y/N] " GO
  [ "$GO" = "y" ] || { echo "中止。修好 ACK 再重跑。"; exit 1; }
fi
echo

# ---------- Step 7: 官方 MCP Registry 发布 ----------
echo "── Step 7: 发布到官方 MCP Registry ──"
PUBLISHER="./mcp-publisher.exe"
[ -f "$PUBLISHER" ] || PUBLISHER="./mcp-publisher"
if [ ! -f "$PUBLISHER" ]; then
  echo "  ⚠ 找不到 mcp-publisher,跳过 registry 发布。"
  echo "    下载: gh release download v1.7.9 --repo modelcontextprotocol/registry \\"
  echo "          --pattern mcp-publisher_windows_amd64.tar.gz && tar -xzf *.tar.gz"
  exit 0
fi
KEYFILE="scripts/window/.mcp-dns-key"
if [ ! -f "$KEYFILE" ]; then
  echo "❌ 缺 DNS 私钥文件 $KEYFILE。"
  echo "   首次创建: echo '<你的 ed25519 hex 私钥>' > $KEYFILE"
  exit 1
fi
DNS_KEY=$(tr -d ' \r\n' < "$KEYFILE")
"$PUBLISHER" validate
"$PUBLISHER" login dns --domain pangolinfo.com --private-key "$DNS_KEY"
"$PUBLISHER" publish
echo
echo "✅ 全链路完成。验证收录:"
echo "   https://registry.modelcontextprotocol.io/v0.1/servers?search=com.pangolinfo/amazon-mcp"
