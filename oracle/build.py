#!/usr/bin/env python3
"""Build the RBAC oracle: data/*.csv -> oracle/rbac.db, then freeze expected outputs.

The Sigma build is diffed against these fixtures. When a Sigma element returns
N rows, this says whether N is right.

    python3 oracle/build.py
"""
import csv
import pathlib
import re
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DB = ROOT / "oracle" / "rbac.db"
EXPECTED = ROOT / "expected"

NIL = "00000000-0000-0000-0000-000000000000"

# csv file -> (table, column mapping). Order matters: parents before children.
LOAD = [
    ("departments.csv", "departments", {
        "Department Id": "department_id", "Department Key": "department_key",
        "Department Name": "department_name"}),
    ("job_titles.csv", "job_titles", {
        "Job Title Id": "job_title_id", "Job Title Key": "job_title_key",
        "Job Title Name": "job_title_name", "Department Id": "department_id"}),
    ("platform_roles.csv", "platform_roles", {
        "Platform Role Id": "platform_role_id", "Platform Role Key": "platform_role_key",
        "Platform Role Name": "platform_role_name"}),
    ("users.csv", "users", {
        "User Id": "user_id", "User Name": "user_name", "Email": "email",
        "Job Title Id": "job_title_id", "Platform Role Id": "platform_role_id"}),
    ("roles.csv", "roles", {
        "Role Id": "role_id", "Role Key": "role_key",
        "Role Name": "role_name", "Description": "description"}),
    ("resources.csv", "resources", {
        "Resource Id": "resource_id", "Resource Key": "resource_key",
        "Resource Name": "resource_name", "Resource Type": "resource_type",
        "Sort Order": "sort_order", "Universal": "universal", "Description": "description"}),
    ("scopes.csv", "scopes", {
        "Scope Id": "scope_id", "Scope Key": "scope_key",
        "Scope Name": "scope_name", "Scope Type": "scope_type"}),
    ("assignments.csv", "assignments", {
        "Assignment Id": "assignment_id", "User Id": "user_id", "Role Id": "role_id",
        "Scope Id": "scope_id", "Granted By": "granted_by",
        "Granted At": "granted_at", "Status": "status"}),
    ("permissions.csv", "permissions", {
        "Permission Id": "permission_id", "Role Id": "role_id",
        "Resource Id": "resource_id", "Can View": "can_view", "Can Edit": "can_edit"}),
    # The gated dataset. stores is the tenant boundary: scopes.scope_key = store_id.
    ("stores.csv", "stores", {
        "Store Id": "store_id", "Store Key": "store_key", "Store Name": "store_name",
        "Store Region": "store_region", "Store State": "store_state",
        "Store City": "store_city", "Store Zip Code": "store_zip_code",
        "Store Latitude": "store_latitude", "Store Longitude": "store_longitude",
        "Store Tier": "store_tier"}),
    # The product tree, parents first. These feed the cascading dropdowns.
    ("product_types.csv", "product_types", {
        "Product Type Id": "product_type_id", "Product Type Name": "product_type_name"}),
    ("product_families.csv", "product_families", {
        "Product Family Id": "product_family_id",
        "Product Family Name": "product_family_name", "Product Type Id": "product_type_id"}),
    ("product_lines.csv", "product_lines", {
        "Product Line Id": "product_line_id",
        "Product Line Name": "product_line_name", "Product Family Id": "product_family_id",
        "Serial Pattern": "serial_pattern", "Serial Hint": "serial_hint"}),
    ("brands.csv", "brands", {
        "Brand Id": "brand_id", "Brand Name": "brand_name",
        "Serial Pattern": "serial_pattern", "Serial Hint": "serial_hint"}),
    ("products.csv", "products", {
        "Product Id": "product_id", "Sku Number": "sku_number",
        "Product Name": "product_name", "Product Line Id": "product_line_id",
        "Brand Id": "brand_id"}),
    ("inventory_daily.csv", "inventory_daily", {
        "Snapshot Date": "snapshot_date", "Store Id": "store_id",
        "Product Id": "product_id", "Cost per Unit": "cost_per_unit",
        "Units on Hand": "units_on_hand", "Units on Order": "units_on_order",
        "Units in Transit": "units_in_transit", "Units Received": "units_received",
        "Units Shrunk": "units_shrunk", "Reorder Point": "reorder_point",
        "Max Stock Level": "max_stock_level", "Days of Supply": "days_of_supply",
        "Inventory Value": "inventory_value", "Is Stockout": "is_stockout",
        "Is Low Stock": "is_low_stock", "Lost Sales Units": "lost_sales_units",
        "Lost Sales Value": "lost_sales_value", "Lead Time Days": "lead_time_days",
        "Merchant Id": "merchant_id"}),
    ("inventory_adjustments.csv", "inventory_adjustments", {
        "Adjustment Id": "adjustment_id", "Store Id": "store_id",
        "Product Id": "product_id", "Adjusted By": "adjusted_by",
        "Adjusted At": "adjusted_at", "Units Delta": "units_delta",
        "Reason": "reason", "Serial Number": "serial_number"}),
]

