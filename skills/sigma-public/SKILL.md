---
name: sigma-public
description: "Operational mechanics for building and SHIPPING apps on the free Sigma Public tier — the two-step publish, source vs published workbook IDs, control values being snapshotted as the shipped default, tabbed containers vs workbook pages, gating data with a one-row gate and an inner join, and verifying signed out. Use whenever building, publishing, or debugging a Sigma Public workbook — and ALWAYS before clicking Publish or Make app public, or when a published app behaves differently from the editor. Trigger on: Sigma, Sigma Public, publish, make app public, edit-workbook vs view-workbook, row-level gating, 'works in the editor but not for viewers', 'my app shows the wrong user'."
---

# Shipping on Sigma Public

Derived from building an application-level RBAC model on the free Sigma Public tier and verifying every
element against a SQL oracle. Everything here was learned by reading the *published* app in a signed-out
browser — most of it is invisible in the editor.

The narrative version, with evidence, is in this repo: `docs/BUILD_LOG.md` (Step 16 in particular),
`docs/FIELD_GUIDE.md`, `docs/TRANSLATION.md`. **This file is the distilled operational form; the build
log is the source of truth.** When they disagree, the build log wins.

## The rule that governs all the others

**The editor is not evidence.** It reflects *your* session — your data, your control values, your
permissions. Sign out entirely (or use a separate browser context) and read the published URL.

Every defect below was invisible until that was done.

Corollary: anonymous viewers all share **one synthetic identity constant**, so `CurrentUserEmail()` is
useless as a row-level-security key for them — but ideal as a predicate for *"is this an anonymous
viewer"*.

## Publishing

### It's two steps, and the first alone changes nothing for visitors

| Step | Where | Effect |
|---|---|---|
| **Publish** | footer | promotes the draft to the published copy |
| **Make app public** | header | makes *that version* the one visitors get |

Between them your work is live and simultaneously invisible — the gallery still serves the previous
version. This reads exactly like a failed publish and will send you hunting a phantom bug. After the
second step the header flips to **Make app private**; that's the confirmation, not a warning.

### The editable source and the published copy are different workbook IDs

```
edit:      /edit-workbook?workbook=<sourceId>
published: /view-workbook?workbook=<publishedId>
```

Feeding a published ID to `/edit-workbook` returns **403 on `create-embed`** and renders blank editor
chrome with **no error message**. Get the real edit URL from `/user-apps` — each card carries an
"Edit app" link with the source ID; public apps additionally carry a view link.

The draft/published split isn't only a data-layer phenomenon. They are distinct objects in the URL space.

### ⭐ Publishing snapshots current control values as the shipped default

There is **no separate default-value setting** on a control. Whatever a control is set to at the moment
you publish becomes what **every viewer** gets.

This is the most dangerous behaviour on the tier. If your app switches identity, persona, region or
scenario via a control, and you publish while testing as a privileged one, **every visitor inherits that
privileged state.**

Concretely, in this lab: a page correctly gated by the acting user's authority was published while
testing as the one user who *held* that authority. Result — the gated audit trail was open to anyone
with the link. The editor showed nothing wrong; the gate opened and closed on cue and the counts matched
the oracle. Only the signed-out read exposed it.

**Reset every control to its intended default immediately before publishing. Then verify signed out.**

## Navigation: tabs, not pages

**The published viewer exposes no page tabs at all.** Workbook pages are author-side furniture. A page is
reachable by a viewer only if some element explicitly navigates there — an action button or a nav widget.

Build anything reader-facing as a **tab in a tabbed container** on the main page:
`Manage tabs → Add new tab` in the container's Properties panel.

Build it as a page instead and you get the worst failure mode available: **published, correct, and
unreachable**.

**Moving an element into a tab is two steps.** The element menu's `Move to` lists only *pages*, never
tabs. So `Move to → <the page holding the container>`, then **drag** the element into the tab panel by
its "Press and hold to drag element" handle. Joins, lineage and names all survive the move.

A nav widget is a static list of pages — it can't be bound to a query, so it will show the same entries
to everyone regardless of authority. That's not a security hole if the data behind each destination is
properly gated (the visitor just lands in an empty room), but it contradicts an authority-derived nav.
If your nav is meant to be a *rendering of resolved permissions*, build it from the data.

