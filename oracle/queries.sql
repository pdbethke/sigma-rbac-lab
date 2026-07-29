-- ============================================================================
-- resolution : effective role-granted permissions for one user
-- ============================================================================
-- The whole authorization engine, in one statement.
--
-- Two things carry the weight:
--   LEFT JOIN scopes  -- scope_id IS NULL means "global". An INNER JOIN here
--                        silently drops every global grant and still returns
--                        rows, so nothing looks broken.
--   MAX(can_edit)     -- logical OR across roles. Hold two roles and either one
--                        granting edit gives you edit. Union, never intersection.
-- ============================================================================

-- name: resolution
SELECT      a.user_id,
            r.resource_key,
            r.resource_name,
            r.sort_order,
            COALESCE(s.scope_name, 'ALL SCOPES (global)') AS scope,
            MAX(p.can_view) AS can_view,
            MAX(p.can_edit) AS can_edit
FROM        assignments a
JOIN        permissions p ON p.role_id     = a.role_id
JOIN        resources   r ON r.resource_id = p.resource_id
LEFT JOIN   scopes      s ON s.scope_id    = a.scope_id
WHERE       a.status = 'active'
GROUP BY    a.user_id, r.resource_key, r.resource_name, r.sort_order, scope
ORDER BY    a.user_id, r.sort_order, scope;


-- ============================================================================
-- nav : what the application actually renders
-- ============================================================================
-- Universal resources UNION role-granted resources. Universal rows belong to
-- everyone and carry no scope, so adding a new role never has to remember to
-- grant Home. Two tiers, one list.
-- ============================================================================

-- Dedup is the whole trick here, and it is the bug everyone hits. A user can
-- reach the same resource by more than one path -- two roles that both grant it,
-- or a role grant that duplicates a universal one. UNION ALL the paths, then
-- aggregate with MAX so the flags OR together and the row collapses to one.
-- Deduping on the raw union instead leaves a resource in the nav twice, because
-- the rows differ in a column the user never sees.
--
-- grant_source is derived from the resource, NOT from which branch produced the
-- row -- otherwise it varies per path and re-splits the row you just merged.

-- name: nav
WITH paths AS (
    SELECT      u.user_id,
                r.resource_id,
                -- read the label from the sentinel row, never a literal: the
                -- granted branch below gets it from `scopes`, and if the two
                -- disagree by so much as a word the UNION stops collapsing and
                -- silently duplicates every universal resource.
                (SELECT scope_name FROM scopes WHERE scope_type = 'global') AS scope,
                1 AS can_view,
                0 AS can_edit
    FROM        users u
    CROSS JOIN  resources r
    WHERE       r.universal = 1

    UNION ALL

    SELECT      a.user_id,
                p.resource_id,
                s.scope_name,
                p.can_view,
                p.can_edit
    FROM        assignments a
    JOIN        permissions p ON p.role_id  = a.role_id
    JOIN        scopes      s ON s.scope_id = a.scope_id
    WHERE       a.status = 'active'
)
SELECT      g.user_id,
            r.resource_key,
            r.resource_name,
            r.sort_order,
            g.scope,
            MAX(g.can_view) AS can_view,
            MAX(g.can_edit) AS can_edit,
            CASE WHEN r.universal = 1 THEN 'universal' ELSE 'granted' END AS grant_source
FROM        paths g
JOIN        resources r ON r.resource_id = g.resource_id
GROUP BY    g.user_id, r.resource_key, r.resource_name, r.sort_order, g.scope, grant_source
ORDER BY    1, 4, 5;


-- ============================================================================
-- roster : who you may act as
-- ============================================================================
-- Distinct users holding at least one active grant, excluding system accounts.
-- You cannot log in as the anonymous principal. No grant, no login -- the
-- roster IS the grant table, not the directory. Point this at the 500-row user
-- list instead and you get ghost users who log in to an empty application.
-- ============================================================================

-- name: roster
SELECT DISTINCT
            u.user_id,
            u.user_name,
            jt.job_title_name,
            d.department_name
FROM        assignments a
JOIN        users       u  ON u.user_id       = a.user_id
JOIN        job_titles  jt ON jt.job_title_id = u.job_title_id
JOIN        departments d  ON d.department_id = jt.department_id
WHERE       a.status = 'active'
  AND       d.department_key <> 'system'
ORDER BY    u.user_name;


-- ============================================================================
-- authority : does this user hold edit on a named resource?
-- ============================================================================
-- The gate. In Flask this is @requires_permission('audit-access'); in Sigma it
-- is a filtered element the sensitive content joins against. Note it keys on
-- resource_key, not on a GUID literal -- reviewable, and it survives a reseed.
-- ============================================================================

