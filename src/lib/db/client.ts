// Lazy database client (plan 3.8). Scripts use scripts/lib/script-db.ts instead.
// Not marked "server-only" on purpose: the tsx scripts import the same data modules.
import postgres from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

export type Db = PostgresJsDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Every data function takes this as its optional last argument. */
export type DbOrTx = Db | Tx

interface DbGlobal { xaroDb?: Db }
const globalForDb = globalThis as unknown as DbGlobal
let cached: Db | undefined

export function getDb(): Db {
  const existing = cached ?? globalForDb.xaroDb
  if (existing) return existing
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set. Add it to .env (see .env.example).')
  }
  // Prepared statements stay on (direct connection, no transaction pooler).
  const client = postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} })
  const db = drizzle(client, { schema })
  cached = db
  if (process.env.NODE_ENV !== 'production') globalForDb.xaroDb = db // survive HMR in dev
  return db
}
