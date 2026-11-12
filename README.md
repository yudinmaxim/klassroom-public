# Wikiroom

Self-hosted платформа для дистанционных занятий (упрощённый аналог Google Classroom)
с файловым хранением данных. Стек: Nuxt 4 + Nitro, TypeScript.

Спецификации для реализации — в [`specs/`](./specs/):

| Файл | О чём |
|---|---|
| [`specs/00-overview.md`](./specs/00-overview.md) | концепция, принципы, терминология |
| [`specs/01-architecture.md`](./specs/01-architecture.md) | стек, слои, порты/адаптеры хранилища |
| [`specs/02-data-model.md`](./specs/02-data-model.md) | файловая структура, пользователи, сессии |
| [`specs/03-git-journal.md`](./specs/03-git-journal.md) | git как журнал истории и транспорт бэкапа |
| [`specs/04-plugins.md`](./specs/04-plugins.md) | плагинная система и типы материалов |
| [`specs/05-mvp-scope.md`](./specs/05-mvp-scope.md) | границы MVP и дорожная карта |
| [`specs/06-deployment.md`](./specs/06-deployment.md) | деплой, бэкапы, безопасность |
| [`specs/07-schedule.md`](./specs/07-schedule.md) | недельное расписание курса, месячный календарь |
| [`specs/08-roles-permissions.md`](./specs/08-roles-permissions.md) | роли, каталог пермишенов, механика can() |

Статус: шаг 1 MVP (каркас + аутентификация + управление аккаунтами) реализован
и протестирован смоук-тестом. Далее — шаг 2: курсы (порт ContentStore).
