<script setup lang="ts">
import { PUBLIC_GROUP } from '#shared/types'
import { useCourseGroups } from '~/composables/useCourseGroups'

/**
 * Выбор групп видимости контента. v-model — string[] id групп.
 * 'public' взаимоисключающая: контент либо публичный, либо для
 * конкретных групп, либо «без группы» (пустой массив — ученикам скрыт).
 */
const props = defineProps<{ slug: string }>()
const model = defineModel<string[]>({ default: () => [PUBLIC_GROUP] })

const { groups, groupTitle } = useCourseGroups(computed(() => props.slug))

function toggle(id: string) {
  const cur = new Set(model.value ?? [])
  if (id === PUBLIC_GROUP) {
    // публичная отменяет групповые и наоборот
    model.value = cur.has(PUBLIC_GROUP) ? [] : [PUBLIC_GROUP]
    return
  }
  cur.delete(PUBLIC_GROUP)
  if (cur.has(id)) cur.delete(id)
  else cur.add(id)
  model.value = [...cur]
}

function isChecked(id: string) {
  return (model.value ?? []).includes(id)
}
</script>

<template>
  <div>
    <span class="muted" style="font-size: 13px;">Группы</span>
    <div class="row" style="gap: 14px; flex-wrap: wrap; margin-top: 4px;">
      <label class="check">
        <input
          type="checkbox"
          :checked="isChecked(PUBLIC_GROUP)"
          @change="toggle(PUBLIC_GROUP)"
        >
        {{ groupTitle(PUBLIC_GROUP) }}
      </label>
      <label v-for="g in groups ?? []" :key="g.id" class="check">
        <input
          type="checkbox"
          :checked="isChecked(g.id)"
          @change="toggle(g.id)"
        >
        {{ g.title }}
      </label>
      <span v-if="!(model ?? []).length" class="muted" style="font-size: 12px; align-self: center;">
        без группы — ученикам не видно
      </span>
    </div>
  </div>
</template>
