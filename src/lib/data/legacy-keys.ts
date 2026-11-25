// The ONLY file under src/ that contains the legacy table names (plan 3.8).
// They are the stored values of entities.legacy_table and are only ever bound as
// query parameters; they are never used as SQL identifiers in application code.
export const LEGACY_KEYS = { record: 'ship_records', crew: 'crew_members', subsystem: 'ship_subsystems' } as const
export type LegacyTable = (typeof LEGACY_KEYS)[keyof typeof LEGACY_KEYS]
