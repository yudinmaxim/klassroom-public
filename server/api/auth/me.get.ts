import { readSessionUser } from '../../lib/sessions'

export default defineEventHandler(async (event) => {
  const user = await readSessionUser(event)
  return { user }
})
