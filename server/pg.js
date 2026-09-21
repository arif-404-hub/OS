// PostgreSQL connection pool and initialization for EngineerOS.
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const connectionString = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || (process.env.PGHOST ? `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'engineeros'}` : null);

export let pool = null;
export let isPgAvailable = false;

if (connectionString) {
  try {
    pool = new Pool({
      connectionString,
      ssl: process.env.PGSSLMODE === 'require' || connectionString.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.warn('[PostgreSQL Pool Warning]', err.message);
    });
  } catch (err) {
    console.warn('[PostgreSQL Init Failed]', err.message);
  }
}

/** Test PostgreSQL connection and auto-run DDL schema if connected */
export async function initPostgres() {
  if (!pool) {
    console.log('[PostgreSQL] No DATABASE_URL or PGHOST provided. Operating in SQLite/Local storage mode.');
    return false;
  }
  try {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT NOW() AS now, current_database() AS db');
      console.log(`[PostgreSQL] Connected successfully to database "${res.rows[0].db}" at ${res.rows[0].now}`);
      isPgAvailable = true;

      const schemaPath = join(root, 'server', 'postgres_schema.sql');
      if (existsSync(schemaPath)) {
        const sql = readFileSync(schemaPath, 'utf8');
        await client.query(sql);
        console.log('[PostgreSQL] Database tables & JSONB schemas verified.');
      }
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn(`[PostgreSQL] Could not connect to PostgreSQL server: ${err.message}. Falling back to SQLite/Local storage.`);
    isPgAvailable = false;
    return false;
  }
}

/** Helper to run a parameterized query on PostgreSQL */
export async function pgQuery(text, params = []) {
  if (!isPgAvailable || !pool) throw new Error('PostgreSQL is not connected.');
  return pool.query(text, params);
}