-- name: authority
SELECT      a.user_id,
            MAX(p.can_edit) AS holds_edit
FROM        assignments a
JOIN        permissions p ON p.role_id     = a.role_id
JOIN        resources   r ON r.resource_id = p.resource_id
WHERE       a.status = 'active'
  AND       r.resource_key = :resource_key
GROUP BY    a.user_id;


-- ============================================================================
-- scoped_inventory : the tenant boundary, measured
-- ============================================================================
-- The whole point of the model. Two users hold the SAME role -- Store Manager,
-- view+edit on inventory -- and see different rows, because their grants carry
-- different scopes.
--
-- The scope join is the boundary:
--     s.scope_key IS NULL  -> global grant, every store
--     otherwise            -> exactly that store
--
-- LEFT JOIN to scopes is required, not stylistic: a global grant has a NULL
-- scope_id, and an inner join there silently drops every regional user.
-- ============================================================================

-- name: scoped_inventory
-- The tenant boundary. A store-scoped grant reaches that store's inventory and
-- nothing else; a NULL scope_id is global. Joined on store_id, never on the text
-- store key -- renaming a store must not be able to move the boundary.
SELECT      u.user_name,
            s.scope_name AS scope,
            st.store_key,
            st.store_name,
            COUNT(*)                         AS inventory_rows,
            ROUND(SUM(i.inventory_value), 2) AS inventory_value
FROM        assignments     a
JOIN        users           u  ON u.user_id     = a.user_id
JOIN        permissions     p  ON p.role_id     = a.role_id
JOIN        resources       r  ON r.resource_id = p.resource_id
JOIN        scopes          s  ON s.scope_id    = a.scope_id
JOIN        inventory_daily i  ON (s.scope_type = 'global' OR i.store_id = s.scope_key)
JOIN        stores          st ON st.store_id   = i.store_id
WHERE       a.status = 'active'
  AND       r.resource_key = 'inventory'
  AND       p.can_view = 1
GROUP BY    u.user_name, scope, st.store_key, st.store_name
ORDER BY    u.user_name, st.store_key;

-- name: product_cascade
-- What each level of the asset-entry form offers once its parent is chosen.
-- Every child count is the number of options the NEXT dropdown shows. Two line
-- NAMES appear twice across different families -- distinct rows, distinct UUIDs,
-- which is the whole reason the tree is keyed on UUID rather than on the label.
SELECT      t.product_type_name          AS product_type,
            f.product_family_name        AS product_family,
            COUNT(DISTINCT l.product_line_id) AS lines_offered,
            COUNT(DISTINCT p.product_id)      AS products_offered,
            COUNT(DISTINCT p.brand_id)        AS brands_offered
FROM        product_types    t
JOIN        product_families f ON f.product_type_id   = t.product_type_id
JOIN        product_lines    l ON l.product_family_id = f.product_family_id
JOIN        products         p ON p.product_line_id   = l.product_line_id
GROUP BY    t.product_type_name, f.product_family_name
ORDER BY    t.product_type_name, f.product_family_name;


-- ============================================================================
-- write_authority : who may POST an adjustment, and where
-- ============================================================================
-- The read gate answers "which rows may I see". This answers "which rows may I
-- create". They are different questions and must not share a predicate --
-- can_view and can_edit are separate columns precisely so that a store
-- associate can read the shelf without being able to rewrite it.
-- ============================================================================
-- name: write_authority
SELECT      u.user_name,
            s.scope_name                     AS may_post_for,
            CASE WHEN s.scope_type = 'global' THEN 'ALL' ELSE st.store_name END AS store
FROM        assignments  a
JOIN        users        u  ON u.user_id     = a.user_id
JOIN        permissions  p  ON p.role_id     = a.role_id
JOIN        resources    r  ON r.resource_id = p.resource_id
JOIN        scopes       s  ON s.scope_id    = a.scope_id
LEFT JOIN   stores       st ON st.store_id   = s.scope_key
WHERE       a.status = 'active'
  AND       r.resource_key = 'inventory'
  AND       p.can_edit = 1
ORDER BY    u.user_name, store;


-- ============================================================================
-- invalid_adjustments : MUST return zero rows
-- ============================================================================
-- Every posted adjustment must have been written by someone who held can_edit
-- on `inventory` for THAT store at the time. This is the write-side equivalent
-- of the read gate, and it is the query that would catch a form that forgot to
-- apply the scope filter -- the failure mode where a manager can post shrink
-- against a store they do not run.
--
-- A non-empty result is a privilege-escalation bug, not a data-quality warning.
-- ============================================================================
-- name: invalid_adjustments
SELECT      adj.adjustment_id,
            u.user_name    AS posted_by,
            st.store_name  AS against_store,
            adj.units_delta,
            adj.reason
