#!/usr/bin/env bash
# experiments/indexing/runCrossModel.sh — Task 14: interleaved claude/gemini/codex runner.
#
# Work list is a full rotation of model x arm x trial, interleaved so no model and no
# arm is grouped in time: claude/arm1/1, gemini/arm1/1, codex/arm1/1, claude/arm2/1,
# gemini/arm2/1, codex/arm2/1, claude/arm1/2, ... Serial only — never parallelized,
# never retried on failure.
#
# No API key is referenced here for any model. Gemini loads its key on its own from
# ~/.gemini/.env; this script only writes the per-trial-directory auth *mode* selector
# (.gemini/settings.json), which contains no secret. Codex is already authenticated
# under the machine's ChatGPT-account entitlement; no key or model id is passed to it.
#
# Claude runs with --output-format json so total_cost_usd (API-equivalent pricing, not
# a charge under this Max-subscription/OAuth setup) can be recorded per trial. .result
# is extracted into transcript.txt so downstream quote extraction is unaffected;
# result.json is kept alongside for the cost field. Gemini and Codex expose no
# comparable per-session cost field — recorded as NULL, not estimated.
set -uo pipefail  # no -e: one trial failing must not abort the rest of the rotation

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRIALS="${TRIALS:-5}"
RUNS="$HERE/runs-crossmodel"
CLAUDE_MODEL="claude-opus-4-8"
GEMINI_MODEL="gemini-3.6-flash"
TIMEOUT_SECS="${TIMEOUT_SECS:-600}"

worklist=()
for trial in $(seq 1 "$TRIALS"); do
  for arm in 1 2; do
    for model in claude gemini codex; do
      worklist+=("${model}/arm${arm}/${trial}")
    done
  done
done

echo "=== work list (${#worklist[@]} trials) ==="
for w in "${worklist[@]}"; do echo "$w"; done
echo "=========================================="

if [ "${PRINT_ONLY:-0}" = "1" ]; then
  exit 0
fi

for entry in "${worklist[@]}"; do
  IFS='/' read -r model armlabel trial <<< "$entry"
  arm="${armlabel#arm}"
  dir="$RUNS/$model/arm${arm}-trial${trial}"
  if [ -d "$dir" ]; then
    echo "skip $dir (exists)"
    continue
  fi
  mkdir -p "$dir"
  echo "[$(date -Iseconds)] START $model arm${arm} trial${trial} -> $dir"
  case "$model" in
    claude)
      ( cd "$dir" && timeout "$TIMEOUT_SECS" claude -p "$(cat "$HERE/prompt-arm${arm}.txt")" \
          --model "$CLAUDE_MODEL" --dangerously-skip-permissions --output-format json \
          > result.json 2> stderr.txt )
      rc=$?
      if [ -s "$dir/result.json" ]; then
        jq -r '.result // empty' "$dir/result.json" > "$dir/transcript.txt" 2>/dev/null
      fi
      if [ ! -s "$dir/transcript.txt" ]; then
        cat "$dir/stderr.txt" "$dir/result.json" > "$dir/transcript.txt" 2>/dev/null
      fi
      ;;
    gemini)
      mkdir -p "$dir/.gemini"
      printf '{"security":{"auth":{"selectedType":"gemini-api-key"}}}' > "$dir/.gemini/settings.json"
      ( cd "$dir" && timeout "$TIMEOUT_SECS" gemini -m "$GEMINI_MODEL" --approval-mode yolo \
          "$(cat "$HERE/prompt-arm${arm}.txt")" > transcript.txt 2>&1 )
      rc=$?
      ;;
    codex)
      ( cd "$dir" && timeout "$TIMEOUT_SECS" codex exec --skip-git-repo-check \
          --sandbox workspace-write "$(cat "$HERE/prompt-arm${arm}.txt")" \
          < /dev/null > transcript.txt 2>&1 )
      rc=$?
      ;;
    *)
      echo "unknown model: $model"; rc=99
      ;;
  esac
  echo "$rc" > "$dir/exit_code.txt"
  if [ "$rc" -ne 0 ]; then
    echo "[$(date -Iseconds)] DONE $model arm${arm} trial${trial} exited $rc; see $dir/transcript.txt"
  else
    echo "[$(date -Iseconds)] DONE $model arm${arm} trial${trial} ok"
  fi
done

echo "ALL DONE. results under $RUNS"
