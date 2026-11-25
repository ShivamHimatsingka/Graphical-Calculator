#!/bin/bash
# usage: run_all.sh <llama-server dir> <out dir> model1.gguf [model2.gguf ...]
# Starts each model in turn, runs the benchmark, stops it.
SRV="$1"; OUT="$2"; shift 2; mkdir -p "$OUT"
for m in "$@"; do
  name=$(basename "$m" .gguf)
  "$SRV/llama-server" -m "$m" --host 127.0.0.1 --port 18090 -c 8192 -ngl 99 --no-webui --alias local -np 1 >"$OUT/$name.server.log" 2>&1 &
  pid=$!
  for i in $(seq 1 120); do sleep 1; curl -s -m 2 http://127.0.0.1:18090/health | grep -q ok && break; done
  node "$(dirname "$0")/bench.js" --url http://127.0.0.1:18090 --name "$name" --out "$OUT" ${THINKING:+--thinking $THINKING} > "$OUT/$name.log" 2>&1
  kill $pid; wait $pid 2>/dev/null
done
echo ALL-DONE
