# Классная комната (klassroom)

Self-hosted площадка для проведения занятий (упрощённый аналог Google Classroom)
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
| [`specs/09-qr-login.md`](./specs/09-qr-login.md) | QR-вход: одноразовые токены, права, UI |

Статус: реализованы шаги 1–3 MVP — каркас + аутентификация, курсы с git-журналом,
роли и пермишены (спека 08), QR-вход (спека 09), материалы с плагином `doc`
(markdown-редактор, вложения, оглавление, `[[ссылки]]`).
Далее — шаг 4: домашние задания (выдача → сдача → проверка).
