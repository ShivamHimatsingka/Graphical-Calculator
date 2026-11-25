# Offline model benchmark

24 maths word problems, sent exactly as the app sends them (system prompt + JSON output, thinking off).
A problem counts as correct when the model's rows contain the right equation(s), checked numerically.
Run on an Apple-silicon Mac with 16 GB, llama.cpp b12728, 2026-11-25.

| Model (file) | Size | Correct | Valid JSON | Rows parse | Avg. answer time |
| --- | --- | --- | --- | --- | --- |
| **Qwen3-4B-Instruct-2507** (Q3_K_M) | 2.1 GB | **22 / 24** | 24 | 24 | 18 s |
| Qwen3-1.7B (Q4_K_M) | 1.1 GB | 17 / 24 | 24 | 23 | 2 s |
| Qwen3-8B (Q4_K_M) | 5.0 GB | 16 / 24 | 24 | 24 | 16 s |
| Qwen3.5-9B (Q4_K_M) | 5.7 GB | 13 / 24 | 24 | 21 | 22 s |
| MiniCPM5-2B (Q4_K_M) | 1.6 GB | 12 / 24 | 23 | 18 | 6 s |
| Qwen3.5-4B (Q4_K_M) | 2.7 GB | 9 / 24 | 24 | 23 | 8 s |

## What this shows

* The newest models (Qwen3.5, MiniCPM5) and the hybrid Qwen3 8B publish very high maths scores, but those are with long
  "thinking" turned on. A thinking answer from Qwen3.5-4B took 191 s and 5,300 tokens, far too slow for a calculator.
  With thinking off (what the app needs) they are clearly worse than the plain **Instruct** models.
* So the catalog uses the Qwen3 *Instruct-2507* family: 1.7B for speed, 4B for the best accuracy per GB, and the 30B-A3B
  mixture-of-experts model (3B active parameters, so it stays fast) for 24 GB+ Macs. The 30B-A3B tiers and the Q6 variant of
  the 4B model were **not** measured here (they are same-family, higher-precision or larger); published scores put them above the 4B model.
* Failures of the 4B model were reading mistakes (for example treating "10,000 people" as 10), which the calculator's
  "Verified results" cannot catch because they check the curve, not the reading of the problem.

## Re-run it

```bash
llama-server -m your-model.gguf --port 18080 -c 8192 -ngl 99 &
node tools/bench/bench.js --url http://127.0.0.1:18080 --name your-model
# or several models in turn:
tools/bench/run_all.sh <dir containing llama-server> /tmp/out a.gguf b.gguf
```
