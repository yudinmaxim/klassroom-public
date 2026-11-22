export interface Crumb {
  label: string
  /** Если задан — крошка является ссылкой; последняя обычно без to. */
  to?: string
}

/**
 * Хлебные крошки шапки (рендерятся в AppNav).
 * Каждая страница в setup выставляет свой путь: setBreadcrumbs([...]).
 * Состояние — useState, поэтому обновление после загрузки данных
 * (название курса и т.п.) отразится в шапке автоматически.
 */
export function useBreadcrumbs() {
  return useState<Crumb[]>('breadcrumbs', () => [])
}