FROM        inventory_adjustments adj
JOIN        users  u  ON u.user_id  = adj.adjusted_by
JOIN        stores st ON st.store_id = adj.store_id
WHERE       NOT EXISTS (
                SELECT 1
                FROM   assignments a
                JOIN   permissions p ON p.role_id     = a.role_id
                JOIN   resources   r ON r.resource_id = p.resource_id
                JOIN   scopes      s ON s.scope_id    = a.scope_id
                WHERE  a.user_id       = adj.adjusted_by
                  AND  a.status        = 'active'
                  AND  r.resource_key  = 'inventory'
                  AND  p.can_edit      = 1
                  AND  (s.scope_type = 'global' OR s.scope_key = adj.store_id))
ORDER BY    u.user_name;


-- ============================================================================
-- store_options : what the adjustment form's store dropdown may OFFER
-- ============================================================================
-- The gate lives in the OPTIONS, not in a validation step after the fact.
-- Validating a submission means the illegal store was still offered -- the user
-- learns it exists, and any hole in the check is a write into another tenant.
-- If the option is never representable, there is nothing to validate.
--
-- So this is the dropdown's contents, per user, and it must be derived from the
-- same authority that permits the write (can_edit on `inventory`), not from
-- `stores`. A user who may not post anywhere gets an EMPTY dropdown -- and the
-- form itself is hidden by `Write Gate`, so they never reach it.
-- ============================================================================
-- name: store_options
SELECT      u.user_name,
            st.store_name  AS offered_store
FROM        assignments  a
JOIN        users        u  ON u.user_id     = a.user_id
JOIN        permissions  p  ON p.role_id     = a.role_id
JOIN        resources    r  ON r.resource_id = p.resource_id
JOIN        scopes       s  ON s.scope_id    = a.scope_id
JOIN        stores       st ON (s.scope_type = 'global' OR st.store_id = s.scope_key)
WHERE       a.status = 'active'
  AND       r.resource_key = 'inventory'
  AND       p.can_edit = 1
ORDER BY    u.user_name, st.store_name;


-- ============================================================================
-- invalid_serials : MUST return zero rows
-- ============================================================================
-- A serial number names one physical unit, so it is only coherent on a
-- single-unit movement. Three units have three serials; a serial recorded
-- against a 12-unit receipt says something false about which unit moved.
--
-- SQLite cannot express this as a constraint without a CHECK on two columns
-- that the CSV loader would bypass, so it is asserted here instead. As with
-- `invalid_adjustments`, a non-empty result is a modelling violation, not a
-- data-quality warning.
-- ============================================================================
-- name: invalid_serials
SELECT      adj.adjustment_id,
            u.user_name   AS posted_by,
            adj.units_delta,
            adj.serial_number,
            adj.reason
FROM        inventory_adjustments adj
JOIN        users u ON u.user_id = adj.adjusted_by
WHERE       adj.serial_number IS NOT NULL
  AND       ABS(adj.units_delta) <> 1
ORDER BY    adj.adjusted_at;


-- ============================================================================
-- serial_rules : which pattern applies to a given product, and from where
-- ============================================================================
-- Patterns may be declared at more than one level, and the MOST SPECIFIC wins:
--
--     product line   an internal asset-tag convention set by the operator
--     brand          the manufacturer's own serial format
--     (neither)      unconstrained
--
-- Resolution is a COALESCE down that list, so a rule can be added at whichever
-- level it actually belongs to without touching the others, and a line-level
-- override does not require editing 178 brands. This is the flexible part: the
-- rule is data, not a formula, so adding one is a row rather than a deploy.
-- ============================================================================
-- name: serial_rules
SELECT      p.sku_number,
            b.brand_name,
            l.product_line_name,
            COALESCE(l.serial_pattern, b.serial_pattern) AS pattern,
            COALESCE(l.serial_hint,    b.serial_hint)    AS hint,
            CASE WHEN l.serial_pattern IS NOT NULL THEN 'line'
                 WHEN b.serial_pattern IS NOT NULL THEN 'brand'
                 ELSE 'unconstrained' END                AS rule_source
FROM        products p
JOIN        brands        b ON b.brand_id        = p.brand_id
JOIN        product_lines l ON l.product_line_id = p.product_line_id
WHERE       COALESCE(l.serial_pattern, b.serial_pattern) IS NOT NULL
ORDER BY    rule_source, b.brand_name, p.sku_number;


