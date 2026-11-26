/** Первый запуск: создание администратора, пока аккаунтов нет. */
export default defineEventHandler(async () => {
  const store = useUserStore()
  const configured = Boolean(useRuntimeConfig().setupSecret)
  const available = configured && (await store.countUsers()) === 0
  return { available, configured }
})
