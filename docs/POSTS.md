# Public writing

What was published alongside the demo, and the reasoning behind the choices. Kept in the repo so the
claims made in public and the claims made in `VERIFY.md` can be checked against each other.

Every persona detail below is checkable against `expected/` — see the note at the bottom, which is
there because one of these posts shipped a wrong one in draft.

---

## The tile

**Title:** `RBAC Lab: application-level access control in Sigma`

**Description:**

    A working demonstration of application-level role-based access control, built entirely in Sigma.
    Use the identity switcher to act as any of five users and watch the app change around you: the
    navigation, the inventory rows, the store options in the entry form, and what the AI assistant is
    able to answer. Nothing is hidden from anyone. Each identity's data is scoped, so what you cannot
    see was never in the result set. Every count is verified against an independent SQL model.

Short form, where the tile truncates:

    Application-level role-based access control, built in Sigma. Switch identities and watch the
    navigation, the data, the form options and the AI assistant all change. Nothing is hidden, it is
    scoped.

`Nothing is hidden, it is scoped` is the line doing the work. It tells a visitor what to look for,
and it is the distinction most people arrive without.

---

## Post 1 — the RBAC post

Opens on the question rather than the artifact, because *can it build an RBAC* is the line a reader
remembers. The Priya/Kwame contrast is concrete and clickable before any abstraction arrives. The
gated-dropdown lesson sits in the middle as the takeaway that travels beyond Sigma — it is true of
nearly every app the audience has shipped.

The assessment of Sigma is one plain sentence, deliberately. Longer praise reads as sponsored; having
published a working thing on the platform carries more weight than adjectives would.

    Thirty years of building multi-user systems has left me with one question I ask
    of every new platform: can it build an RBAC?

    It's a good test, because role-based access control exercises everything at once.
    A data model that expresses many-to-many honestly. Joins that behave predictably
    when a foreign key is null. Somewhere to hold identity, and a way to resolve it
    into effective permissions. Writes, and a story about who may make them. And a UI
    that reflects authority without being the authority.

    So I built one on Sigma, and published it.

    Open it and act as Priya. She sees three stores. Switch to Kwame and the same
    page, running the same formula, shows one. There is no filter on screen to
    explain the difference. Nothing was hidden from him. The rows were never in his
    result set.

    The part I'd point out to anyone building this kind of thing is smaller than
    that, and easier to get wrong. The store dropdown on the entry form offers only
    the stores you are allowed to write to. Not validated on submit, gated at the
    point of offer, so an illegal choice is never representable.

    That distinction matters more than it looks. A dropdown that lists three stores
    to someone who may only touch one has already disclosed the other two. Most
    authorization work I've reviewed guards the result set and leaves the option
    lists wide open.

    What makes this an application-level model rather than a platform feature: Sigma
    knows nothing about it. My roles, my scopes, my grant semantics. The same tables
    run unchanged in SQLite, and that SQL model computes the expected answer for
    every count in the app, independently.

    Sigma passed, and the exercise left me confident in the platform.

    It's a demo, not a product. The build log, the SQL oracle and a Flask-to-Sigma
    translation guide are all in the repo.

    Workbook: <public URL>
    Code: github.com/pdbethke/sigma-rbac-lab

    #RBAC #DataGovernance #AnalyticsEngineering #SigmaComputing

---

## Post 2 — rules as data

Stands alone for readers who missed the first, so no Priya/Kwame framing in the opening. The
load-bearing paragraph is the one about the hint: anyone can move a regex into a table, but the thing
worth stealing is that the human-readable format description and the machine-enforced rule are one
row, so they cannot disagree.

    Every validation you hardcode is a deploy waiting to happen.

    The last post was about who may write. This one is about what they may write.

    The entry form in my Sigma RBAC demo takes a serial number. Serial formats vary
    by brand, and some product lines override their brand's format. That is the kind
    of requirement that usually ends up as a regex in application code, which means
    every new brand is a pull request, a review and a release.

    So I put the patterns in the data instead. Brands carry a serial pattern. Product
    lines carry one too, and when both exist the more specific wins. Resolution is a
    single COALESCE: line first, then brand. Adding a rule for a new brand is
    inserting a row.

    Two details turned out to matter more than the pattern matching.

    The first is that an empty pattern is not a missing rule. It is the absence of a
    constraint, and I had to decide that deliberately rather than let a null decide
    it for me. Products exist that no one has written a format for yet, and the right
    behaviour is to accept anything, not to block the user out of a rule that was
    never authored.

    The second is the one I'd keep. The hint shown under the field lives in the same
    row as the pattern that enforces it. Change the rule and the help text changes
    with it, because they are the same fact. Documentation cannot drift from
    enforcement when there is only one of them.

    Worth naming what stacks up by the time someone hits submit. Whether you may post
    at all is one question, answered by your grant. Aaliyah reads every row of her
    store and can post nothing. Which store you may post to is a second, answered by
    a dropdown that offers only your own, so an illegal choice is never
    representable. Kwame stands in the same store as Aaliyah, reads the same 31,500
    rows, and differs from her in one boolean, and even he can only choose Abilene.
    Whether the serial is well formed is the third. Three independent questions, none
    of them answered by hiding a button.

    A SQL model checks every stored serial against its resolved pattern
    independently. That check has been made to fail on purpose, so an empty result
    means it works rather than that it was never exercised.

    Code: github.com/pdbethke/sigma-rbac-lab

    #DataModeling #DataQuality #AnalyticsEngineering #SigmaComputing

---

## Check the personas before publishing

The stacked-gates paragraph above originally named **Mateo** as the contrast to Aaliyah. It is
**Kwame**. Mateo is a different store entirely, so the comparison did not hold:

    Aaliyah Kowalski   Abilene    31,500 rows   can_edit 0   posts nothing
    Kwame Bianchi      Abilene    31,500 rows   can_edit 1   Abilene only
    Mateo Boateng      Alhambra   31,500 rows   can_edit 1   Alhambra only

Aaliyah and Kwame are the pair for demonstrating **read versus write**: same store, same row count,
one boolean apart. Mateo is the pair for demonstrating **scope**: identical counts to Kwame,
entirely different rows — *count proves scoping is happening; only the store name proves it is the
right scoping*. Two different arguments; do not mix them.

The fixtures are the source of truth. `expected/write_authority.csv` and
`expected/store_options.csv` answer who may post and where in two lines, and
`expected/verification_matrix.csv` has the row counts. A wrong persona in a public post is the same
class of error the whole repo exists to guard against — a plausible claim, unchecked, that renders
identically to a true one.

---

## Held back

One good post a week beats a thesis nobody finishes. Still unspent:

- **The agent scoped by absence** — it never declined anything; the rows were not there. The ❌ cover
  / ✅ control framing in `FIELD_GUIDE.md` is the whole argument in two lines.
- **Sentinels over nulls** — `ALL SCOPES` and `NO SCOPES` as real rows, because intent should be
  stated rather than inferred from an absence.
- **Global has to mean all** — why enumerating a global grant as three store grants breaks the
  moment a fourth store arrives. Step 23.
