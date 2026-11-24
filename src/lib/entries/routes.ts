// The entry handlers bound to the real session check and data layer. Imported by the two route files.
import { revalidatePath } from 'next/cache'
import { requireApiAuth } from '../auth/session'
import { createEntity, deleteEntity, updateEntity } from '../data/entities'
import { createEntryHandlers } from './handlers'

export const entryHandlers = createEntryHandlers({
  requireAuth: requireApiAuth,
  create: (input) => createEntity(input),
  update: (id, input) => updateEntity(id, input),
  remove: (id) => deleteEntity(id),
  revalidate: () => revalidatePath('/', 'layout'),
  logError: (message) => console.error(message),
})
