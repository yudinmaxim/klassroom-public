# Классная комната (klassroom) — правила проекта для агентов

Самохостная площадка для проведения занятий (Nuxt 4 + Nitro, full-stack). Контент — файлы
Markdown/YAML в `content/` (отдельный git-репозиторий), пользователи/сессии — отдельно
в `users/`, `sessions/`. Прочие runtime-каталоги: `roles/`, `qr-tokens/`.
Локальный хлам для тестов/разработки — в `.data/` (в .gitignore).

## Структура сервера

- `server/api/` — файловый роутинг Nitro; каждый эндпоинт — отдельный файл
  `<ресурс>/index.get.ts`, `[id].patch.ts` и т.п.
- `server/ports/` — интерфейсы хранилищ (ContentStore, UserStore, RoleStore…);
  `server/adapters/` — файловые реализации; `server/utils/` — DI-синглтоны
  (`useContentStore()` и т.п., автоимпорт Nitro); `server/lib/` — чистые
  примитивы (atomic, md, permissions, git-journal). Новую логику кладём в `lib`,
  новый порт — в `ports` + `adapters` + синглтон в `utils`.
- `shared/` — изоморфные типы и каталог пермишенов (`#shared/*`); НЕ путать
  с `app/utils/` (только клиентское).

## URL и идентификаторы (важно)

- В URL — только **иммутабельные id** (= имена директорий в `content/`):
  `/courses/<course-id>/topics/<id>`, `…/assignments/<id>`, `…/groups/<id>`,
  `…/stream?p=<pid>`. Никаких slug в ссылках.
- Роут-параметры: курс — `[course]`, сущность — `[id]` (имена разные, т.к.
  роутер не допускает дублирования; значения — всегда id).
- API принимает id повсеместно; `resolveEntityDir` дополнительно понимает
  legacy-slug через `_index.yml` — старые ссылки не ломаются, но новые
  ссылки и `navigateTo` строим только по `*.id`.
- Поле `slug` в сущностях — производное от названия, живёт в yml + `_index.yml`,
  в URL не используется.

## Роутинг и вкладки (важно)

- Раздел с вкладками = **вложенные роуты**: родительская страница-лейаут
  (`pages/courses/[course].vue`) рендерит заголовок раздела, панель вкладок
  (`<NuxtLink>` + `.tabs`) и `<NuxtPage/>` **один раз**.
- Дочерние страницы (`index.vue` для первой вкладки, `<раздел>/index.vue` для
  остальных, сущности — `<раздел>/<entity>.vue`) рендерят **только контент**
  в обёртке `.course-page > .course-content` (+ опциональный `.page-foot`
  соседним узлом внутри `.course-page` — так футер прижимается к низу).
- **Запрещено**: монолитные страницы, где каждая вкладка — `v-if` внутри одного
  компонента (как старый `[[tab]].vue`); дублирование панели вкладок в детях;
  передача данных между родителем и детьми через роутер/props-цепочки.
- Данные раздела грузит **только родитель** и раздаёт через `provide/inject`
  (`useCourseContext`). Дети НЕ делают `useFetch` на общий эндпоинт курса.
- Одна вкладка = один запрос только её данных. Ничего лишнего в базовых
  ответах: списки и ростер грузятся на своих страницах/модалках.
- Вкладка = часть пути (`/courses/x/assignments`), не query-параметр.
  F5 и прямая ссылка обязаны работать.

## UI-кит (обязателен к использованию)

Готовые компоненты — **единственный** способ делать типовые элементы; свои
`.modal-backdrop`/`.modal-head`/`.tip`+`.icon-btn` в новых местах не пишем:

- `BaseModal` — центрированная модалка (`title`, `width`/`height`, `#head`,
  `#foot`, `@close`).
- `SidePanel` — боковая панель справа (`title`, `label` для aria, `width`).
- `IconBtn` — иконочная кнопка с тултипом (`icon`, `label`, `danger`,
  `disabled`).
- `ConfirmModal` — подтверждение действия (обёртка над `BaseModal`).
- `SecretReveal` — блок «секрет показан один раз» с копированием.

Чат-дроверы (`StreamPostChatDrawer`, `SubmissionChatDrawer`) — fixed-панели
без backdrop, осознанно вне `SidePanel`.

- `app/components/` пока плоский (автоимпорт Nuxt). При росте до ~40 файлов
  группируем в поддиректории: `modals/`, `panels/`, `fields/`, `tables/` —
  новые компоненты сразу класть в свою группу.

## Данные и API

- Источник истины — файлы; `_index.yml` — производный указатель `slug → id`,
  пересобираемый сканом. Никогда не читать индекс без fallback на скан
  (см. `specs/10-file-indexing.md`).
- Физические ссылки — по иммутабельному `id`; slug меняется, id — нет.
- Все content-мутации сериализуются per-course write-очередью в адаптере.
- Проверки прав — только на сервере (API/адаптер); фронт не дублирует
  permission-логику, только прячет недоступные кнопки по флагам из ответа.

## Git-репозитории и релизы

- `origin` = `github.com/yudinmaxim/klassroom` — **приватный** рабочий репо.
- `public` = `github.com/yudinmaxim/klassroom-public` — **публичное зеркало**
  приватного (без «лишней истории»): `main` перезаписывается `--force`,
  это норма, а не ошибка.
- Docker-образ собирается **только в public**: workflow `.github/workflows/docker.yml`
  имеет guard `github.repository == 'yudinmaxim/klassroom-public'` — в приватном
  репо job пропускается. Образ пушится в `ghcr.io/yudinmaxim/klassroom-public`.
- Теги образа: push в main → `latest` + `<sha>`; git-тег `vX.Y.Z` →
  `X.Y.Z`, `X.Y`, `X` (semver).

### Команда релиза

Пользователь может попросить «запускай в публичку сборку X.Y.Z» — выполнить:

```bash
scripts/release-public.sh X.Y.Z
```

Скрипт сам: проверит semver, создаст тег `vX.Y.Z` на текущем HEAD (если нет),
сделает `git push public main --force` и `git push public vX.Y.Z --force`.
Перед этим вся работа должна быть закоммичена и запушена в `origin`.

Ручной эквивалент:

```bash
git push origin main              # приватный
git push public main --force      # зеркало
git tag vX.Y.Z && git push public vX.Y.Z --force
```

## Код

- Проверки перед коммитом: `npx eslint app/ shared/ server/`,
  `npx vue-tsc --noEmit`, `npm run build`.
- Коммиты на русском не обязательны, но по стилю репозитория — conventional
  commits на английском (`feat|fix|refactor(scope): …`).
