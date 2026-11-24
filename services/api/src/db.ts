import { logger } from './obs';
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: Number(process.env.DB_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Erro em conexão ociosa (ex.: reinício do PostgreSQL) não pode derrubar o processo; o pool reconecta sozinho.
pool.on('error', (e) => logger.error({ erro: e.message }, '[db] erro em conexão ociosa'));

pool.on('error', (e) => console.error('[db] erro no pool:', e.message));

export async function bancoSaudavel(): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}
