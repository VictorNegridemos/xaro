import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { STATEMENT_BREAKPOINT, checkMigrationFolder, checkMigrationSql } from './migration-guard'

const FOLDER = path.join(process.cwd(), 'drizzle')
const files = readdirSync(FOLDER).filter((name) => name.endsWith('.sql')).sort()
const read = (name: string) => readFileSync(path.join(FOLDER, name), 'utf8')

test('the three real migration files pass the guard', () => {
  assert.deepEqual(files, ['0000_extensions_and_functions.sql', '0001_knowledge_base.sql', '0002_triggers.sql'])
  assert.deepEqual(checkMigrationFolder(FOLDER), [])
})

test('the real files hold the expected number of statements', () => {
  const count = (name: string) => read(name).split(STATEMENT_BREAKPOINT).length
  assert.equal(count('0000_extensions_and_functions.sql'), 4)
  assert.equal(count('0001_knowledge_base.sql'), 20)
  assert.equal(count('0002_triggers.sql'), 2)
})

const BAD_STATEMENTS: ReadonlyArray<[label: string, sql: string]> = [
  ['DROP TABLE', 'DROP TABLE "entities";'],
  ['TRUNCATE', 'TRUNCATE "entities";'],
  ['ALTER TABLE … RENAME', 'ALTER TABLE "entities" RENAME TO "things";'],
  ['ALTER TABLE … DROP COLUMN', 'ALTER TABLE "entities" DROP COLUMN "body";'],
  ['ALTER TABLE on another table', 'ALTER TABLE "users" ADD CONSTRAINT "users_fk" FOREIGN KEY ("a") REFERENCES "public"."entities"("id");'],
  ['standalone UPDATE', "UPDATE \"entities\" SET name = 'x';"],
  ['standalone DELETE FROM', 'DELETE FROM "entities";'],
  ['CREATE TABLE with another name', 'CREATE TABLE "users" ("id" integer PRIMARY KEY);'],
  ['CREATE INDEX on another table', 'CREATE INDEX "users_idx" ON "users" USING btree ("id");'],
  ['CREATE FUNCTION without the public.xaro_ prefix', 'CREATE OR REPLACE FUNCTION public.helper() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;'],
  ['CREATE TRIGGER on another table', 'CREATE TRIGGER t BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.xaro_set_updated_at();'],
  ['second statement hidden behind an allowed one', 'CREATE INDEX "entities_x_idx" ON "entities" USING btree ("name"); DROP TABLE "entities";'],
  ['forbidden keyword inside a function body', 'CREATE OR REPLACE FUNCTION public.xaro_evil() RETURNS void LANGUAGE sql AS $$ DELETE FROM public.entities $$;'],
  ['DROP EXTENSION', 'DROP EXTENSION pg_trgm;'],
  ['another extension', 'CREATE EXTENSION IF NOT EXISTS dblink;'],
]

for (const [label, sql] of BAD_STATEMENTS) {
  test(`an injected statement fails the guard: ${label}`, () => {
    for (const name of files) {
      const problems = checkMigrationSql(name, `${read(name)}\n${STATEMENT_BREAKPOINT}\n${sql}\n`)
      assert.equal(problems.length, 1, `${name}: expected exactly one problem for "${label}"`)
    }
  })
}

test('a legacy table name fails the guard, even inside a comment', () => {
  // Built from parts so that this test file itself stays free of the literal names.
  for (const legacy of [['crew', 'members'], ['ship', 'subsystems'], ['ship', 'records']].map((p) => p.join('_'))) {
    const inComment = checkMigrationSql('x.sql', `-- copied from ${legacy}\n${read('0002_triggers.sql')}`)
    assert.ok(inComment.some((p) => p.reason.includes('legacy table')))
    const inStatement = checkMigrationSql('x.sql', `CREATE INDEX "i" ON "${legacy.toUpperCase()}" USING btree ("id");`)
    assert.ok(inStatement.length >= 1)
  }
})

test('quotes and dollar bodies cannot hide a second statement', () => {
  const sneaky = "CREATE INDEX \"entities_y_idx\" ON \"entities\" USING btree ((name || ';')); TRUNCATE \"entities\";"
  assert.equal(checkMigrationSql('x.sql', sneaky).length, 1)
  const fine = "CREATE INDEX \"entities_y_idx\" ON \"entities\" USING btree ((name || '; DROP TABLE x;'));"
  assert.deepEqual(checkMigrationSql('x.sql', fine), [])
})
