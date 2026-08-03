import pg from "pg";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
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
