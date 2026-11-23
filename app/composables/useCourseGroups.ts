import { PUBLIC_GROUP, type CourseGroup } from '#shared/types'

export interface CourseGroupsState {
  groups: Ref<CourseGroup[] | null>
  /** Отображаемое имя группы; 'public' → «Публичная». */
  groupTitle: (id: string) => string
  /** id групп, в которых состоит текущий пользователь (без 'public'). */
  myGroupIds: ComputedRef<Set<string>>
  refresh: () => Promise<void>
}

/**
 * Группы курса + текущий пользователь. Используется селекторами групп
 * в редакторах и фильтром ленты. 'public' — техническая группа,
 * в API не хранится, добавляется на клиенте.
 */
export function useCourseGroups(slug: Ref<string> | ComputedRef<string>): CourseGroupsState {
  const slugStr = computed(() => unref(slug))
  const groups = ref<CourseGroup[] | null>(null)

  async function load() {
    if (!slugStr.value) return
    try {
      groups.value = await $fetch<CourseGroup[]>(`/api/courses/${slugStr.value}/groups`)
    } catch {
      groups.value = []
    }
  }
  watch(slugStr, () => { void load() }, { immediate: true })

  const { data: me } = useFetch<{ user?: { username?: string, role?: string } }>(
    '/api/auth/me',
    { key: 'me' },
  )

  const groupTitle = (id: string) =>
    id === PUBLIC_GROUP ? 'Публичная' : (groups.value?.find(g => g.id === id)?.title ?? id)

  const myGroupIds = computed(() => {
    const meName = me.value?.user?.username
    if (!meName || !groups.value) return new Set<string>()
    return new Set(
      groups.value
        .filter(g => g.members.includes(meName))
        .map(g => g.id),
    )
  })

  return { groups, groupTitle, myGroupIds, refresh: load }
}
