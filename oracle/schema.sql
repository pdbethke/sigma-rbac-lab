-- RBAC oracle schema.
-- Mirrors data/*.csv exactly. This is the reference implementation the Sigma
-- build is diffed against: if Sigma and this disagree, one of them is wrong,
-- and this one is running on an engine nobody is questioning.

PRAGMA foreign_keys = ON;

CREATE TABLE departments (
    department_id    TEXT PRIMARY KEY,
    department_key   TEXT UNIQUE NOT NULL,
    department_name  TEXT NOT NULL
);

CREATE TABLE job_titles (
    job_title_id     TEXT PRIMARY KEY,
    job_title_key    TEXT UNIQUE NOT NULL,
    job_title_name   TEXT NOT NULL,
    department_id    TEXT NOT NULL REFERENCES departments
);

CREATE TABLE platform_roles (
    platform_role_id   TEXT PRIMARY KEY,
    platform_role_key  TEXT UNIQUE NOT NULL,
    platform_role_name TEXT NOT NULL
);

CREATE TABLE users (
    user_id          TEXT PRIMARY KEY,
    user_name        TEXT NOT NULL,
    email            TEXT,
    job_title_id     TEXT NOT NULL REFERENCES job_titles,
    platform_role_id TEXT NOT NULL REFERENCES platform_roles
);

CREATE TABLE roles (
    role_id          TEXT PRIMARY KEY,
    role_key         TEXT UNIQUE NOT NULL,
    role_name        TEXT NOT NULL,
    description      TEXT
);

CREATE TABLE resources (
    resource_id      TEXT PRIMARY KEY,
    resource_key     TEXT UNIQUE NOT NULL,
    resource_name    TEXT NOT NULL,
    resource_type    TEXT NOT NULL,
    sort_order       INTEGER,
    universal        INTEGER NOT NULL DEFAULT 0,
    description      TEXT
);

-- The tenant boundary. A scope is a retail store, and scope_key is the Store Key
-- in the inventory data -- which is what lets a grant gate 87M rows down to one
-- store's stock. scope_id NULL on an assignment means global.
CREATE TABLE scopes (
    scope_id         TEXT PRIMARY KEY,
    scope_key        TEXT     NULL,   -- the scoped entity's UUID; NULL for sentinels
    scope_name       TEXT NOT NULL,
    scope_type       TEXT NOT NULL
);

-- The M2M junction. A grant is an ENTITY: it is issued, it can be revoked, and
-- the audit log must be able to name it.
--
-- scope_id is NOT NULL, deliberately. Inferring "global" from a NULL scope reads
-- absence-of-a-restriction as permission-to-see-everything, so a missing or
-- mistyped scope_id would FAIL OPEN -- granting more access, silently. It also
-- cannot express a third real state: a user who holds the resource but should
-- see no rows (IT, a new hire, someone whose scope was withdrawn), because NULL
-- is already spoken for.
--
-- So intent is stated, never inferred. Every grant names a scope, and the two
-- non-store cases are sentinel rows in `scopes`:
--     scope_type = 'global'  -> ALL SCOPES, sees everything
--     scope_type = 'none'    -> NO SCOPES, holds the resource, sees nothing
-- A bad scope_id is now a foreign-key violation the oracle catches, not a
-- silent privilege escalation.
CREATE TABLE assignments (
    assignment_id    TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users,
    role_id          TEXT NOT NULL REFERENCES roles,
    scope_id         TEXT NOT NULL REFERENCES scopes,
    granted_by       TEXT NOT NULL REFERENCES users,
    granted_at       TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE permissions (
    permission_id    TEXT PRIMARY KEY,
    role_id          TEXT NOT NULL REFERENCES roles,
    resource_id      TEXT NOT NULL REFERENCES resources,
    can_view         INTEGER NOT NULL DEFAULT 0,
    can_edit         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_assignments_user ON assignments (user_id, status);
CREATE INDEX idx_permissions_role ON permissions (role_id);

-- --- the gated dataset -------------------------------------------------------
-- Normalised out of Sigma's BIG_BUYS_INVENTORY sample: store attributes were
-- repeated on all 94,500 rows, product attributes likewise. Split is lossless --
-- rejoining stores + products + inventory_daily reproduces all 32 original
-- columns exactly.
--
-- stores IS the tenant boundary. scopes.scope_key = stores.store_id, so a grant
-- scoped to a store resolves to that store's inventory and nothing else.
--
-- Every key here is a UUID. The business keys (store_key, sku_number) survive as
-- UNIQUE attributes -- they are what a human reads, never what a join matches on.

CREATE TABLE stores (
    store_id         TEXT PRIMARY KEY,
    store_key        TEXT UNIQUE NOT NULL,
    store_name       TEXT NOT NULL,
    store_region     TEXT,
    store_state      TEXT,
    store_city       TEXT,
    store_zip_code   TEXT,
    store_latitude   REAL,
    store_longitude  REAL,
    store_tier       TEXT
);

-- The product tree: type -> family -> line. Keyed on UUID rather than on the
-- level name, which is why 'Security Cameras' and 'Gaming Laptops' can each exist
-- as two distinct lines under two different families. On text keys they collided.
CREATE TABLE product_types (
    product_type_id    TEXT PRIMARY KEY,
    product_type_name  TEXT NOT NULL
);

CREATE TABLE product_families (
    product_family_id   TEXT PRIMARY KEY,
    product_family_name TEXT NOT NULL,
    product_type_id     TEXT NOT NULL REFERENCES product_types
);

CREATE TABLE product_lines (
    product_line_id   TEXT PRIMARY KEY,
    product_line_name TEXT NOT NULL,
    product_family_id TEXT NOT NULL REFERENCES product_families,
    -- An INTERNAL asset-tag convention, set by the operator. More specific than
    -- the brand's, so it wins. NULL means "no line rule, fall back to brand".
    serial_pattern    TEXT     NULL,
    -- What the operator reads. The pattern is machine-facing; a store manager
    -- cannot act on '^LAP-\d{5}$'. Authored beside the rule, resolved the same way.
    serial_hint       TEXT     NULL
);

-- Brand is NOT a level of that tree. 63 of 178 brands span more than one line
-- (Apple sells phones and speakers), so it hangs off the product independently.
CREATE TABLE brands (
    brand_id   TEXT PRIMARY KEY,
    brand_name TEXT NOT NULL,
    -- The MANUFACTURER's serial convention. Serial formats are a property of who
    -- made the thing, not of what category it sits in -- a Dell laptop and a Dell
    -- monitor share a format. NULL means unconstrained.
    serial_pattern TEXT NULL,
    serial_hint    TEXT NULL   -- human-readable form of the pattern above
);

CREATE TABLE products (
    product_id       TEXT PRIMARY KEY,
    sku_number       TEXT UNIQUE NOT NULL,
    product_name     TEXT NOT NULL,
    product_line_id  TEXT NOT NULL REFERENCES product_lines,
    brand_id         TEXT NOT NULL REFERENCES brands
);

CREATE TABLE inventory_daily (
    snapshot_date    TEXT NOT NULL,
    store_id         TEXT NOT NULL REFERENCES stores,
    product_id       TEXT NOT NULL REFERENCES products,
    cost_per_unit    REAL,
    units_on_hand    INTEGER,
    units_on_order   INTEGER,
    units_in_transit INTEGER,
    units_received   INTEGER,
    units_shrunk     INTEGER,
    reorder_point    INTEGER,
    max_stock_level  INTEGER,
    days_of_supply   REAL,
    inventory_value  REAL,
    is_stockout      INTEGER,
    is_low_stock     INTEGER,
    lost_sales_units INTEGER,
    lost_sales_value REAL,
    lead_time_days   INTEGER,
    merchant_id      TEXT,
    PRIMARY KEY (snapshot_date, store_id, product_id)
);

CREATE INDEX idx_inventory_store ON inventory_daily (store_id, snapshot_date);

-- ============================================================================
-- inventory_adjustments : the WRITE side of the gate
-- ============================================================================
-- inventory_daily is immutable. It is a dated snapshot produced by a system of
-- record, and editing a historical snapshot is not data entry, it is falsifying
-- an audit record. Corrections are therefore new facts, never mutations:
--
--     on hand today = snapshot + SUM(adjustments)
--
-- This table also exists because the permission model distinguishes can_view
-- from can_edit, and until something was writable, can_edit was decorative on
-- the one resource that grants it. A store manager posting a cycle-count
-- variance is what turns the model from described into demonstrated.
--
-- Append-only by intent. There is no UPDATE path: a wrong adjustment is
-- corrected by posting its inverse, so the trail stays complete.
CREATE TABLE inventory_adjustments (
    adjustment_id  TEXT PRIMARY KEY,
    store_id       TEXT NOT NULL REFERENCES stores,
    product_id     TEXT NOT NULL REFERENCES products,
    adjusted_by    TEXT NOT NULL REFERENCES users,
    adjusted_at    TEXT NOT NULL,
    units_delta    INTEGER NOT NULL,
    reason         TEXT NOT NULL,
    -- Identifies ONE physical unit, so it is only meaningful on a single-unit
    -- movement: damage, theft, a warranty return. Three units have three
    -- serials, so a serial against a 12-unit receipt is nonsense the schema
    -- cannot express in SQLite -- `invalid_serials` catches it instead.
    serial_number  TEXT     NULL
);

CREATE INDEX idx_adj_store ON inventory_adjustments (store_id, product_id);
