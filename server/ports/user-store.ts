import type { Role, UserPublic } from '#shared/types'

/**
 * Порт хранилища аккаунтов (specs/01-architecture.md).
 * Методы описаны в терминах домена — «завести аккаунт», «проверить вход» —
 * а не в терминах хранилища, чтобы смена реализации (файлы → БД) не трогала
 * роуты. Адаптер выбирается один раз за жизнь процесса.
 */
export interface UserStore {
  /** Сколько аккаунтов существует (используется для проверки первого запуска). */
  countUsers(): Promise<number>

  /** Все аккаунты без секретных полей. */
  listUsers(): Promise<UserPublic[]>

  /** Аккаунт по логину или null. */
  getUser(username: string): Promise<UserPublic | null>

  /** Завести аккаунт с заданным или сгенерированным паролем. */
  createUser(input: { username: string, pseudonym: string, role: Role, password?: string }): Promise<{
    user: UserPublic
    /** Пароль присутствует, только если был сгенерирован здесь. */
    generatedPassword?: string
  }>

  /** Сбросить пароль аккаунта. */
  resetPassword(username: string, password?: string): Promise<{ generatedPassword?: string }>

  /** Сменить роль аккаунта (роль должна существовать — проверяет роут). */
  changeRole(username: string, role: string): Promise<UserPublic>

  /** Проверить вход: null при неверных учётных данных. */
  authenticate(username: string, password: string): Promise<UserPublic | null>
}
