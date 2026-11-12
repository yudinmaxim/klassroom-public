import { useGitJournal } from '../utils/content-store'

/**
 * При остановке процесса сводим накопленные мутации в коммит.
 * Файлы и так уже на диске (истина — файлы), журналу достаточно
 * «best effort» (specs/03-git-journal.md).
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hookOnce('close', async () => {
    await useGitJournal().flushNow()
  })
})
