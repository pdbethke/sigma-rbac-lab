# The SQL the Assistant generated

Captured 2026-07-25. The Assistant was asked to reproduce the hand-built `Resolution` element. This
is the query behind `Resolution v2`, shown here with the backend `WHERE` filter removed (see
[the transcript](2026-07-25-assistant-sql-filter-transcript.md) for that part).

```sql
-- Join all tables to resolve user permissions (no backend filter)
SELECT
  a."USER_ID" as "User Id",
  r."RESOURCE_NAME" as "Resource Name",
  COALESCE(s."SCOPE_NAME", 'ALL SCOPES (global)') as "Scope",
  p."PERMISSION_ID" as "Permission Id",
  p."ROLE_ID" as "Role Id",
  p."RESOURCE_ID" as "Resource Id",
  p."CAN_VIEW" as "Can View",
  p."CAN_EDIT" as "Can Edit",
  a."ASSIGNMENT_ID" as "Assignment Id",
  a."ROLE_ID" as "Role Id (Assignments)",
  a."SCOPE_ID" as "Scope Id",
  a."GRANTED_BY" as "Granted By",
  a."GRANTED_AT" as "Granted At",
  a."STATUS" as "Status",
  r."RESOURCE_ID" as "Resource Id (Resources)",
  r."RESOURCE_KEY" as "Resource Key",
  r."RESOURCE_TYPE" as "Resource Type",
  r."SORT_ORDER" as "Sort Order",
  r."UNIVERSAL" as "Universal",
  r."DESCRIPTION" as "Description",
  s."SCOPE_ID" as "Scope Id (Scopes)",
  s."SCOPE_KEY" as "Scope Key",
  s."SCOPE_NAME" as "Scope Name",
  s."SCOPE_TYPE" as "Scope Type",
  u."USER_ID" as "User Id (Users)",
  u."USER_NAME" as "User Name",
  u."EMAIL" as "Email",
  u."JOB_TITLE_ID" as "Job Title Id",
  u."PLATFORM_ROLE_ID" as "Platform Role Id",
  MAX(p."CAN_VIEW") OVER (PARTITION BY a."USER_ID", r."RESOURCE_NAME") as "Max of Can View",
  MAX(p."CAN_EDIT") OVER (PARTITION BY a."USER_ID", r."RESOURCE_NAME") as "Max of Can Edit"
FROM "elements"."output"."P_NoluRDR7" a
INNER JOIN "elements"."output"."FVZ6UBJBHJ" p ON a."ROLE_ID" = p."ROLE_ID"
INNER JOIN "elements"."output"."tSOkE4p_UX" r ON p."RESOURCE_ID" = r."RESOURCE_ID"
LEFT  JOIN "elements"."output"."0uCOR3n-aj" s ON a."SCOPE_ID" = s."SCOPE_ID"
INNER JOIN "elements"."output"."tNLlaCqSKf" u ON a."USER_ID" = u."USER_ID"
ORDER BY "User Id", "Resource Name", "Scope"
```

## What it got right

**The scopes join is LEFT.** This is the one that matters for correctness on this data — five of the
grants are global, with a null `Scope Id`. An inner join there returns 4 rows instead of 9 and
drops every global grant. It got that right.

**The aliases reproduce Sigma's qualification convention exactly** — `Role Id (Assignments)`,
`Resource Id (Resources)`, `Scope Id (Scopes)`, `User Id (Users)`. It understood the target
precisely.

**The output is correct.** 6 rows, matching the hand-built element and the SQL oracle.

## What differs, and why it matters later

### Three INNER joins where the hand-built version uses LEFT

| Join | Hand-built | Generated |
|---|---|---|
| → permissions | LEFT | **INNER** |
| → resources | LEFT | **INNER** |
| → scopes | LEFT | LEFT ✅ |
| → users | LEFT | **INNER** |

Identical output **today**. A different failure mode **tomorrow**.

Delete a user, drop a resource, or revoke a role's last permission, and the inner joins drop those
rows **without an error**. The LEFT version returns them with nulls in one column, which names the
missing source on sight. That is the entire diagnosability argument this lab was built around: a
multi-source inner join returns `0 rows` identically no matter which source failed, with no error
and nothing to inspect.

Two elements, the same rows, one of which degrades into an undiagnosable blank.

### Table references are opaque element IDs

```
"elements"."output"."P_NoluRDR7"     "elements"."output"."FVZ6UBJBHJ"
"elements"."output"."tSOkE4p_UX"     "elements"."output"."0uCOR3n-aj"
"elements"."output"."tNLlaCqSKf"
```

