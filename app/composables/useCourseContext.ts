import type { InjectionKey, Ref } from 'vue'
import type { CoursePageData } from '#shared/types'

/** Данные страницы курса, провайдятся родителем courses/[slug].vue. */
export interface CourseContext {
  data: Ref<CoursePageData | null>
  refresh: () => Promise<void>
}

export const courseContextKey: InjectionKey<CourseContext> = Symbol('courseContext')

export function useCourseContext(): CourseContext {
  const ctx = inject(courseContextKey)
  if (!ctx) throw new Error('useCourseContext: нет родителя courses/[slug]')
  return ctx
}
