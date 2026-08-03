import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const isSupabasePooler = connectionString?.includes("supabase.com") ?? false;
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
const poolConnectionString = isSupabasePooler
  ? connectionString.replace(/([?&])sslmode=[^&]+&?/, "$1")
  : connectionString;

export const pool = connectionString
  ? new Pool({
      connectionString: poolConnectionString,
      ...(isSupabasePooler
        ? { ssl: { rejectUnauthorized } }
        : {}),
    })
  : null;

export async function withDatabase(handler) {
  if (!pool) {
    const error = new Error("DATABASE_URL não configurada.");
    error.code = "database_not_configured";
    throw error;
  }
  return handler(pool);
}

export async function closeDatabase() {
  await pool?.end();
}
