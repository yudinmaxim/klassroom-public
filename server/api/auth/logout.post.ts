import { destroySession } from '../../lib/sessions'

export default defineEventHandler(async (event) => {
  await destroySession(event)
  return { ok: true }
})
