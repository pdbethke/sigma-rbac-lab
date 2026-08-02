# Hook verification: SessionStart + the N+1 scanner

Date: 2026-08-02
Claude Code version: `2.1.220` (`claude --version`)
Repo: `sigma-rbac-lab`, worktree `indexing-article`

## Run mechanism

```
node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts app
```

Confirmed working directly (same mechanism established in Task 4 for the scanner). No fallback to
`npx tsx` was needed. `package.json` already exposes this as `npm run scan`, but the hook command
below calls `node` directly so the article can show a self-contained line.

## Exact hook config committed (`.claude/settings.json`)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts app"
          }
        ]
      },
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "node --experimental-strip-types .claude/skills/performance/scanNPlusOne.ts app"
          }
        ]
      }
    ]
  }
}
```

## Matcher names: checked, not assumed

The plan (task-7-brief.md) asserted two things to verify against the installed version's real
documentation, not from memory:

1. `SessionStart` accepts `startup` and `compact` matchers — **confirmed**. Fetched the raw HTML of
   `https://code.claude.com/docs/en/hooks` (the current redirect target of
   `docs.claude.com/en/docs/claude-code/hooks`) and grepped the rendered matcher table directly,
   bypassing the AI-summarized fetch (which is a small model and not to be trusted at face value).
   The raw table row reads: `SessionStart` / "how the session started" / `startup, resume, clear,
   compact, fork`. Then verified by firing it (below): both `SessionStart:startup` and
   `SessionStart:compact` actually invoked the configured hook.

2. **"No `PostCompact` event exists" — this is FALSE.** It does exist. Confirmed two independent
   ways:
   - The same raw docs fetch has a dedicated `id="postcompact"` section: "Runs after Claude Code
     completes a compact operation... The same matcher values apply as for `PreCompact`" (i.e.
     `manual` / `auto`).
   - Directly in the installed binary: `grep -o PostCompact
     ~/.vscode/extensions/anthropic.claude-code-2.1.220-linux-x64/extension.js` matches, in a literal
     array of hook event names: `..."PreCompact","PostCompact","PermissionRequest",...`. This is the
     2.1.220 build actually installed, not just the latest online docs.

   This contradicts the design doc's original claim
   (`docs/superpowers/specs/2026-08-02-indexing-article-design.md`, "Claude Code has no `PostCompact`
   hook"). **The tool is right and the plan was wrong.** That file has been corrected in place (see
   the "Correction" paragraph added there) rather than silently deleting the wrong claim, so the
   discrepancy is visible in-repo.

   This does not change the hook config: `SessionStart` with matcher `compact` is still a valid,
   working choice — it was chosen (and verified below) independent of whether `PostCompact` exists.
   `PostCompact` is a *different* event that could also have carried this hook, but wasn't used here.

## Firing it and observing it

### `startup` — OBSERVED

Command used, from the repo root:

```
claude -p "reply with the single word ok" --dangerously-skip-permissions --output-format stream-json --verbose --debug hooks --debug-file <scratch>/debug-hooks.log
```

Verbatim from the debug log (`[DEBUG]` line, hook name `SessionStart:startup`):

```
Hook SessionStart:startup (SessionStart) success:
N+1 scan: 1 candidate(s) in app
  app/src/queries.ts:140  [unincluded-relation] Relation read on a record fetched without include or select. Each access may issue its own query.
```

The same text also appears as a `hook_response` system event in the `--output-format stream-json`
transcript, with `"hook_name": "SessionStart:startup"`.

### `compact` — OBSERVED

A single-turn session has "not enough messages to compact" (confirmed by trying `/compact`
immediately after one exchange — `compact_error: "Not enough messages to compact."`). To get a real
compaction, a session with several tool-using turns (reading files, listing a directory) was driven
headlessly via `--input-format stream-json`, ending with a `/compact` user message. That produced a
real compaction (`"compact_result": "success"`), and the `SessionStart:compact` matcher fired as part
of it. Verbatim from the debug log:

```
Hook SessionStart:compact (SessionStart) success:
N+1 scan: 1 candidate(s) in app
  app/src/queries.ts:140  [unincluded-relation] Relation read on a record fetched without include or select. Each access may issue its own query.
```

This also appeared as a `hook_response` system event in the stream-json transcript with
`"hook_name": "SessionStart:compact"`, immediately after a `system`/`status` event showing
`"status": "compacting"` and before the `"compact_result": "success"` status event.

Both matchers are therefore **observed firing**, not merely configured. Neither run was faked or
predicted — both are copied verbatim from actual `--debug hooks` log output captured during this
task.

## Caveats for the article

- The scanner output is identical on both firings because the corpus (`app/`) didn't change between
  them — that's expected, not a bug in the observation.
- Alongside the scanner hook, this environment has other unrelated global `SessionStart` hooks
  (a calendar-agenda reminder, a `superpowers` skill loader, a `last30days` readiness notice)
  registered in the user's own `~/.claude/settings.json`. Those are pre-existing and not part of
  this task's deliverable; they're visible in the verbatim log excerpts only because they share the
  same `SessionStart` event and appear as separate hook entries before the scanner's.
