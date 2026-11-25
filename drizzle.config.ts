import { defineConfig } from 'drizzle-kit'

const ALLOWED = ['generate', 'check']
const cmd = process.argv.slice(2).find((a) => !a.startsWith('-'))
if (!cmd || !ALLOWED.includes(cmd)) {
  throw new Error(
    `drizzle-kit ${process.argv.slice(2).join(' ')} is disabled in this project. ` +
    'Only "generate" and "check" are allowed (both offline). ' +
    'Use "npm run db:generate" and "npm run db:migrate" (guarded wrapper). See CLAUDE.md.')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  // no database credentials on purpose: generate and check are offline, so this file holds no path to the database
  schemaFilter: ['public'],
  tablesFilter: ['entities', 'entity_relations', 'import_sources', 'auth_throttle'],
  strict: true,
  verbose: true,
})
