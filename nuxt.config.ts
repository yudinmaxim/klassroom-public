export default defineNuxtConfig({
  compatibilityDate: '2026-11-11',

  modules: ['@nuxt/icon', '@nuxt/eslint'],

  icon: {
    // иконки как CSS-классы; внешние запросы к Iconify API исключены:
    // наборы бандлятся локально (доступность из РФ, приватность, specs/06)
    mode: 'css',
    serverBundle: { collections: ['lucide'] },
    clientBundle: {
      icons: [
        'lucide:user',
        'lucide:user-plus',
        'lucide:plus',
        'lucide:x',
        'lucide:key-round',
        'lucide:log-out',
        'lucide:eye',
        'lucide:eye-off',
        'lucide:pencil',
        'lucide:trash-2',
        'lucide:qr-code',
        'lucide:send',
        'lucide:list',
        'lucide:arrow-right',
        'lucide:chevron-down',
        'lucide:chevron-up',
        'lucide:paperclip',
        'lucide:download',
        'lucide:chevron-left',
        'lucide:chevron-right',
      ],
    },
  },

  css: ['~/assets/css/main.css', 'highlight.js/styles/github.css'],

  app: {
    head: {
      link: [{ rel: 'icon', type: 'image/png', href: '/icon.png' }],
    },
  },

  nitro: {
    storage: {
      // файловые сессии (см. specs/02-data-model.md); переживают рестарт
      sessions: { driver: 'fs', base: './sessions' },
    },
  },

  runtimeConfig: {
    // каталог аккаунтов users/ — вне content/, в git не попадает (specs/02-data-model.md)
    usersDir: './users',
    // роли (переопределения и собственные) — specs/08-roles-permissions.md
    rolesDir: './roles',
    // учебный контент — отдельный git-репозиторий, журнал истории (specs/03)
    contentDir: './content',
    // одноразовые QR-токены входа (specs/09)
    qrTokensDir: './qr-tokens',
  },
})