BOOL_COLS = {"universal", "can_view", "can_edit", "is_stockout", "is_low_stock"}


def coerce(col, value):
    """CSV is all strings. Empty -> NULL (critical for the nullable scope FK)."""
    if value == "":
        return None
    if col in BOOL_COLS:
        return 1 if value.strip().upper() == "TRUE" else 0
    if col in ("sort_order", "units_delta"):
        return int(value)
    return value


def split_queries(text):
    """Parse queries.sql into {name: sql} on '-- name: <x>' markers."""
    out, name, buf = {}, None, []
    for line in text.splitlines():
        if line.startswith("-- name:"):
            if name:
                out[name] = "\n".join(buf).strip()
            name, buf = line.split(":", 1)[1].strip(), []
        elif name is not None:
            buf.append(line)
    if name:
        out[name] = "\n".join(buf).strip()
    return {k: v.rstrip().rstrip(";") for k, v in out.items()}


def build():
    DB.unlink(missing_ok=True)
    con = sqlite3.connect(DB)
    # SQLite has no REGEXP operator; serial-format rules are stored as patterns
    # in the data, so the oracle needs one to check them.
    con.create_function("regexp", 2, lambda p, v: 0 if v is None or p is None
                        else 1 if re.search(p, v) else 0)
    con.executescript((ROOT / "oracle" / "schema.sql").read_text())
    con.execute("PRAGMA foreign_keys = ON")

    for fname, table, colmap in LOAD:
        rows = list(csv.DictReader((DATA / fname).open()))
        cols = list(colmap.values())
        con.executemany(
            f"INSERT INTO {table} ({','.join(cols)}) "
            f"VALUES ({','.join('?' * len(cols))})",
            [tuple(coerce(colmap[h], r[h]) for h in colmap) for r in rows],
        )
        print(f"  {table:16} {len(rows):>4} rows")
    con.commit()

    violations = con.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        print(f"\nFK VIOLATIONS: {violations}", file=sys.stderr)
        sys.exit(1)
    print("  foreign keys     OK")
    return con


def freeze(con, queries):
    """Write expected outputs the Sigma build gets diffed against."""
    EXPECTED.mkdir(exist_ok=True)
    names = {r[0]: r[1] for r in con.execute("SELECT user_id, user_name FROM users")}

    # nav materialises universal resources for every user; the fixture only needs
    # the users who actually hold a grant, or it is 1000 rows of noise.
    granted = {r[0] for r in con.execute(
        "SELECT DISTINCT user_id FROM assignments WHERE status='active'")}

    for qname in ("resolution", "nav", "roster", "scoped_inventory", "product_cascade",
                  "write_authority", "invalid_adjustments", "store_options",
                  "invalid_serials", "serial_rules",
                  "invalid_serial_format", "verification_matrix"):
        cur = con.execute(queries[qname])
        headers = [d[0] for d in cur.description]
        rows = cur.fetchall()
        if qname == "nav":
            rows = [r for r in rows if r[0] in granted]
        path = EXPECTED / f"{qname}.csv"
        with path.open("w", newline="") as f:
            w = csv.writer(f)
            # user_name alongside user_id so the fixture is readable in review
            if headers[0] == "user_id":
                w.writerow(["user_name"] + headers)
                w.writerows([names.get(r[0], "?")] + list(r) for r in rows)
            else:
                w.writerow(headers)
                w.writerows(rows)
        print(f"  expected/{qname + '.csv':18} {len(rows):>4} rows")


def report(con, queries):
    print("\n--- effective access, per granted user ---")
    rows = con.execute(queries["nav"]).fetchall()
    names = {r[0]: r[1] for r in con.execute("SELECT user_id, user_name FROM users")}
    granted = [r[0] for r in con.execute(
        "SELECT DISTINCT user_id FROM assignments WHERE status='active'")]

    for uid in sorted(granted, key=lambda u: names[u]):
        mine = [r for r in rows if r[0] == uid]
        label = f"{names[uid]}" + ("  [anonymous principal]" if uid == NIL else "")
        print(f"\n{label}   ({len(mine)} resources)")
        for _, key, name, order, scope, cv, ce, src in mine:
            flags = ("view" if cv else "") + ("+edit" if ce else "")
            print(f"    {name:16} {scope:22} {flags:10} {src}")

    print("\n--- authority: audit-access ---")
    cur = con.execute(queries["authority"].replace(":resource_key", "'audit-access'"))
    holders = [(names[r[0]], r[1]) for r in cur.fetchall()]
    for n, holds in holders:
        print(f"    {n:20} holds_edit={bool(holds)}")
    print(f"    everyone else        holds_edit=False  (no row -> the empty room)")


if __name__ == "__main__":
    print(f"building {DB.relative_to(ROOT)}")
    queries = split_queries((ROOT / "oracle" / "queries.sql").read_text())
    con = build()
    freeze(con, queries)
    report(con, queries)
    con.close()
