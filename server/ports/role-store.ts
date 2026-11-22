import type { RoleDef, RoleScope } from '#shared/types'

/**
 * Порт хранилища ролей (specs/08-roles-permissions.md): роли — файлы
 * roles/<name>.yml вне content/. Файл роли переопределяет системное
 * значение по умолчанию; удаление файла = возврат к системному набору
 * (для builtin ролей это и есть «сброс»).
 */
export interface RoleStore {
  /** Все роли: системные (если нет файла) + переопределённые + созданные. */
  listRoles(): Promise<RoleDef[]>

  /** Роль по коду или null. */
  getRole(name: string): Promise<RoleDef | null>

  /** Создать/переопределить роль. */
  saveRole(input: { name: string, title: string, scope: RoleScope, permissions: string[] }): Promise<RoleDef>

  /** Удалить файл роли (вернуть системное значение, если роль builtin). */
  deleteRole(name: string): Promise<void>
}
