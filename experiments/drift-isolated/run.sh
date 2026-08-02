#!/usr/bin/env bash
# Task 17 isolated runner — arm B only, trials 1-2, replicating Task 15 arm B
# exactly (fresh session per increment, same prompts, same model, serial)
# but with cwd under /tmp, outside any git repo carrying .claude/, so the
# project "performance" skill is not visible to the session.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASELINE="$HERE/baseline"
RUNS="$HERE/runs"
RESULTS="$HERE/results"
PROMPTS="$HERE/prompts"
MODEL="claude-opus-4-8"
TIMEOUT_SECS="${TIMEOUT_SECS:-600}"
TRIALS=2

mkdir -p "$RUNS" "$RESULTS"

setup_trial() {
  local dir="$1"
  if [ -f "$dir/.drift-setup-done" ]; then
    return 0
  fi
  echo "[$(date -Iseconds)] setup $dir"
  mkdir -p "$dir"
  rsync -a --exclude 'node_modules' --exclude 'result.json' --exclude 'transcript.txt' \
    --exclude 'stderr.txt' --exclude 'exit_code.txt' "$BASELINE/" "$dir/"
  cp -al "$BASELINE/node_modules" "$dir/node_modules"
  touch "$dir/.drift-setup-done"
}

snapshot_indexes() {
  grep -nE '@@(index|unique)\(' "$1/prisma/schema.prisma" 2>/dev/null || true
}

grade_increment() {
  local dir="$1" resdir="$2" incn="$3"
  mkdir -p "$resdir/increment$incn"
  cp "$dir/prisma/schema.prisma" "$resdir/increment$incn/schema.prisma"
  cp "$dir/src/queries.ts" "$resdir/increment$incn/queries.ts" 2>/dev/null || true
  snapshot_indexes "$dir" > "$resdir/increment$incn/indexes.txt"
}

run_increment_armB() {
  local trial="$1" incn="$2"
  local dir="$RUNS/armB-trial$trial"
  local resdir="$RESULTS/armB-trial$trial"
  mkdir -p "$resdir"
  setup_trial "$dir"
  if [ "$incn" -eq 1 ] && [ ! -f "$resdir/increment0" ]; then
    mkdir -p "$resdir/increment0"
    cp "$dir/prisma/schema.prisma" "$resdir/increment0/schema.prisma"
    cp "$dir/src/queries.ts" "$resdir/increment0/queries.ts"
    snapshot_indexes "$dir" > "$resdir/increment0/indexes.txt"
    touch "$resdir/increment0"
  fi
  if [ -f "$resdir/increment$incn/.done" ]; then
    echo "skip armB trial$trial increment$incn (done)"
    return 0
  fi
  echo "[$(date -Iseconds)] START armB trial$trial increment$incn -> $dir (fresh session, isolated cwd)"
  ( cd "$dir" && timeout "$TIMEOUT_SECS" claude -p "$(cat "$PROMPTS/increment-$incn.txt")" \
      --model "$MODEL" --dangerously-skip-permissions --output-format json \
      > "increment${incn}-result.json" 2> "increment${incn}-stderr.txt" )
  local rc=$?
  jq -r '.result // empty' "$dir/increment${incn}-result.json" > "$dir/increment${incn}-transcript.txt" 2>/dev/null
  mkdir -p "$resdir/increment$incn"
  cp "$dir/increment${incn}-transcript.txt" "$resdir/increment$incn/transcript.txt" 2>/dev/null || true
  echo "$rc" > "$resdir/increment$incn/exit_code.txt"
  grade_increment "$dir" "$resdir" "$incn"
  touch "$resdir/increment$incn/.done"
  echo "[$(date -Iseconds)] DONE armB trial$trial increment$incn rc=$rc"
}

for incn in 1 2 3 4; do
  for trial in $(seq 1 "$TRIALS"); do
    run_increment_armB "$trial" "$incn"
  done
done

echo "ALL DONE. results under $RESULTS"
