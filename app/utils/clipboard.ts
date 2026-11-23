/**
 * Копирование текста в буфер обмена.
 * navigator.clipboard доступен только в secure context (https/localhost);
 * для self-hosted по http (например, http://192.168.x.x) — fallback
 * через скрытый textarea + execCommand('copy').
 * Возвращает true, если копирование удалось.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // denied / нет secure context — пробуем fallback
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-1000px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    ta.remove()
  }
}
