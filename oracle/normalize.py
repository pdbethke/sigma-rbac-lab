#!/usr/bin/env python3
"""Normalize a flat inventory export into the UUID-keyed star in data/.

    python3 oracle/normalize.py [source.csv]

Reads the flat export (default data/inventory/big_buys_inventory.csv, gitignored
for size) and writes: product_types, product_families, product_lines, brands,
stores, products, inventory_daily.

WHY THIS IS A SCRIPT AND NOT A ONE-OFF
--------------------------------------
This system ships as a template, and the data is expected to GROW -- new stores,
new categories, new brands. That rules out hand-derived keys. Every id here is
`uuid5(NAMESPACE, natural_key)`, which buys three properties:

  deterministic  same input  -> same UUID, every run, on every machine
  additive       a new store/brand/line gets a new UUID and leaves every
                 existing UUID untouched, so re-running never orphans a fact row
                 or silently re-points a scope grant
  offline        no id server, no sequence, no coordination between environments

Re-running after appending rows to the source is therefore SAFE. `--check` proves
it: it regenerates into memory and diffs against what is on disk.

THE PRODUCT TREE
----------------
type -> family -> line, keyed on the FULL PATH rather than the label, because
labels collide: "Security Cameras" exists under both Cameras and Security, and
"Gaming Laptops" under both Laptops and PC Gaming. Keyed on the label those two
pairs merge into one row and quietly corrupt the hierarchy; keyed on the path
they are correctly four distinct lines.

Brand is deliberately NOT a level of that tree -- 63 of 178 brands span more than
one line (Apple sells phones and speakers), so it hangs off the product directly.
"""
import argparse
import csv
import pathlib
import sys
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DEFAULT_SOURCE = DATA / "inventory" / "big_buys_inventory.csv"

# Fixed namespace. Changing this re-keys the ENTIRE model and breaks every
# existing scope grant -- it is a one-way door. Do not touch it.
NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

# measures carried through to the fact table, in order
MEASURES = [
    "Cost per Unit", "Units on Hand", "Units on Order", "Units in Transit",
    "Units Received", "Units Shrunk", "Reorder Point", "Max Stock Level",
    "Days of Supply", "Inventory Value", "Is Stockout", "Is Low Stock",
    "Lost Sales Units", "Lost Sales Value", "Lead Time Days", "Merchant Id",
]

STORE_ATTRS = ["Store Name", "Store Region", "Store State", "Store City",
               "Store Zip Code", "Store Latitude", "Store Longitude", "Store Tier"]


def uid(kind, natural_key):
    """Stable id for a natural key. See the module docstring on why uuid5."""
    return str(uuid.uuid5(NAMESPACE, f"{kind}:{natural_key}"))


def build(rows):
    """Flat rows -> {filename: (header, rows)}. Pure; no I/O."""
    products = list({r["Sku Number"]: r for r in rows}.values())
    stores = list({r["Store Key"]: r for r in rows}.values())

    types, families, lines = {}, {}, {}
    for r in products:
        t, f, l = r["Product Type"], r["Product Family"], r["Product Line"]
        types.setdefault(t, uid("type", t))
        families.setdefault((t, f), uid("family", f"{t}/{f}"))
        lines.setdefault((t, f, l), uid("line", f"{t}/{f}/{l}"))
    brands = {b: uid("brand", b) for b in sorted({r["Brand"] for r in products})}

    store_id = {r["Store Key"]: uid("store", r["Store Key"]) for r in stores}
    product_id = {r["Sku Number"]: uid("product", r["Sku Number"]) for r in products}

    out = {}
    out["product_types.csv"] = (
        ["Product Type Id", "Product Type Name"],
        [{"Product Type Id": i, "Product Type Name": t}
         for t, i in sorted(types.items())])
    out["product_families.csv"] = (
        ["Product Family Id", "Product Family Name", "Product Type Id"],
        [{"Product Family Id": i, "Product Family Name": f, "Product Type Id": types[t]}
         for (t, f), i in sorted(families.items())])
    out["product_lines.csv"] = (
        ["Product Line Id", "Product Line Name", "Product Family Id"],
        [{"Product Line Id": i, "Product Line Name": l,
          "Product Family Id": families[(t, f)]}
         for (t, f, l), i in sorted(lines.items())])
    out["brands.csv"] = (
        ["Brand Id", "Brand Name"],
        [{"Brand Id": i, "Brand Name": b} for b, i in brands.items()])
    out["stores.csv"] = (
        ["Store Id", "Store Key"] + STORE_ATTRS,
        [{"Store Id": store_id[r["Store Key"]], "Store Key": r["Store Key"],
          **{a: r[a] for a in STORE_ATTRS}}
         for r in sorted(stores, key=lambda r: r["Store Key"])])
    out["products.csv"] = (
        ["Product Id", "Sku Number", "Product Name", "Product Line Id", "Brand Id"],
        [{"Product Id": product_id[r["Sku Number"]], "Sku Number": r["Sku Number"],
          "Product Name": r["Product Name"],
          "Product Line Id": lines[(r["Product Type"], r["Product Family"], r["Product Line"])],
          "Brand Id": brands[r["Brand"]]}
         for r in sorted(products, key=lambda r: r["Sku Number"])])
    out["inventory_daily.csv"] = (
        ["Snapshot Date", "Store Id", "Product Id"] + MEASURES,
        [{"Snapshot Date": r["Snapshot Date"], "Store Id": store_id[r["Store Key"]],
          "Product Id": product_id[r["Sku Number"]],
          **{m: r[m] for m in MEASURES}} for r in rows])
    return out


