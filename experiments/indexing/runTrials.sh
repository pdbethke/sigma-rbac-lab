#!/usr/bin/env bash
# experiments/indexing/runTrials.sh — run N trials per arm in fresh directories.
#
# Each trial runs in an empty directory so no project CLAUDE.md, no repo files and no
# prior session state can influence it. The user-level ~/.claude/CLAUDE.md still applies
# and is committed alongside the results for disclosure.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRIALS="${TRIALS:-5}"
RUNS="$HERE/runs"

for arm in 1 2; do
  for trial in $(seq 1 "$TRIALS"); do
    dir="$RUNS/arm${arm}-trial${trial}"
    if [ -d "$dir" ]; then
      echo "skip $dir (exists)"
      continue
    fi
    mkdir -p "$dir"
    echo "running arm${arm} trial${trial}"
    ( cd "$dir" && claude -p "$(cat "$HERE/prompt-arm${arm}.txt")" \
        --dangerously-skip-permissions > transcript.txt 2>&1 ) || \
      echo "arm${arm} trial${trial} exited non-zero; see $dir/transcript.txt"
  done
done

echo "done. results under $RUNS"
