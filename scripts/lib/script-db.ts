// One connection for local scripts; always close() at the end or the process will not exit.
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../src/lib/db/schema'
import type { Db } from '../../src/lib/db/client'
import { requireDatabaseUrl } from './env'

export type Sql = postgres.Sql
export type TxSql = postgres.TransactionSql

export interface ScriptDb {
  sql: Sql
  db: Db
  close: () => Promise<void>
}

export function openScriptDb(): ScriptDb {
  const sql = postgres(requireDatabaseUrl(), { max: 1, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} })
  const db = drizzle(sql, { schema })
  return { sql, db, close: () => sql.end({ timeout: 5 }) }
}

/** Thrown inside sql.begin() to roll the transaction back on purpose. */
export class IntentionalRollback extends Error {
  constructor() {
    super('intentional rollback')
    this.name = 'IntentionalRollback'
  }
}
