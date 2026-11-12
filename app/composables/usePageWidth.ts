/**
 * Состояние «полная ширина» для страниц (.page).
 * Кнопка-переключатель будет добавлена позже; сейчас просто задел:
 * любая страница может читать/менять это состояние.
 */
export function usePageFullWidth() {
  return useState('wikiroom-page-full-width', () => false)
}

export function setPageFullWidth(value: boolean) {
  usePageFullWidth().value = value
}
