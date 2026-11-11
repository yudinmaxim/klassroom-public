// Общие типы (используются сервером и фронтом)
export type Role = 'admin' | 'teacher' | 'student'

export interface UserPublic {
  username: string
  pseudonym: string
  role: Role
  createdAt: string
}
