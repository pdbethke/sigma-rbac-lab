# Who is who

The fixtures are the source of truth. `../../expected/write_authority.csv` and
`../../expected/store_options.csv` answer who may post and where in two lines each;
`../../expected/verification_matrix.csv` has the row counts.

    Aaliyah Kowalski   Abilene    31,500 rows   can_edit 0   posts nothing
    Kwame Bianchi      Abilene    31,500 rows   can_edit 1   Abilene only
    Mateo Boateng      Alhambra   31,500 rows   can_edit 1   Alhambra only
    Priya Cohen        global     94,500 rows   can_edit 0   three stores, no write
    Public User        none            0 rows   can_edit 0   the anonymous principal

## Which pair proves what

**Aaliyah and Kwame — read versus write.** Same store, same row count, one boolean apart. This is the
pair for any claim about authority to write.

**Kwame and Mateo — scope.** Identical counts, entirely different rows. *Count proves scoping is
happening; only the store name proves it is the right scoping.* Several bugs in this build hid behind
numbers that looked correct.

**Priya — global view is not global authority.** All three stores readable, nothing postable.

Two different arguments. Do not mix them.

## The one that shipped wrong

`02-rules-as-data.txt` originally named **Mateo** as the contrast to Aaliyah. It is **Kwame** — Mateo
is a different store, so the comparison did not hold at all.

A wrong persona in a public post is exactly the class of error this repo exists to guard against: a
plausible claim, unchecked, that renders identically to a true one. Check every name against
`expected/` before publishing, every time.
