# Развёртывание klassroom на сервере

Инструкция для администратора: поднять контейнер `ghcr.io/yudinmaxim/klassroom-public`
на своём сервере (VPS, домашний ПК, NAS). Всё состояние — в примонтированных
каталогах, контейнер stateless.

## Требования

- Docker Engine 24+ и Docker Compose v2 (`docker compose version`)
- ~512 МБ RAM, любой CPU
- Домен не обязателен, но **HTTPS обязателен** (см. ниже)

## 1. Данные

Создай каталоги и положи `docker-compose.yml` (пример ниже) в любую папку,
например `/opt/klassroom`:

```yaml
services:
  klassroom:
    image: ghcr.io/yudinmaxim/klassroom-public:latest   # или :X.Y.Z для пина
    container_name: klassroom
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"        # только localhost — снаружи ходит прокси
    environment:
      TZ: Europe/Moscow              # опционально, часовой пояс
    volumes:
      - ./content:/app/content       # wiki-контент (git-репозиторий)
      - ./users:/app/users           # аккаунты — секреты!
      - ./sessions:/app/sessions     # сессии
      - ./roles:/app/roles           # переопределения ролей
      - ./qr-tokens:/app/qr-tokens   # одноразовые QR-токены
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
```

```bash
mkdir -p /opt/klassroom && cd /opt/klassroom
# вставь yaml выше в docker-compose.yml
mkdir -p content users sessions roles qr-tokens
docker compose pull
docker compose up -d
docker compose logs -f        # Ctrl+C — логи дальше пишутся
```

Приложение поднимется за несколько секунд, healthcheck внутри образа.
Открой `http://127.0.0.1:3000/setup` **через прокси/туннель** (см. шаг 2) —
там создаётся первый администратор.

## 2. HTTPS — обязательно

Сессионная кука ставится с флагом `Secure`: по обычному `http://` логин
не будет работать. Варианты по простоте:

### Caddy (рекомендую)

```bash
apt install caddy   # или docker run caddy
```

`/etc/caddy/Caddyfile`:

```
klass.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy сам получит сертификат Let's Encrypt. Если домена нет — можно
`klass.example.com` заменить на IP или использовать Cloudflare Tunnel.

### Cloudflare Tunnel (без белого IP и домена не нужен)

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

Выдаст `https://*.trycloudflare.com` — HTTPS из коробки, порт 3000
наружу открывать не надо.

### nginx + certbot

Стандартно: `certbot --nginx -d klass.example.com`, в server-блоке
`proxy_pass http://127.0.0.1:3000;` + `proxy_set_header Host/X-Forwarded-Proto`.

## 3. Первый запуск

1. Открой `https://<твой-домен>/setup` → создай администратора.
2. Дальше — через админку: курсы, пользователи (логин/пароль или QR-вход),
   роли.
3. `content/` при первой записи сам инициализируется как git-репозиторий —
   ничего настраивать не нужно.

## 4. Обновление

```bash
cd /opt/klassroom
docker compose pull          # latest
docker compose up -d
docker compose logs -f | head
```

Для контролируемых обновлений пинь версию в compose:
`image: ghcr.io/yudinmaxim/klassroom-public:0.1.23` — тогда `pull` не
подтянет непроверенное. Доступные теги: `latest`, `X.Y.Z`, `X.Y`, `X`, `<sha>`.

## 5. Бэкап

Достаточно копии каталогов:

```bash
tar czf klassroom-backup-$(date +%F).tgz content users sessions roles qr-tokens
# раз в день по cron
```

Дополнительно `content/` — git-репозиторий: можно `git -C content remote add
origin <private-repo>` и пушить для off-site копии (журнал коммитит каждую
мутацию от лица автора).

Восстановление: распаковать архив в те же пути, `docker compose restart`.

## 6. Если что-то не так

| Симптом | Причина / действие |
|---|---|
| Логин проходит, но сразу выбрасывает | Открываешь по `http://` — нужен HTTPS (Secure-кука) |
| `docker compose pull` → 401/denied | Пакет private: сделай public в Package settings на GitHub или `docker login ghcr.io` |
| Пустой экран / 502 | `docker compose logs klassroom`; прокси не видит `127.0.0.1:3000` |
| Нет места | `docker system df`; образы slim, данные — только bind-каталоги |

Проверка живости: `docker inspect --format '{{.State.Health.Status}}' klassroom`
или `curl http://127.0.0.1:3000/`.
