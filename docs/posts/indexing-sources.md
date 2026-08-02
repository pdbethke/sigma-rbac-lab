# Sources — storage-engine claims (article section 3 and 4)

One line per claim. Demonstrated claims cite the committed repo output; everything
else cites the vendor's own documentation with the exact wording and the date it
was checked. Any claim not listed here does not appear in the article.

## Demonstrated from this repository

- **SQLite names its index for a store+date-range scan on `inventory_daily`
  (94,500 rows).** `EXPLAIN QUERY PLAN` on
  `SELECT * FROM inventory_daily WHERE store_id = (SELECT store_id FROM stores LIMIT 1)
  AND snapshot_date > '2026-01-01'` returns:
  `SEARCH inventory_daily USING INDEX idx_inventory_store (store_id=? AND snapshot_date>?)`.
  Run via Python's stdlib `sqlite3` module (no `sqlite3` CLI on this machine) against
  `oracle/rbac.db`. Output recorded in this task's report; the plan and row count are
  reproducible with the command in `.superpowers/sdd/2026-08-02-indexing-article/task-9-brief.md`
  Step 3.

- **DuckDB's plan for the equivalent scan on the same 94,500 rows is unchanged
  before and after creating the matching index.** Loaded `data/inventory_daily.csv`
  into `experiments/indexing/engines.duckdb` and ran `EXPLAIN` on the equivalent
  store+date-range query, first with no index, then again after
  `CREATE INDEX idx_inventory_store ON inventory_daily (store_id, snapshot_date)`.
  The `physical_plan` output is byte-identical in both runs — same `SEQ_SCAN` with a
  `Filters: snapshot_date>'2026-01-01'...` pushdown, same `HASH_JOIN`/`HASH_GROUP_BY`
  shape, same `~94,500 rows` estimate on the scan node. See
  `experiments/indexing/duckdb-explain-before.txt` and
  `experiments/indexing/duckdb-explain-after.txt` (the only diff between the two
  files is the echoed SQL text at the top; the plan itself does not change). This
  does not mean DuckDB lacks indexes — `CREATE INDEX` succeeded and DuckDB documents
  ART indexes for point lookups and constraint enforcement — it means DuckDB's
  optimizer did not choose to use the new index for this analytical
  filter+aggregate query, consistent with DuckDB leaning on its automatic
  min/max zone maps over row groups for this kind of scan.

## Snowflake — storage (article section 3)

- **Micro-partitions, immutability.** "All data in Snowflake tables is
  automatically divided into micro-partitions, which are contiguous units of
  storage. Each micro-partition contains between 50 MB and 500 MB of uncompressed
  data." — https://docs.snowflake.com/en/user-guide/tables-clustering-micropartitions
  (checked 2026-08-02).

- **Per-column metadata within each micro-partition.** "Snowflake stores metadata
  about all rows stored in a micro-partition, including: The range of values for
  each of the columns in the micro-partition. The number of distinct values.
  Additional properties used for both optimization and efficient query
  processing." — https://docs.snowflake.com/en/user-guide/tables-clustering-micropartitions
  (checked 2026-08-02).

- **Clustering keys are the closest analog to an index, and they are not a
  B-tree secondary index.** "You can enable clustering on specific tables by
  specifying a clustering key for each of those tables." —
  https://docs.snowflake.com/en/user-guide/tables-clustering-micropartitions
  (checked 2026-08-02). A clustering key co-locates rows across micro-partitions;
  it is not a lookup structure like a B-tree index.

- **`CREATE INDEX` in Snowflake is scoped to hybrid tables, not standard
  (columnar) tables.** "Creates a new secondary index in an existing hybrid
  table." The entire `CREATE INDEX` reference page is scoped to hybrid tables;
  it makes no mention of standard tables. —
  https://docs.snowflake.com/en/sql-reference/sql/create-index (checked
  2026-08-02). Conclusion for the article: Snowflake's standard, columnar table
  type — the one the micro-partition/clustering description above applies to —
  does not offer a B-tree-style secondary index; that capability exists only on
  the separate hybrid table type described below.

## Snowflake — write side (article section 4)

- **Hybrid tables (Unistore) are a separate, row-oriented table type built
  specifically to serve the workload standard tables are weak at.** "A hybrid
  table is a Snowflake table type that is optimized for low latency and high
  throughput using index-based random reads and writes." Hybrid tables provide
  "a row-based storage engine" with "secondary columnar storage," "row-level"
  locking for "high concurrency," and "enforce unique and referential integrity
  constraints, which are critical for transactional workloads," and support
  "indexes for performance; updated synchronously on writes" — unlike standard
  tables' asynchronous search optimization service. They exist to "power
  Unistore workloads that bring transactional and analytical data together in
  a single platform." — https://docs.snowflake.com/en/user-guide/tables-hybrid
  (checked 2026-08-02). Framing for the article: the existence of hybrid tables
  as a distinct, purpose-built row store is itself evidence that Snowflake's
  standard columnar/micro-partition architecture is not the right fit for
  high-concurrency single-row point writes — this is an architectural
  trade-off, not a claim that "Snowflake is bad at writes" in general.

- **Snowpipe Streaming exists specifically because file-batched loading is
  the wrong shape for row-at-a-time arrival.** "Snowpipe Streaming is
  Snowflake's real-time ingestion service built on the high-performance
  architecture." It "enables applications to load streaming data directly
  into Snowflake tables as rows arrive, without staging files or managing
  intermediate storage." "Snowpipe Streaming is intended to complement
  Snowpipe, not replace it. Use Snowpipe Streaming in scenarios where data
  arrives as rows (for example, from Apache Kafka topics, IoT devices, or
  application events) instead of files." —
  https://docs.snowflake.com/en/user-guide/snowpipe-streaming/data-load-snowpipe-streaming-overview
  (checked 2026-08-02). This is further evidence that standard ingestion paths
  (bulk/file-based COPY INTO, batched DML against micro-partitions) are built
  around batch, not single-row, write patterns — Snowflake built a distinct
  streaming path rather than making the batch path fast for one row at a time.

- **What was NOT found and is therefore not claimed:** no Snowflake
  documentation page fetched during this check states a per-row or per-DML-
  statement cost figure for updates against standard tables, and no page
  frames single-row DML as something Snowflake is "bad" at. The article's
  write-side paragraph must stay at the architectural level supported above
  (immutable micro-partitions rewritten wholesale on update; a separate
  row-oriented table type and a separate streaming ingestion path exist to
  serve workloads standard tables don't fit) and must not assert a specific
  cost multiplier or a verdict on Snowflake's write performance in general.

## Sigma — execution model (article section, Sigma comparison)

- **Warehouse-native, no extract layer.** "Sigma provides the only
  warehouse-native, paginated reporting capability built for the cloud—running
  directly on the CDW with no stale data or duplicated governance." Also:
  "Run reports directly on your cloud data warehouse." —
  https://www.sigmacomputing.com/blog/pixel-perfect-reporting-live-warehouse-data
  (checked 2026-08-02).
