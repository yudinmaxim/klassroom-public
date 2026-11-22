import type { NotifyPayload, UserPublic } from '#shared/types'

/**
 * Эфемерные уведомления (SSE, GET /notify): сервер принял мутацию →
 * разослал событие онлайн-участникам. Истории нет — кто офлайн,
 * тот увидит информацию в интерфейсе сам.
 */

export type SseSender = (data: string) => void

const clients = new Map<string, Set<SseSender>>()

export function addSseClient(username: string, send: SseSender): void {
  let set = clients.get(username)
  if (!set) {
    set = new Set()
    clients.set(username, set)
  }
  set.add(send)
}

export function removeSseClient(username: string, send: SseSender): void {
  const set = clients.get(username)
  if (!set) return
  set.delete(send)
  if (!set.size) clients.delete(username)
}

export function emitToUsernames(usernames: Iterable<string>, payload: NotifyPayload): void {
  const msg = `data: ${JSON.stringify(payload)}\n\n`
  for (const username of usernames) {
    const set = clients.get(username)
    if (!set) continue
    for (const send of set) send(msg)
  }
}

/**
 * Разослать событие участникам курса. audience — для частных сущностей
 * (только им + учитель курса + автор). Никогда не бросает — уведомление
 * не должно ломать уже выполненную мутацию.
 */
export async function emitToCourse(
  actor: UserPublic,
  slug: string,
  payload: NotifyPayload,
  audience?: string[],
): Promise<void> {
  try {
    const course = await useContentStore().getCourse(actor, slug)
    if (!course) return
    const targets = new Set(audience?.length ? audience : course.students)
    targets.add(course.teacher)
    targets.add(actor.username)
    emitToUsernames(targets, payload)
  } catch {
    // уведомления — best effort
  }
}
