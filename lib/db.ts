// The site's own database: one SQLite file on the server, opened with Node's built-in driver.
// The statement API (prepare → bind → first/all/run, batch) is the one the rest of the code
// was written against, so callers stay asynchronous and unchanged.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

type Meta = { changes: number };
export type Result<T = unknown> = { results: T[]; meta: Meta; success: true };

export class Statement {
  constructor(
    private readonly owner: SqlDatabase,
    readonly sql: string,
    readonly params: SQLInputValue[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Statement(
      this.owner,
      this.sql,
      params.map((p) =>
        p === undefined ? null : typeof p === "boolean" ? Number(p) : p,
      ) as SQLInputValue[],
    );
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.owner.raw.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }
  async all<T = Record<string, unknown>>(): Promise<Result<T>> {
    return this.execute<T>();
  }
  async run(): Promise<Result> {
    return this.execute();
  }
  /** Synchronous execution; batch() relies on it to keep a transaction on one tick. */
  execute<T = unknown>(): Result<T> {
    const prepared = this.owner.raw.prepare(this.sql);
    if (/^\s*(select|with|pragma)\b/i.test(this.sql))
      return {
        results: prepared.all(...this.params) as T[],
        meta: { changes: 0 },
        success: true,
      };
    const info = prepared.run(...this.params);
    return { results: [], meta: { changes: Number(info.changes) }, success: true };
  }
}

export class SqlDatabase {
  constructor(readonly raw: DatabaseSync) {}
  prepare(sql: string) {
    return new Statement(this, sql);
  }
  /** All statements commit together or not at all. */
  async batch(statements: Statement[]): Promise<Result[]> {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const out = statements.map((s) => s.execute());
      this.raw.exec("COMMIT");
      return out;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }
  exec(sql: string) {
    this.raw.exec(sql);
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS records (
  id text PRIMARY KEY NOT NULL,
  kind text NOT NULL,
  payload text NOT NULL,
  updated_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS records_kind_updated ON records (kind, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS crawl_one_open_source ON records (json_extract(payload, '$.sourceId'))
  WHERE kind='crawlJob' AND json_extract(payload, '$.status')!='complete';
CREATE TABLE IF NOT EXISTS personal (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  kind text NOT NULL,
  payload text NOT NULL,
  updated_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS personal_user ON personal (user_id, updated_at);
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  city text,
  created_at integer NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  expires_at integer NOT NULL,
  created_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
`;

export function openDatabase(file: string) {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;");
  raw.exec(SCHEMA);
  return new SqlDatabase(raw);
}

// One connection per process, also across dev-server module reloads.
const holder = globalThis as { __qepikDb?: SqlDatabase };
export function db() {
  holder.__qepikDb ??= openDatabase(
    process.env.DATABASE_PATH || path.join(process.cwd(), "data", "qepik.sqlite"),
  );
  return holder.__qepikDb;
}