## Gating data by authority

**Don't hide the tab.** Hiding is cover, not control — Sigma's own documentation says if/else logic is
not a security feature. Conditional visibility that hardcodes `role = "admin"` looks locked without being
locked.

**Scope the data instead.** Reduce the caller's authority to a **one-row-or-zero gate element**, then
**INNER JOIN** the sensitive elements to it:

```
Resolution ─filter to the permission you're gating on─▶ Gate   (1 row, or 0)
SensitiveData ──INNER JOIN on 1 = 1──▶ what the viewer sees
```

No grant → no match → empty. The user walks in and finds **an empty room** — not a locked door, not an
error, just nothing, because the rows were never in their result set. Same posture as row-level security
in a database.

Two non-obvious mechanics:

- **Join on a constant, not on the user key.** A gate is an *existence* check. Joining an audit trail to
  the gate on `User Id` silently converts *"do you have audit authority"* into *"rows belonging to you"* —
  the auditor then sees only their own activity, which is the opposite of the point.
- **The join key must be a formula.** The join editor reads the **source** element's columns and never
  sees a calculated column you added to the child, so a `Gate Key = 1` column won't appear in the key
  dropdown. Use the dropdown's **Add formula** option and enter the literal `1` on *both* sides — Sigma
  reports `Type mismatch between number and text` until both are converted.

**This is the one place an inner join is right.** Elsewhere prefer LEFT: a multi-source inner join returns
`0 rows` identically no matter which source failed, which destroys your diagnosis. In a gate, `0 rows`
*is* the intended output — it's the enforcement, not a dead end. Say so in a comment, or the next person
will "fix" it.

**Corollary for anything AI-facing:** scope the model's *grounding data*; don't instruct it to behave. An
in-prompt authorization check is cover too. An agent grounded on the full model will answer questions the
user's own screen refuses to show them.

## Controls and actions

**Any action on a control makes that control sign-in-gated for anonymous viewers.** They cannot write to
input tables at any permission level, so a write-on-change fires Sigma's *"Build with Sigma Public — Sign
in to use this feature"* modal. Condition the action so it doesn't fire for them:

```
when  CurrentUserEmail() <> "<the anonymous constant>"
```

Leave the prompt on actions that genuinely change data, where someone has already watched the thing work.
Get it off navigation and identity switching, where the visitor has seen nothing yet — otherwise the
read-only experience gets walled off one control at a time and each looks like a separate bug.

Other control behaviour worth knowing: control state is **per session**; a refresh resets to the default
(for everyone); control values **cannot be set from the URL**.

## Elements

- **Deleting an element cascades silently** — it breaks children, control value sources and action
  targets with no warning. **Extend elements; don't delete and recreate.**
- **Name every element at creation.** Unnamed or misnamed elements that get wired to something are the
  usual root of a tangle.
- **Create a column with `+` before typing a formula into it.** Typing a formula onto an existing column
  severs its identity and it ends up referencing itself.
- **A value-list filter offers only values present in the current result set.** If you're filtering on a
  value the current identity can't see, the list won't contain it — switch the filter type to **Text
  match** and type the value.
- **Read the key-match panel before committing a join.** Name every unmatched key — though a bare `null`
  on the left side of a LEFT join may be structural rather than real.

## Automating verification

- Row counts come from the **accessibility tree** — one query returns every element's count as exact
  text. Match `/\d+ rows?/`; note the singular, Sigma writes "1 row".
- **Cell values do not.** The data grid exposes no per-cell nodes, so reading values needs a screenshot
  and driving the grid needs coordinate input.
- **A viewport too short to render the whole page produces the same silence as a missing element.**
  Elements below the fold sit at `No data` / `Loading row count…` indefinitely until scrolled into view.
  Make the viewport tall *before* reading counts. This mistake gets made repeatedly because the failure
  is indistinguishable from a real one.

## Build a SQL oracle

The single highest-leverage practice in this lab: keep the same tables in SQLite, compute the expected
answers there, and diff every Sigma element against them. It turns *"does this look right?"* into a
comparison, and it's what made step-by-step verification possible at all. See `oracle/` in this repo.
