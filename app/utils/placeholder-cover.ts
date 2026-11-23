/**
 * Детерминированная заглушка-обложка курса: генерирует svg-data-uri
 * из названия — градиент по хэшу + полупрозрачные фигуры и название
 * (обрезается многоточием, если не влезает в ширину).
 * Используется на карточках курсов и на странице курса без cover.
 */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const VB_W = 400
const TEXT_MAX_W = VB_W - 12 // поля по бокам
const FONT_SIZE = 34
/** Примерная ширина символа кириллицы/латиницы в долях em. */
const CHAR_W = 0.66

function fits(text: string): boolean {
  return text.length * FONT_SIZE * CHAR_W <= TEXT_MAX_W
}

function fitTitle(title: string): string {
  const s = title.trim()
  if (fits(s)) return s
  let t = s
  while (t.length > 1 && !fits(`${t}…`)) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

export function placeholderCover(title: string): string {
  let h = 0
  for (const ch of title.trim()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  const hue = h % 360
  const hue2 = (hue + 40 + (h % 60)) % 360
  const cx1 = 60 + (h % 280)
  const cx2 = 320 - (h % 200)
  const label = fitTitle(title)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} 100" preserveAspectRatio="xMidYMid slice">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 45% 40%)"/>
    <stop offset="1" stop-color="hsl(${hue2} 50% 27%)"/>
  </linearGradient></defs>
  <rect width="${VB_W}" height="100" fill="url(#g)"/>
  <circle cx="${cx1}" cy="18" r="48" fill="hsl(${hue2} 60% 72% / .22)"/>
  <circle cx="${cx2}" cy="92" r="62" fill="hsl(${hue} 60% 75% / .18)"/>
  <rect x="176" y="-24" width="56" height="148" rx="10" fill="hsl(${hue2} 55% 82% / .16)" transform="rotate(16 204 50)"/>
  <text x="${VB_W / 2}" y="66" font-family="system-ui, sans-serif" font-size="${FONT_SIZE}" font-weight="600" fill="hsl(${hue} 35% 94% / .92)" text-anchor="middle">${escapeXml(label)}</text>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