Not malice — that is simply how Sigma addresses elements. But reviewing this query for correctness
requires separately resolving five opaque handles to five elements. **The artifact cannot be audited
on its own terms.**

### Window functions, not GROUP BY

`MAX(...) OVER (PARTITION BY ...)` does **not** collapse rows. The query returns one row per join
row; the 6 rows displayed come from a **UI grouping layered on top of it**. Two aggregation
mechanisms stacked, doing similar work at different layers — and only one of them is visible in the
element.

---

## ⭐ And then it misdescribed the human-built element the same way

Asked separately to give "the equivalent SQL" for the **original, hand-built** `Resolution`, the
Assistant correctly noted the element was built visually rather than from SQL, correctly flagged its
answer as conceptual, and produced this:

```sql
FROM       "elements"."output"."P_NoluRDR7" a
INNER JOIN "elements"."output"."FVZ6UBJBHJ" p ON a."ROLE_ID"     = p."ROLE_ID"
INNER JOIN "elements"."output"."tSOkE4p_UX" r ON p."RESOURCE_ID" = r."RESOURCE_ID"
LEFT  JOIN "elements"."output"."0uCOR3n-aj" s ON a."SCOPE_ID"    = s."SCOPE_ID"
INNER JOIN "elements"."output"."tNLlaCqSKf" u ON a."USER_ID"     = u."USER_ID"
```

**The hand-built element uses LEFT OUTER on all four joins.** Confirmed in the join editor, and
visible in the join graph as `Left Join → Left Join → Left Join → Left Join (Final Output)`.

So its documentation of a human-built artifact **records LEFT as INNER** — the property that
separates an element which degrades visibly from one which degrades without a signal.

### What it got right

- ✅ Correctly identified that the original was built visually, not from SQL
- ✅ Correctly flagged its answer as *conceptual*
- ✅ No `WHERE` clause — the filter really is only a sheet filter
- ✅ No window functions — the aggregations really are Sigma-native
- ✅ Grouping really is visual, not `GROUP BY`

Every statement about **mechanism** is accurate.

### It disclosed the guess — in prose

Verbatim, the Assistant said the element *"was built using Sigma's visual UI, **likely** through
drag-and-drop relationships or the join interface"*, offered the query *"**based on its structure**"*,
commented the block `-- Conceptual SQL for the original Resolution table`, and framed the goal as
output *"that **would produce the same result**"*.

All of that is accurate. It flagged that it could not observe the join configuration, that it was
inferring, and that it was matching **output** rather than **construction**. Its claim was literally
true: INNER and LEFT return identical rows on this data.

### The pattern

> **The caveat lives in the prose. The artifact doesn't carry it.**

The hedge sits in a paragraph above a code block. The code block is schema-qualified, precisely
aliased, syntactically complete — and it is the part that gets copied into a ticket, a migration, or
a review. **The disclaimer does not survive the copy-paste.** Once separated, nothing in the SQL
marks which parts were observed and which were guessed.

This is not a translation artifact either: the join editor offers **inner, left outer, right outer,
and full outer** as equal options. Both surfaces can express both choices. INNER is the reasonable
default; LEFT was a deliberate choice for diagnosability, and that intent is **not recoverable from
the output**.

> **A correctly hedged inference and a verified fact render identically. Only one is safe to build
> on.**

Anyone rebuilding from that SQL gets the less diagnosable version — not because they were misled,
but because the warning stayed behind.

**Practical rule:** when an AI describes an artifact it cannot directly observe, treat every
structural claim as a hypothesis and check it against the source. Ask it what it could and couldn't
see; it answers accurately.

> **Amended 2026-07-26.** That last sentence holds for *provenance* — what it observed versus
> inferred — and does **not** hold for *capability*. Asked whether it could read a mermaid ERD
> uploaded as a PNG, the Assistant said "I cannot read or interpret images […] I don't have vision
> or image analysis capabilities," then read the diagram correctly when it was attached anyway. See
> [the image-capability transcript](2026-07-26-assistant-image-capability.md). Treat an account of
> *what it did* as reliable and an account of *what it can do* as a hypothesis.

## The lesson

Correct output tells you nothing about construction. This query produces the right answer, with a
filter you cannot see, joins that fail differently under change, references you cannot read, and
aggregation happening in two places at once.

And a description of the correct artifact reproduced the same defect.

None of it is visible from the rows.
