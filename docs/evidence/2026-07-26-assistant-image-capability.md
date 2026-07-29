# Transcript — the Assistant denies a capability it has

2026-07-26. The Sigma Assistant was asked whether it could read and interpret a mermaid ERD
uploaded as a PNG. It said no, unambiguously. The image was then attached anyway, and it read it
correctly.

**Provenance:** captured from the Assistant's replies as pasted into the working session, not
observed directly by the author of this file. The quotes are verbatim; the surrounding exchange is
not complete. Treated as evidence, but weaker evidence than
[the SQL filter transcript](2026-07-25-assistant-sql-filter-transcript.md), which was captured live.

The diagram used is [`docs/erd/rbac-erd.png`](../erd/rbac-erd.png), generated from
`datapackage.json` via `docs/erd/rbac-erd.mmd`.

---

**User:** can you read and interpret mermaid diagrams uploaded as a png?

**Assistant:**

> I cannot read or interpret images, including PNG files of mermaid diagrams. I don't have vision or
> image analysis capabilities—I can only work with text-based content.
>
> However, if you have a mermaid diagram you'd like me to work with, you could:
>
> - Paste the mermaid code directly as text in the chat, and I can interpret the diagram structure
>   from the code itself
> - Describe what the diagram shows in text […]
> - Copy any text, labels, or relationships from the diagram […]

*(The image was then attached.)*

**Assistant:**

> Perfect! I can see your RBAC (Role-Based Access Control) model ERD. This shows a comprehensive
> authorization system with 9 tables and their relationships.
>
> **Key Relationships from the ERD:**
>
> - **User Identity:** Users → Job Titles → Departments, Users → Platform Roles
> - **Authorization Core:** Users → Assignments → Roles → Permissions → Resources
> - **Scoping:** Assignments → Scopes (with null = global scope)
> - **Activity:** Users → Sessions (acting_as)
> - **Audit:** Assignments track granted_by and granted_at

It also matched the diagram against the input tables already present in the workbook, and listed
them correctly.

---

## What it actually got from the image

Not OCR. Comprehension of the model:

| Read correctly | Why it is not trivial |
|---|---|
| The full authorization path, `Users → Assignments → Roles → Permissions → Resources` | Requires following four foreign keys through a junction table, not reading adjacent boxes |
| `null = global` on the scope relationship | An annotation on one crow's-foot line; it is the single most load-bearing fact in the model, and the reason every resolution join to scopes must be LEFT |
| `granted_by` / `granted_at` identified as **audit** fields | Nothing labels them as such — that is inferred from a grant being an entity rather than a link row |
| `sessions.acting_as` identified as **activity**, distinct from the authorization core | The diagram does not separate them; the distinction is semantic |

One slip: it said "9 tables" and then listed ten. The nine-table count is correct for the
authorization model and matches the repo's own phrasing, so it may have been reading the
subheading rather than counting — but it is a miscount either way, and it is in the prose rather
than the reading.

## Why this is kept

**It denied a capability it has.** Not a hedge, not a caveat — a flat, confident statement of
incapacity, immediately falsified by its own next reply.

This inverts the practical rule that
[the SQL evidence file](2026-07-25-assistant-generated-sql.md) arrives at:

> *Ask it what it could and couldn't see; it answers accurately.*

That rule held for the case it was drawn from. Describing an artifact it had not observed, the
Assistant correctly said it could not see the join configuration, correctly flagged its answer as
conceptual, and was accurate about every mechanism. **Self-report about an artifact was reliable.
Self-report about its own capabilities was not.**

Those are different claims and they need different handling:

- *"I inferred this rather than observed it"* — a statement about provenance, reliably accurate here.
- *"I cannot do X"* — a statement about capability, wrong here, and wrong in a way nothing in the
  conversation would have surfaced.

## The asymmetry worth noticing

Over-claiming a capability produces a broken result you will notice. **Under-claiming produces a
capability you never use.** There is no error message, no empty grid, no failed publish — just a
path not taken, on the model's own advice. The test nearly did not happen.

That failure mode is quieter than anything else in this repo, and it is the only one where the
artifact is *absence*.

## Both findings, one shape

| | Prose | Artifact / behaviour |
|---|---|---|
| Generated SQL (2026-07-25) | accurate hedge: "likely", "conceptual" | dropped the hedge; INNER recorded where LEFT was used |
| Image capability (2026-07-26) | inaccurate: "I don't have vision" | read the diagram correctly |

Opposite directions, same lesson: **the prose is not the evidence.** In neither case could the
difference be seen without checking the thing itself.

**Revised practical rule:** treat a model's account of *what it did* as reliable and its account of
*what it can do* as a hypothesis. Capability claims are cheap to test. Test them.
