#!/bin/zsh
set -e
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null; then
  echo '请先安装 Node.js 24 或更新版本。'
  read -k 1
  exit 1
fi
if ! test -d node_modules; then npm install; fi
if curl -fsS http://127.0.0.1:4317/api/health 2>/dev/null | /usr/bin/grep -q '"app":"harmonis"'; then
  open http://127.0.0.1:4317
  exit 0
fi
node src/server.js &
harmonis_pid=$!
trap 'kill "$harmonis_pid" 2>/dev/null || true' EXIT INT TERM
for harmonis_try in {1..50}; do
  if curl -fsS http://127.0.0.1:4317/api/health >/dev/null 2>&1; then open http://127.0.0.1:4317; break; fi
  sleep 0.2
done
echo 'Harmonis正在本机运行。保留此终端窗口；按 Control+C 停止服务。'
wait "$harmonis_pid"
