// seed/catalog.jsonl.gz is a snapshot of imported products, offers and price history (written by
// scripts/export-seed.mjs). A new server loads it once so the site does not start with an empty
// catalog; rows the server has already refreshed are never overwritten by older ones.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { db } from "./db";

const file = () => path.join(process.cwd(), "seed", "catalog.jsonl.gz");

export async function importSeedSnapshot() {
  if (!existsSync(file())) return 0;
  const stamp = statSync(file()).size + ":" + Math.round(statSync(file()).mtimeMs);
  const marker = await db()
    .prepare("SELECT payload FROM records WHERE id='system:seed-snapshot'")
    .first<{ payload: string }>();
  if (marker && JSON.parse(marker.payload).stamp === stamp) return 0;
  const lines = gunzipSync(readFileSync(file())).toString("utf8").split("\n").filter(Boolean);
  const insert =
    "INSERT INTO records(id,kind,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE excluded.updated_at>records.updated_at";
  for (let i = 0; i < lines.length; i += 500)
    await db().batch(
      lines.slice(i, i + 500).map((line) => {
        const row = JSON.parse(line) as { id: string; kind: string; payload: string; at: number };
        return db().prepare(insert).bind(row.id, row.kind, row.payload, row.at);
      }),
    );
  await db()
    .prepare(
      "INSERT INTO records(id,kind,payload,updated_at) VALUES('system:seed-snapshot','system',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
    )
    .bind(JSON.stringify({ id: "seed-snapshot", stamp, rows: lines.length }), Date.now())
    .run();
  return lines.length;
}
