<script setup lang="ts">
import { PUBLIC_GROUP } from '#shared/types'
import { useCourseGroups } from '~/composables/useCourseGroups'

/**
 * Чипы групп контента. 'public' не отображается (это «все»).
 * «Без группы» — когда нет 'public' и ни один id не указывает
 * на существующую группу (пустой список или все группы удалены).
 */
const props = defineProps<{ slug: string, groups: string[] | undefined }>()
const { groups: allGroups, groupTitle } = useCourseGroups(computed(() => props.slug))

const known = computed(() => new Set((allGroups.value ?? []).map(g => g.id)))
const realChips = computed(() =>
  (props.groups ?? []).filter(id =>
    id !== PUBLIC_GROUP && (known.value.has(id) || !allGroups.value),
  ),
)
const groupless = computed(() => {
  const g = props.groups ?? []
  if (g.includes(PUBLIC_GROUP)) return false
  // список ещё не загружен — не показываем бейдж преждевременно
  if (!allGroups.value) return false
  return !g.some(id => known.value.has(id))
})
</script>

<template>
  <span v-if="groupless" class="group-chip groupless">Без группы</span>
  <span
    v-for="id in realChips"
    :key="id"
    class="group-chip"
  >{{ groupTitle(id) }}</span>
</template>

<style scoped>
.group-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--accent-soft, rgba(79, 70, 229, 0.1));
  color: var(--accent, #4f46e5);
  margin-right: 4px;
  white-space: nowrap;
}
.group-chip.groupless {
  background: var(--line, #e5e5e5);
  color: var(--muted, #888);
}
</style>