-- ============================================================================
-- invalid_serial_format : MUST return zero rows
-- ============================================================================
-- A recorded serial must match the pattern that applies to its product, where
-- one applies. The pattern is resolved most-specific-first (line, then brand),
-- so this check follows the rule wherever it was declared rather than hardcoding
-- a format -- adding a rule is a row, not a change to this query.
--
-- Products with no rule at either level are unconstrained and pass. That is a
-- deliberate fail-open, and acceptable ONLY because this is a data-quality aid,
-- not an access control: a wrong serial mislabels a unit, it does not grant
-- anyone access to another tenant.
-- ============================================================================
-- name: invalid_serial_format
SELECT      adj.adjustment_id,
            u.user_name    AS posted_by,
            p.sku_number,
            adj.serial_number,
            COALESCE(l.serial_pattern, b.serial_pattern) AS expected_pattern
FROM        inventory_adjustments adj
JOIN        users         u ON u.user_id         = adj.adjusted_by
JOIN        products      p ON p.product_id      = adj.product_id
JOIN        brands        b ON b.brand_id        = p.brand_id
JOIN        product_lines l ON l.product_line_id = p.product_line_id
WHERE       adj.serial_number IS NOT NULL
  AND       COALESCE(l.serial_pattern, b.serial_pattern) IS NOT NULL
  AND       NOT regexp(COALESCE(l.serial_pattern, b.serial_pattern), adj.serial_number)
ORDER BY    adj.adjusted_at;


-- ============================================================================
-- verification_matrix : every claim the app makes, per identity, as a number
-- ============================================================================
-- The published app asserts things in prose -- "Mateo has fifteen items running
-- low, Kwame has none". This is those assertions as values, so the claim and the
-- test are the same number and neither can drift from the other.
--
-- Read each column against the corresponding element while acting as that user.
-- A mismatch is either a broken gate or a stale sentence.
-- ============================================================================
-- name: verification_matrix
WITH latest AS (SELECT MAX(snapshot_date) d FROM inventory_daily),
visible AS (
  SELECT u.user_id, i.rowid AS r, i.store_id, i.snapshot_date, i.is_low_stock
  FROM users u
  JOIN assignments a ON a.user_id = u.user_id AND a.status = 'active'
  JOIN permissions p ON p.role_id = a.role_id AND p.can_view = 1
  JOIN resources   e ON e.resource_id = p.resource_id AND e.resource_key = 'inventory'
  JOIN scopes      s ON s.scope_id = a.scope_id
  JOIN inventory_daily i ON (s.scope_type = 'global' OR s.scope_key = i.store_id))
SELECT      u.user_name,
            (SELECT COUNT(DISTINCT e.resource_key) FROM resources e
             WHERE e.universal = 1 OR e.resource_id IN (
               SELECT p.resource_id FROM assignments a JOIN permissions p ON p.role_id = a.role_id
               WHERE a.user_id = u.user_id AND a.status = 'active'))          AS nav_items,
            (SELECT COUNT(*) FROM assignments a JOIN permissions p ON p.role_id = a.role_id
             WHERE a.user_id = u.user_id AND a.status = 'active')             AS resolution_rows,
            (SELECT COUNT(DISTINCT r) FROM visible v WHERE v.user_id = u.user_id)
                                                                              AS my_inventory,
            (SELECT COUNT(DISTINCT r) FROM visible v, latest
             WHERE v.user_id = u.user_id AND v.snapshot_date = latest.d)      AS current_inventory,
            (SELECT COUNT(DISTINCT r) FROM visible v, latest
             WHERE v.user_id = u.user_id AND v.snapshot_date = latest.d
               AND v.is_low_stock = 1)                                        AS needs_attention,
            (SELECT COUNT(*) FROM assignments a JOIN permissions p ON p.role_id = a.role_id
             JOIN resources e ON e.resource_id = p.resource_id
             WHERE a.user_id = u.user_id AND a.status = 'active'
               AND e.resource_key = 'inventory' AND p.can_edit = 1)           AS write_gate,
            (SELECT COUNT(DISTINCT st.store_id) FROM assignments a
             JOIN permissions p ON p.role_id = a.role_id
             JOIN resources e ON e.resource_id = p.resource_id
             JOIN scopes    s ON s.scope_id = a.scope_id
             JOIN stores   st ON (s.scope_type = 'global' OR st.store_id = s.scope_key)
             WHERE a.user_id = u.user_id AND a.status = 'active'
               AND e.resource_key = 'inventory' AND p.can_edit = 1)           AS store_options,
            (SELECT COUNT(*) FROM assignments a JOIN permissions p ON p.role_id = a.role_id
             JOIN resources e ON e.resource_id = p.resource_id
             WHERE a.user_id = u.user_id AND a.status = 'active'
               AND e.resource_key = 'audit-access' AND p.can_view = 1)        AS audit_gate
FROM        users u
WHERE       EXISTS (SELECT 1 FROM assignments a
                    WHERE a.user_id = u.user_id AND a.status = 'active')
ORDER BY    nav_items;
