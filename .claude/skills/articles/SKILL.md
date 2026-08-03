---
name: articles
description: Use when writing, editing, or publishing a public-facing article or post — and ALWAYS before anything is pushed to a public repository or pasted into a publishing tool. Covers the plain-text format rules, the accuracy discipline, and a scanner for credentials, personal data and infrastructure detail that must not ship.
---

# Articles

Two jobs: get the writing right, and make sure nothing ships that shouldn't.

## Before publishing — run the guard

    node --experimental-strip-types .claude/skills/articles/scanDisclosure.ts .

Exits non-zero on anything **blocking**. Two severities, and the split is the whole
design:

- **block** — credentials, API keys, private keys, real-looking email addresses, and a
  hosting provider named on the same line as a stated weakness.
- **review** — public IPs, infrastructure nouns on their own, absolute home paths. A
  person decides. The scanner prints them and does not fail.

**Why that split exists.** The scanner was written after a real leak, and the lesson was
not "flag more things." A malware scanner in an upload pipeline is an ordinary thing to
describe; flagging it teaches you to ignore the tool. What actually leaked was a hosting
provider, a named internal service, and an operational weakness *in one sentence, in a
public repo*. No regex judges that reliably. So the ingredients get surfaced and the
judgment stays with a person.

Findings are candidates, not verdicts — same discipline as any scanner. Read each one.

## What to check by hand, which no scanner catches

- **A named internal service beside a named host.** Either alone is usually fine.
- **A weakness stated in the past tense.** "We used to deploy without CI" is still a map.
- **Anything that identifies a person who did not consent** — colleagues, clients,
  addresses in transcripts, calendar identifiers.
- **Generated transcripts.** Agent sessions capture whatever was in the environment,
  including hook output. Transcripts are the most likely place for a surprise.

## Format, which is not a preference

- **Bodies are `.txt`. Never Markdown.** Markdown is for a renderer that isn't there;
  pasted into a publishing tool, `**`, `#` and `>` come through as literal characters.
- **Unindented, one line per paragraph, no hard wraps.** Two short lines that must stay
  apart need a blank line between them, or an unwrapper joins them.
- Check mechanically before shipping:

      grep -nE '^\s+|\*\*|^#|^>' article.txt     # expect no output
      grep -niE 'organis|behaviour|modelling|analyse|optimis|licence' article.txt
      wc -c article.txt

- **US spelling.** No *organisation*, *behaviour*, *modelling*, *analyse*, *optimise*,
  *licence*.

## Accuracy discipline

- **No unrun claims.** If a measurement wasn't taken, the article doesn't describe its
  result. Present tense with nothing behind it reads exactly like a report.
- **Every number traces to a committed file**, and the trace is checked line by line
  before publishing — not assumed. This is where errors actually live: a number that is
  internally consistent, reproducible, and wrong renders identically to a correct one.
- **Raw counts, never percentages, at small n.** "2 of 3" is not 67% of anything.
- **State which tier or configuration a claim belongs to.** A result from one harness is
  not a general law; say which.
- **Vendor claims get a dated citation** with the exact wording, or they don't appear.
  Vendor-published performance figures are attributed to the vendor or omitted.
- **Keep your own corrections in the piece** when they illustrate its subject. They are
  usually the most credible paragraphs available.
- **Length is chosen, not drifted into.** Measure it, and if it grows past the target,
  raise the target deliberately with a reason or cut.

## Publishing to a public repository

1. Run the guard. Resolve every **block**; read every **review**.
2. Check what the repo carries beyond the article — sample data, transcripts,
   disclosure files, generated projects.
3. Prefer a **private repo first**, reviewed, then flipped public. Going
   private-to-public is easy; the reverse undoes nothing.
4. Remember a force-push does not erase. Orphaned objects stay reachable by SHA and
   forks outlive the rewrite. Removing something from the branch people land on is real,
   but it is not deletion.
