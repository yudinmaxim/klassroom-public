/** Первый запуск: создание администратора, пока аккаунтов нет. */
export default defineEventHandler(async () => {
  const store = useUserStore()
  const available = (await store.countUsers()) === 0
  return { available }
})
