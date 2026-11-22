import type { Gradebook, GradebookCell } from '#shared/types'
import { requireUser, courseSlugSchema } from '../../lib/validation'
import { httpError } from '../../lib/errors'

type Format = 'csv' | 'md'

/** Экспорт ведомости: CSV (с BOM для Excel) или Markdown. Только для учителей. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const query = getQuery(event)
  const format = (query.format === 'md' ? 'md' : 'csv') as Format
  const course = query.course
    ? courseSlugSchema.parse(query.course)
    : undefined

  const sections = (await useContentStore().listGradebooks(actor))
    .filter(s => s.book.canSeeAll)
    .filter(s => !course || s.course.slug === course)

  if (!sections.length) {
    httpError(403, 'Экспорт ведомости доступен только учителю курса')
  }

  const text = sections.map(s => render(s.course.title, s.book, format)).join('\n\n')
  const stamp = new Date().toISOString().slice(0, 10)
  const name = course ?? 'vse-kursy'

  setHeader(event, 'Content-Type', format === 'csv'
    ? 'text/csv; charset=utf-8'
    : 'text/markdown; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="grades-${name}-${stamp}.${format}"`)
  return text
})

function cellText(cell: GradebookCell): string {
  if (cell.status === 'returned') {
    return cell.grade !== null
      ? cell.maxPoints ? `${cell.grade}/${cell.maxPoints}` : String(cell.grade)
      : 'зачтено'
  }
  return cell.status === 'submitted' ? 'сдано' : ''
}

function render(title: string, book: Gradebook, format: Format): string {
  const head = ['Ученик', ...book.assignments.map((a, i) => {
    const max = book.rows[0]?.cells[i]?.maxPoints
    return max ? `${a.title} (макс. ${max})` : a.title
  })]
  const rows = book.rows.map(row => [
    row.student,
    ...row.cells.map(cellText),
  ])

  if (format === 'md') {
    const line = (cells: string[]) => `| ${cells.join(' | ')} |`
    return [
      `## ${title}`,
      '',
      line(head),
      `| ${head.map(() => '---').join(' | ')} |`,
      ...rows.map(line),
    ].join('\n')
  }

  const esc = (v: string) => /[;"\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
  const line = (cells: string[]) => cells.map(esc).join(';')
  return [`# ${title}`, line(head), ...rows.map(line)].join('\r\n')
}
