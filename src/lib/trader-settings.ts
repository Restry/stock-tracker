import pool, { toSqlVal } from "./db";

export interface SymbolSetting {
  symbol: string;
  name: string;
  enabled: boolean;
  autoTrade: boolean;
  updatedAt: string | null;
}

interface SymbolSettingRow {
  symbol: string;
  name: string | null;
  enabled: boolean | string | number | null;
  auto_trade: boolean | string | number | null;
  updated_at: string | null;
}

interface AppSettingRow {
  value: string | null;
}

const TRUE_LIKE = new Set(["1", "true", "t", "yes", "on"]);

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return TRUE_LIKE.has(value.toLowerCase());
  return fallback;
}

export function normalizeSymbol(input: string): string {
  return input.trim().toUpperCase();
}

export async function ensureTraderSettingsTables(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS "st-symbol-settings" (
    symbol VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    auto_trade BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS "st-app-settings" (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(
    `INSERT INTO "st-app-settings" (key, value)
     VALUES ('global_auto_trade', 'true')
     ON CONFLICT (key) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO "st-symbol-settings" (symbol, name, enabled, auto_trade)
     SELECT symbol, name, TRUE, TRUE FROM "st-holdings"
     ON CONFLICT (symbol) DO NOTHING`
  );
}

export async function getSymbolSettings(enabledOnly = false): Promise<SymbolSetting[]> {
  await ensureTraderSettingsTables();
  const sql = enabledOnly
    ? `SELECT symbol, name, enabled, auto_trade, updated_at
       FROM "st-symbol-settings"
       WHERE enabled = TRUE
       ORDER BY symbol`
    : `SELECT symbol, name, enabled, auto_trade, updated_at
       FROM "st-symbol-settings"
       ORDER BY symbol`;
  const { rows } = await pool.query(sql);
  return (rows as SymbolSettingRow[]).map((row) => ({
    symbol: row.symbol,
    name: row.name || row.symbol,
    enabled: toBool(row.enabled, true),
    autoTrade: toBool(row.auto_trade, true),
    updatedAt: row.updated_at,
  }));
}

export async function getGlobalAutoTrade(): Promise<boolean> {
  await ensureTraderSettingsTables();
  const { rows } = await pool.query(
    `SELECT value FROM "st-app-settings" WHERE key = 'global_auto_trade' LIMIT 1`
  );
  const value = (rows[0] as AppSettingRow | undefined)?.value;
  return toBool(value, true);
}

export async function setGlobalAutoTrade(enabled: boolean): Promise<void> {
  await ensureTraderSettingsTables();
  await pool.query(
    `INSERT INTO "st-app-settings" (key, value, updated_at)
     VALUES ('global_auto_trade', ${toSqlVal(enabled ? "true" : "false")}, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = NOW()`
  );
}

interface UpsertSymbolInput {
  symbol: string;
  name?: string;
  enabled?: boolean;
  autoTrade?: boolean;
}

export async function upsertSymbolSetting(input: UpsertSymbolInput): Promise<void> {
  await ensureTraderSettingsTables();
  const symbol = normalizeSymbol(input.symbol);
  const name = (input.name || symbol).trim();
  const enabled = input.enabled ?? true;
  const autoTrade = input.autoTrade ?? true;

  await pool.query(
    `INSERT INTO "st-symbol-settings" (symbol, name, enabled, auto_trade, updated_at)
     VALUES (
       ${toSqlVal(symbol)},
       ${toSqlVal(name)},
       ${toSqlVal(enabled)},
       ${toSqlVal(autoTrade)},
       NOW()
     )
     ON CONFLICT (symbol) DO UPDATE
       SET name = EXCLUDED.name,
           enabled = EXCLUDED.enabled,
           auto_trade = EXCLUDED.auto_trade,
           updated_at = NOW()`
  );
}

interface UpdateSymbolInput {
  symbol: string;
  name?: string;
  enabled?: boolean;
  autoTrade?: boolean;
}

export async function updateSymbolSetting(input: UpdateSymbolInput): Promise<void> {
  await ensureTraderSettingsTables();
  const symbol = normalizeSymbol(input.symbol);
  const setParts: string[] = [];
  if (typeof input.name === "string") setParts.push(`name = ${toSqlVal(input.name.trim() || symbol)}`);
  if (typeof input.enabled === "boolean") setParts.push(`enabled = ${toSqlVal(input.enabled)}`);
  if (typeof input.autoTrade === "boolean") setParts.push(`auto_trade = ${toSqlVal(input.autoTrade)}`);
  if (setParts.length === 0) return;

  setParts.push("updated_at = NOW()");
  await pool.query(
    `UPDATE "st-symbol-settings"
     SET ${setParts.join(", ")}
     WHERE symbol = ${toSqlVal(symbol)}`
  );
}
