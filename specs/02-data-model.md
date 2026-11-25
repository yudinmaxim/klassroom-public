# Модель данных (файловая)

## Общая структура

```
content/                      # git-репозиторий (отдельный; только учебный контент)
  courses/
    <id>/                     # имя директории = иммутабельный id (= URL-параметр)
      course.yml              # title, description, teacher, gradingScale, cover?, slug
      _index.yml              # производный указатель slug → id (спека 10)
      roster.yml              # список username'ов учеников курса
      groups/<gid>.yml        # группы курса: title, members[], createdAt (спека 12)
      materials/<id>/         # id = имя директории; material.yml: id, slug, type, groups?
        material.yml
        content/              # содержимое — целиком зона плагина типа
        attachments/          # вложения материала
      assignments/<id>/       # assignment.yml: id, slug, type, audience, status, due, groups?
        assignment.yml
        description.md
        submissions/
          <username>/
            submission.yml    # статус, оценка, feedback, таймстампы
            answer.md         # ответ ученика
            files/            # приложенные файлы ученика
            comments/<cid>.yml# личный тред по сдаче
        comments/<cid>.yml     # общий тред по заданию
      stream/<pid>.yml        # посты ленты курса + stream/<pid>/comments/<cid>.yml
      cover.<ext>             # обложка курса (один файл)

users/                        # ВНЕ content/, в git не попадает
  <username>.yml              # role: admin|teacher|student, pseudonym, argon2-хэш
  _index.yml                  # per-user индекс (сдачи и пр.) — specs/10

sessions/                     # файловые сессии (useStorage, file-driver)
roles/<name>.yml              # собственные роли и переопределения пермишенов
qr-tokens/<token>.yml         # одноразовые QR-токены входа (спека 09)
```

## Принципы

1. **Файлы — единственный источник правды.** Нет второй БД с «дублирующей»
   истиной; если что-то не файл, это максимум кэш.
2. **users/ и sessions/ отделены от content/**, чтобы контент можно было
   бэкапить/синхронизировать git-push'ем отдельно от секретов (хэши, сессии).
3. **Статусы сдачи ДЗ** (как в Classroom):
   `assigned → submitted → returned → resubmitted → returned → ...`
   (ученик может пересдавать после возврата).
4. **Курс = «класс + предмет» одним понятием**, разделение не делается.
   В MVP каждый курс принадлежит ровно одному учителю.
5. **Материалы** — точка расширения: содержимое каталога материала принадлежит
   плагину типа (см. `04-plugins.md`), ядро знает только `material.yml`.

## Валидация и целостность

- YAML-метаданные валидируются схемой (zod) **до** записи.
- Запись атомарная: temp-файл + rename.
- Имена slugs — нормализованные (`kebab-case`), валидируются на входе.

## Псевдонимы вместо личности

- Аккаунт = username (логин) + pseudonym (публичное имя) + пароль.
- Учитель создаёт учётки учеников вручную; пароли генерируются
  человекочитаемые (например `lisa-luna-42`) и передаются лично.
- Сервер не хранит и не запрашивает email/телефон/реальные имена.
- Отправитель git-коммитов — псевдоним (`Ёжик-7: submitted hw-3`),
  поэтому журнал безопасно пушить на сторонний remote.