def verify_lossless(rows, tables):
    """Rejoining the star must reproduce every source row exactly."""
    lines = {r["Product Line Id"]: r for r in tables["product_lines.csv"][1]}
    fams = {r["Product Family Id"]: r for r in tables["product_families.csv"][1]}
    types = {r["Product Type Id"]: r for r in tables["product_types.csv"][1]}
    brands = {r["Brand Id"]: r for r in tables["brands.csv"][1]}
    prods = {r["Product Id"]: r for r in tables["products.csv"][1]}
    stores = {r["Store Id"]: r for r in tables["stores.csv"][1]}

    rebuilt = set()
    for f in tables["inventory_daily.csv"][1]:
        p = prods[f["Product Id"]]
        l = lines[p["Product Line Id"]]
        fam = fams[l["Product Family Id"]]
        rebuilt.add((
            f["Snapshot Date"], stores[f["Store Id"]]["Store Key"],
            stores[f["Store Id"]]["Store Name"], p["Sku Number"], p["Product Name"],
            types[fam["Product Type Id"]]["Product Type Name"],
            fam["Product Family Name"], l["Product Line Name"],
            brands[p["Brand Id"]]["Brand Name"]))

    cols = ["Snapshot Date", "Store Key", "Store Name", "Sku Number", "Product Name",
            "Product Type", "Product Family", "Product Line", "Brand"]
    original = {tuple(r[c] for c in cols) for r in rows}
    return original == rebuilt, len(original - rebuilt), len(rebuilt - original)


def read_existing(name):
    path = DATA / name
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("source", nargs="?", default=str(DEFAULT_SOURCE))
    ap.add_argument("--check", action="store_true",
                    help="regenerate in memory and diff against data/; write nothing")
    args = ap.parse_args()

    src = pathlib.Path(args.source)
    if not src.exists():
        sys.exit(f"source not found: {src}\n"
                 f"(the raw export is gitignored for size -- see docs/BUILD_LOG.md)")

    with src.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    print(f"read {len(rows):,} rows from {src.relative_to(ROOT) if ROOT in src.parents else src}\n")

    tables = build(rows)

    ok, missing, spurious = verify_lossless(rows, tables)
    if not ok:
        sys.exit(f"LOSSY: {missing} source rows unreachable, {spurious} spurious")

    drift = 0
    for name, (header, out_rows) in tables.items():
        if args.check:
            existing = read_existing(name)
            same = existing is not None and existing == [
                {k: str(v) for k, v in r.items()} for r in out_rows]
            print(f"  {name:<24} {len(out_rows):>6,} rows  "
                  f"{'match' if same else 'DRIFT'}")
            drift += 0 if same else 1
        else:
            with (DATA / name).open("w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, fieldnames=header, lineterminator="\r\n")
                w.writeheader()
                w.writerows(out_rows)
            print(f"  {name:<24} {len(out_rows):>6,} rows x {len(header)} cols")

    print(f"\n  rejoin is lossless: all {len(rows):,} source rows reproduced")
    if args.check and drift:
        sys.exit(f"\n{drift} table(s) differ from data/ -- re-run without --check")
    if not args.check:
        print("  NOTE: scopes.csv is hand-maintained. A new store needs a scopes row")
        print("        whose Scope Key is that store's Store Id. Then: oracle/build.py")


if __name__ == "__main__":
    main()
