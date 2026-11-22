# Архитектура

## Стек

- **Nuxt 4 (full-stack)**: страницы + Nitro API-роуты в одном проекте/процессе.
- **Nitro (h3)** закрывает бэкенд практически полностью:

| Потребность | Средство Nitro |
|---|---|
| REST API | файловые роуты `server/api/**` |
| Сессии | server middleware + `useStorage` (file-driver) |
| Кэш рендера md | `cachedEventHandler` / route rules |
| Фоновые задачи (флаш журнала, дедлайны) | Nitro Tasks: `defineTask` + `scheduledTasks` |
| KV-хозяйство | `useStorage` (unstorage), драйвер сменяем конфигом |
| SSE/WS (будущее) | поддержка в Nitro из коробки |
| Регистрация серверных модулей | nitro-плагины + auto-imports `server/utils` |

- **markdown**: `markdown-it` + server-side sanitization (XSS-защита).
- **пароли**: argon2.
- Отдельный HTTP-фреймворк (Express/Fastify) и отдельное бэкенд-приложение — НЕ используются.

## Слои

```
Vue-фронт ──HTTP──> Nitro-роуты ──> ContentStore (порт)
                                     ├── FilesAdapter (MVP) ──> fs ──> git-журнал
                                     └── SqliteAdapter (будущее, при необходимости)
                   + useStorage для KV (сессии, кэш, счётчики)
```

Правило целостности архитектуры: **ни один server-роут не импортирует `fs`/`yaml`/`unstorage` напрямую** — только через порты. Проверяется код-ревью (и, в перспективе, eslint-правилом).

## Порты хранилища (repository-паттерн)

Порт описывается **в терминах домена**, не в терминах хранилища:

```ts
// ✅ доменный — переживает смену хранилища
interface ContentStore {
  getCourse(slug: string): Promise<Course>
  listOpenAssignments(courseSlug: string, today: Date): Promise<Assignment[]>
  saveSubmission(courseSlug: string, assignmentId: string, user: User, data: SubmissionDraft): Promise<void>
  returnSubmission(courseSlug: string, assignmentId: string, user: User, grade: Grade, feedback: string): Promise<void>
  listMaterials(courseSlug: string, viewer: User): Promise<MaterialRef[]>
  readMaterialContent(courseSlug: string, materialId: string): Promise<Buffer>
  saveMaterialContent(courseSlug: string, materialId: string, buf: Buffer, meta: MaterialMeta): Promise<void>
  // ... финальный набор методов фиксируется при имплементации MVP
}

// ❌ анти-пример (утечка реляционной модели в порт):
// store.query('assignments', { where: { due: '<2026-12-01' } })
```

Выбор адаптера — конфигом (`KLASSROOM_STORE=files|sqlite`) через nitro-плагин `useStore()`.

### Контракт адаптеров

1. **Мутация = одна логическая сущность за один вызов.** Порт не обещает
   кросс-сущностных транзакций: адаптер сам решает, как обеспечить целостность
   (файловый — атомарная запись temp+rename + очередь записи).
2. **Мутации эмитят события.** Адаптер уведомляет подписчиков:
   `mutation(entity, path, author, ts)`. Git-журнал — подписчик файлового
   адаптера; при переезде на БД журнал заменяется audit-логом, ядро не меняется.

### KV-часть через useStorage

Сессии, кэш рендера, счётчики — `useStorage` сразу, с возможностью смены
драйвера конфигом. Структурированный контент — НЕ через unstorage: KV-модель
не выражает права доступа, вложения и атомарные каталоги.

## Конкурентность

- Записи файлов — атомарные (запись во временный файл + rename).
- Мутации сериализуются очередью записи; git-коммиты — одним воркером.
- Масштаб (2–10 учителей) не требует блокировок сложнее in-process очереди.
