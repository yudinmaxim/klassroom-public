/**
 * Детерминированная заглушка-обложка курса: генерирует svg-data-uri
 * из названия — градиент по хэшу + полупрозрачные фигуры и буква.
 * Используется на карточках курсов, когда cover не загружена.
 */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function placeholderCover(title: string): string {
  let h = 0
  for (const ch of title.trim()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  const hue = h % 360
  const hue2 = (hue + 40 + (h % 60)) % 360
  const cx1 = 60 + (h % 280)
  const cx2 = 320 - (h % 200)
  const letter = (title.trim()[0] ?? 'К').toUpperCase()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" preserveAspectRatio="xMidYMid slice">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 45% 40%)"/>
    <stop offset="1" stop-color="hsl(${hue2} 50% 27%)"/>
  </linearGradient></defs>
  <rect width="400" height="100" fill="url(#g)"/>
  <circle cx="${cx1}" cy="18" r="48" fill="hsl(${hue2} 60% 72% / .22)"/>
  <circle cx="${cx2}" cy="92" r="62" fill="hsl(${hue} 60% 75% / .18)"/>
  <rect x="176" y="-24" width="56" height="148" rx="10" fill="hsl(${hue2} 55% 82% / .16)" transform="rotate(16 204 50)"/>
  <text x="200" y="70" font-family="system-ui, sans-serif" font-size="54" font-weight="700" fill="hsl(${hue} 35% 93% / .85)" text-anchor="middle">${escapeXml(letter)}</text>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
