/**
 * Нормализация внешних ссылок: пользователь может ввести домен без схемы
 * («example.com/path») — подставляем https://.
 */
export function normalizeExternalUrl(raw: string): string {
  const url = raw.trim()
  if (!url) return url
  // схема уже есть (http://, https://, ftp://…) или протокол-относительная ссылка
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith('//')) return url
  return `https://${url}`
}

/** http(s)-URL после нормализации — для проверок перед запросом/сохранением. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** Домен для отображения/подстановки в название ('www.' срезается). */
export function urlDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
