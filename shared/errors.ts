/** Достать человекочитаемое сообщение из неизвестной ошибки (fetch/$fetch). */
export function errText(e: unknown, fallback: string): string {
  if (typeof e === 'object' && e !== null) {
    const data = (e as { data?: { statusMessage?: string, message?: string } }).data
    if (typeof data?.statusMessage === 'string' && data.statusMessage) return data.statusMessage
    if (typeof data?.message === 'string' && data.message) return data.message
  }
  if (e instanceof Error && e.message) return e.message
  return fallback
}
