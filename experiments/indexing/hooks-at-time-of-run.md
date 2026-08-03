# User-level hooks in effect during every trial

Recorded 2026-08-03, after discovering that the existing disclosure was incomplete.

`claude-md-at-time-of-run.txt` discloses the user-level `~/.claude/CLAUDE.md`. That is
necessary and not sufficient: **hooks are configured in `~/.claude/settings.json`, not in
CLAUDE.md**, and they were in effect for every Claude trial in every experiment here. A
reader reproducing this work on a clean machine would not have them, so they are part of
the environment and belong in the disclosure.

## The hooks

Described rather than reproduced. The `SessionStart` command contains the operator's
personal calendar identifiers and a third party's business address, so pasting it into a
public repository would leak exactly what redacting the transcripts removed.

| Event | Matcher | What it does | Could it affect a trial? |
|---|---|---|---|
| `SessionStart` | `startup` | Injects an instruction to fetch the operator's calendars and summarize the day before the first response. Unrelated to the task. | **Yes — observed.** See below. |
| `SessionStart` | `compact` | Same instruction, on compaction. | Not observed; trials are short and none compacted. |
| `SessionEnd` | *(none)* | Commits and pushes two unrelated local directories. Touches nothing in the trial directory. | No. |
| `PreToolUse` | `Bash` | Two guards: a credential scanner and an scp-to-production guard. Both can block a `Bash` call. | **In principle.** No trial recorded a block; `permission_denials` is empty in every captured `result.json`. |

## What was actually observed

The `SessionStart` startup hook fired inside headless `claude -p` trial sessions and the
model sometimes acted on it or mentioned it. Traces appear in **9 of 144 committed
transcripts**, and a few of those nine are false positives — an application feature that
legitimately uses the phrase "calendar month" matches the same search.

The clearest instance, `runs-crossmodel/claude/arm1-trial4`, finished the application and
then appended a note about the hook wanting two calendars, naming the operator's personal
address. That address has been redacted from `transcript.txt` and `result.json`; the
surrounding paragraph is deliberately left intact, because it is the evidence that the
hook fired at all.

## How much this matters

Stated rather than rated away, per this project's standing practice on confounds.

**The honest assessment is that it is mild.** An instruction to summarize a calendar
carries no information about database indexing, so it is not plausible that it made a model
more or less likely to declare an index. It consumed a small amount of attention and, in
one case, some output tokens.

**The honest caveat is that nobody checked.** Task 17 verified that the project's
`performance` skill did not leak into trials run from `/tmp`, and it was thorough about
it. It did not check user-level hooks, which are a separate mechanism and did leak. The
isolation claim in that report should be read as scoped to what it tested.

**What a reproducer should do:** run with the hooks disabled, or note that theirs differ.
The environment is not just CLAUDE.md.
