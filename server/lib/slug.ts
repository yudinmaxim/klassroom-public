import { randomInt } from 'node:crypto'

/**
 * Slug из произвольного заголовка (в т.ч. с кириллицей): «Геометрия 9А» → `geometriya-9a`.
 * Гарантированно непустой: при пустом результате — `course-<random>`.
 */

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'e', ґ: 'g',
}

export function slugify(title: string): string {
  const translit = [...title.toLowerCase()]
    .map((ch) => CYR[ch] ?? ch)
    .join('')

  const slug = translit
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')

  return slug || `course-${randomInt(100, 1000)}`
}
