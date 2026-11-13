/** Достать человекочитаемое сообщение из неизвестной ошибки (fetch/$fetch). */
export function errText(e: unknown, fallback: string): string {
  if (typeof e === 'object' && e !== null) {
    const data = (e as { data?: { statusMessage?: string, message?: string } }).data
    // h3 кладёт наш текст в message, а statusMessage — generic («Server Error»)
    if (typeof data?.message === 'string' && data.message) return data.message
    if (typeof data?.statusMessage === 'string' && data.statusMessage) return data.statusMessage
  }
  if (e instanceof Error && e.message) return e.message
  return fallback
}
