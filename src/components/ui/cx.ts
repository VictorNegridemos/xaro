/** Joins class names, skipping empty ones. */
export function cx(...parts: Array<string | false | null | undefined>): string | undefined {
  const joined = parts.filter(Boolean).join(' ')
  return joined === '' ? undefined : joined
}
