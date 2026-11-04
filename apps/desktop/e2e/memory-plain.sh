#!/usr/bin/env bash
# Startup memory without any automation attached: sums PSS of the whole Electron process tree. Usage: e2e/memory-plain.sh [electron flags]
set -u
cd "$(dirname "$0")/.."
UD=$(mktemp -d)
node_modules/electron/dist/electron --no-sandbox --user-data-dir="$UD" "$@" . >/dev/null 2>&1 &
PID=$!
sleep "${WAIT:-10}"
tree() { echo "$1"; for c in $(pgrep -P "$1"); do tree "$c"; done; }
total=0
for p in $(tree $PID); do
  kb=$(awk '/^Pss:/{s+=$2} END{print s+0}' /proc/$p/smaps_rollup 2>/dev/null || echo 0)
  type=$(tr '\0' ' ' < /proc/$p/cmdline | grep -o -- '--type=[a-z-]*' | head -1)
  printf "%-8s %-22s %5d MB\n" "$p" "${type:-main}" $((kb/1024))
  total=$((total+kb))
done
echo "TOTAL PSS $((total/1024)) MB"
kill $PID 2>/dev/null; sleep 1; pkill -P $PID 2>/dev/null; rm -rf "$UD"
