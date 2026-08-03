#!/usr/bin/env bash
# Task 18 runner — cross-tier arm-B-only replication of Task 16 (imitation control),
# run OUTSIDE the repository from /tmp. Models: gemini-3.6-flash, codex (CLI default).
# Arm B only (fresh session per increment) per the task brief's cost-reduction note.
# Serial, one session at a time, interleaved by model. Failed sessions left in place,
# counted, never retried.
set -uo pipefail

HERE="/tmp/claude-drift-tiers"
BASELINE="$HERE/baseline"
RUNS="$HERE/runs"
RESULTS="$HERE/results"
PROMPTS="$HERE/prompts"
TIMEOUT_SECS="${TIMEOUT_SECS:-600}"
TRIALS=3
MODELS=(gemini codex)

mkdir -p "$RUNS" "$RESULTS"

# The baseline project ships its own .env (DATABASE_URL). gemini's dotenv lookup
# stops at the first .env it finds walking from cwd, so a project .env in the
# trial directory prevents it from ever reading ~/.gemini/.env for the API key,
# and it falls back to scope-insufficient cached OAuth creds. Fix: export the key
# into this script's own environment (inherited by the gemini subprocess only,
# never printed, never copied to a file) so lookup order can't matter.
set -a
source ~/.gemini/.env
set +a

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
  # Gemini needs its own settings.json in the immediate cwd (does not walk up).
  mkdir -p "$dir/.gemini"
  echo '{"security":{"auth":{"selectedType":"gemini-api-key"}}}' > "$dir/.gemini/settings.json"
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

run_increment_gemini() {
  local trial="$1" incn="$2"
  local dir="$RUNS/gemini-trial$trial"
  local resdir="$RESULTS/gemini-trial$trial"
  mkdir -p "$resdir"
  setup_trial "$dir"
  if [ "$incn" -eq 1 ] && [ ! -f "$resdir/increment0" ]; then
    mkdir -p "$resdir/increment0"
    cp "$dir/prisma/schema.prisma" "$resdir/increment0/schema.prisma"
    snapshot_indexes "$dir" > "$resdir/increment0/indexes.txt"
    touch "$resdir/increment0"
  fi
  if [ -f "$resdir/increment$incn/.done" ]; then
    echo "skip gemini trial$trial increment$incn (done)"
    return 0
  fi
  echo "[$(date -Iseconds)] START gemini trial$trial increment$incn -> $dir (fresh session)"
  ( cd "$dir" && timeout "$TIMEOUT_SECS" gemini -m gemini-3.6-flash -o text --approval-mode yolo \
      -p "$(cat "$PROMPTS/increment-$incn.txt")" \
      > "increment${incn}-transcript.txt" 2> "increment${incn}-stderr.txt" )
  local rc=$?
  mkdir -p "$resdir/increment$incn"
  cp "$dir/increment${incn}-transcript.txt" "$resdir/increment$incn/transcript.txt" 2>/dev/null || true
  echo "$rc" > "$resdir/increment$incn/exit_code.txt"
  grade_increment "$dir" "$resdir" "$incn"
  touch "$resdir/increment$incn/.done"
  echo "[$(date -Iseconds)] DONE gemini trial$trial increment$incn rc=$rc"
}

run_increment_codex() {
  local trial="$1" incn="$2"
  local dir="$RUNS/codex-trial$trial"
  local resdir="$RESULTS/codex-trial$trial"
  mkdir -p "$resdir"
  setup_trial "$dir"
  if [ "$incn" -eq 1 ] && [ ! -f "$resdir/increment0" ]; then
    mkdir -p "$resdir/increment0"
    cp "$dir/prisma/schema.prisma" "$resdir/increment0/schema.prisma"
    snapshot_indexes "$dir" > "$resdir/increment0/indexes.txt"
    touch "$resdir/increment0"
  fi
  if [ -f "$resdir/increment$incn/.done" ]; then
    echo "skip codex trial$trial increment$incn (done)"
    return 0
  fi
  echo "[$(date -Iseconds)] START codex trial$trial increment$incn -> $dir (fresh session)"
  ( cd "$dir" && timeout "$TIMEOUT_SECS" codex exec --skip-git-repo-check --sandbox workspace-write \
      "$(cat "$PROMPTS/increment-$incn.txt")" </dev/null \
      > "increment${incn}-transcript.txt" 2> "increment${incn}-stderr.txt" )
  local rc=$?
  mkdir -p "$resdir/increment$incn"
  cp "$dir/increment${incn}-transcript.txt" "$resdir/increment$incn/transcript.txt" 2>/dev/null || true
  echo "$rc" > "$resdir/increment$incn/exit_code.txt"
  grade_increment "$dir" "$resdir" "$incn"
  touch "$resdir/increment$incn/.done"
  echo "[$(date -Iseconds)] DONE codex trial$trial increment$incn rc=$rc"
}

run_increment_claude() {
  local trial="$1" incn="$2"
  local dir="$RUNS/claude-trial$trial"
  local resdir="$RESULTS/claude-trial$trial"
  mkdir -p "$resdir"
  setup_trial "$dir"
  if [ "$incn" -eq 1 ] && [ ! -f "$resdir/increment0" ]; then
    mkdir -p "$resdir/increment0"
    cp "$dir/prisma/schema.prisma" "$resdir/increment0/schema.prisma"
    snapshot_indexes "$dir" > "$resdir/increment0/indexes.txt"
    touch "$resdir/increment0"
  fi
  if [ -f "$resdir/increment$incn/.done" ]; then
    echo "skip claude trial$trial increment$incn (done)"
    return 0
  fi
  echo "[$(date -Iseconds)] START claude trial$trial increment$incn -> $dir (fresh session)"
  ( cd "$dir" && timeout "$TIMEOUT_SECS" claude -p "$(cat "$PROMPTS/increment-$incn.txt")" \
      --model claude-opus-4-8 --dangerously-skip-permissions --output-format json \
      > "increment${incn}-result.json" 2> "increment${incn}-stderr.txt" )
  local rc=$?
  jq -r '.result // empty' "$dir/increment${incn}-result.json" > "$dir/increment${incn}-transcript.txt" 2>/dev/null
  mkdir -p "$resdir/increment$incn"
  cp "$dir/increment${incn}-transcript.txt" "$resdir/increment$incn/transcript.txt" 2>/dev/null || true
  echo "$rc" > "$resdir/increment$incn/exit_code.txt"
  grade_increment "$dir" "$resdir" "$incn"
  touch "$resdir/increment$incn/.done"
  echo "[$(date -Iseconds)] DONE claude trial$trial increment$incn rc=$rc"
}

if [ "${RUN_MODE:-full}" = "claude-only" ]; then
  for incn in 1 2 3 4; do
    for trial in $(seq 1 "$TRIALS"); do
      run_increment_claude "$trial" "$incn"
    done
  done
else
  for incn in 1 2 3 4; do
    for trial in $(seq 1 "$TRIALS"); do
      run_increment_gemini "$trial" "$incn"
      run_increment_codex "$trial" "$incn"
    done
  done
fi

echo "ALL DONE. results under $RESULTS"
