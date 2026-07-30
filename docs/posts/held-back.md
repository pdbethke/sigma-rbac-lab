# Held back

One good post a week beats a thesis nobody finishes. Still unspent:

- **The agent scoped by absence** — it never declined anything; the rows were not there. The cover /
  control framing in `../FIELD_GUIDE.md` is the whole argument in two lines.
- **Sentinels over nulls** — `ALL SCOPES` and `NO SCOPES` as real rows, because intent should be
  stated rather than inferred from an absence.
- **Global has to mean all** — why enumerating a global grant as three store grants breaks the moment
  a fourth store arrives. Step 23 in `../BUILD_LOG.md`.
- **Shared memory needs a trust tier** — cut from `03-containment.txt` because, aimed at a
  just-announced feature, it read as a warning rather than as design guidance. It is a better post on
  its own terms: a herd of models can share one searchable memory safely if entries are tiered by
  provenance, where a human-promoted lesson injects into instructions and a repository's own docs stay
  searchable but never injected — so a repo you don't control cannot smuggle trusted guidance in just
  by shipping a file. Frame it around what corralai does, not around what anyone else might not do.
- **Where your inference runs** — the three-arrangement framing (in-warehouse, platform-mediated,
  third-party assistant) is genuinely useful to anyone adopting agents and almost nobody has laid it
  out cleanly. Currently a section inside `04`; it could carry a post alone.

- **The supply chain nobody is reviewing** — cut from `05-corpus-supply-chain.txt` on 2026-07-30 for
  being written at a different audience. It is the strongest builder-facing material in the set and it
  deserves its own piece rather than a section that loses every non-technical reader in the back half.

  The spine, kept verbatim because the lines are good:

  Coding agents read instruction files out of the repository you have open. Conventions vary by tool,
  but the pattern is consistent — a file at the project root carrying standing guidance, a directory of
  packaged capabilities the agent can pick up, declarations of external tools it may call. All of it
  plain text, all of it arriving with the clone.

  *Cloning a repository that ships agent instructions is running a stranger's standing orders inside
  your agent, with your credentials and your file access. It is the same shape as piping a script from
  the internet into a shell, and almost nobody treats it that way, because it is a markdown file and
  markdown files feel like documentation.*

  Packaged capabilities are the more interesting case. A skill is a standing instruction with a
  trigger, and the trigger is judged by the model against the task at hand. So the boundary is not a
  permission, it is a relevance decision — an attacker does not need to get their instruction loaded,
  they need to make it look applicable.

  *We built an entire discipline around not running unreviewed code. Then we invented a way to ship
  unreviewed instructions, and put it in a file format that looks like a README.*

  **Hedge it the same way the draft did**, in the text: these are claims about tools not built by us,
  and the details change. State the shape of the question — which files load automatically, which load
  conditionally, who can write them, does anyone review that content like a dependency — and tell
  readers to check their own tooling. Same discipline that stripped the Assistant claims from `04`.
