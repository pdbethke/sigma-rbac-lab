export interface ParsedIndex {
  table: string;
  columns: string[];
}

const COMMENT = /--[^\n]*/g;
const CREATE_INDEX =
  /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?[\w]+["`\]]?\s+ON\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)\s*\(([^)]*)\)/gi;

/** Strip one layer of quoting, or take the first bare token, then lowercase. */
function clean(raw: string): string {
  const trimmed = raw.trim();
  const quoted = trimmed.match(/^["`[](.*?)["`\]]/);
  if (quoted) return quoted[1].toLowerCase();
  return (trimmed.split(/\s+/)[0] ?? "").toLowerCase();
}

/** Every CREATE INDEX in the DDL, in file order. */
export function parseIndexes(sql: string): ParsedIndex[] {
  const stripped = sql.replace(COMMENT, "");
  const found: ParsedIndex[] = [];
  for (const match of stripped.matchAll(CREATE_INDEX)) {
    const columns = match[2]
      .split(",")
      .map(clean)
      .filter((column) => column.length > 0);
    found.push({ table: clean(match[1]), columns });
  }
  return found;
}
