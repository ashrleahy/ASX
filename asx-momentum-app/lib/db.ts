import { neon, NeonQueryFunction } from "@neondatabase/serverless";

// Lazily constructed so a missing DATABASE_URL surfaces as a normal
// thrown error at query time (catchable by callers) rather than crashing
// the whole module - and therefore every route that imports it - at load.
let _sql: NeonQueryFunction<false, false> | null = null;

function getClient() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// Proxy so existing call sites can keep using `sql\`...\`` directly.
export const sql: NeonQueryFunction<false, false> = ((...args: Parameters<NeonQueryFunction<false, false>>) =>
  getClient()(...args)) as NeonQueryFunction<false, false>;

export type PriceRow = {
  ticker: string;
  date: string; // YYYY-MM-DD
  close: number;
};
