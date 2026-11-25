<script setup lang="ts">
import type { RoleDef, RoleScope } from '#shared/types'
import { PERMISSION_CATALOG, GROUP_TITLES, PERMISSION_GROUPS } from '#shared/permissions-catalog'
import { errText } from '#shared/errors'

/** Боковая панель создания/редактирования роли. */
const props = defineProps<{ role: RoleDef | null }>()
const emit = defineEmits<{ close: [], saved: [] }>()

const isEdit = computed(() => !!props.role)
const name = ref(props.role?.name ?? '')
const title = ref(props.role?.title ?? '')
const scope = ref<RoleScope>(props.role?.scope ?? 'owner')
const permissions = ref(new Set(props.role?.permissions ?? []))
const immutable = computed(() => props.role?.name === 'admin')
const error = ref('')
const busy = ref(false)

function togglePermission(code: string) {
  if (permissions.value.has(code)) permissions.value.delete(code)
  else permissions.value.add(code)
}

async function save() {
  error.value = ''
  busy.value = true
  try {
    const body = { title: title.value, scope: scope.value, permissions: [...permissions.value] }
    if (props.role) {
      await $fetch(`/api/roles/${props.role.name}`, { method: 'PATCH', body })
    } else {
      await $fetch('/api/roles', { method: 'POST', body: { name: name.value, ...body } })
    }
    emit('saved')
  } catch (e) {
    error.value = errText(e, 'Не удалось сохранить роль')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SidePanel
    :title="isEdit ? `Роль: ${role?.title}` : 'Новая роль'"
    :label="isEdit ? 'Редактирование роли' : 'Новая роль'"
    @close="emit('close')"
  >

      <form class="form" @submit.prevent="save">
        <label>
          Код роли
          <input v-model="name" :disabled="isEdit" placeholder="например assistant" required>
        </label>
        <label>
          Название
          <input v-model="title" placeholder="например Ассистент" required>
        </label>
        <label>
          Область действия курсовых прав
          <select v-model="scope">
            <option value="none">Только платформенные права</option>
            <option value="owner">Свои курсы (как учитель)</option>
            <option value="member">Зачисленные курсы (как ученик)</option>
          </select>
        </label>

        <fieldset
          v-for="g in PERMISSION_GROUPS"
          :key="g"
          style="border: 1px solid var(--line); border-radius: 8px; padding: 12px;"
        >
          <legend style="padding: 0 6px; color: var(--muted); font-size: 13px;">{{ GROUP_TITLES[g] }}</legend>
          <div v-for="p in PERMISSION_CATALOG.filter(p => p.group === g)" :key="p.code" class="tip" style="margin: 4px 0;">
            <label style="display: flex; gap: 8px; align-items: center; color: var(--ink); font-size: 14px;">
              <input
                type="checkbox"
                :checked="permissions.has(p.code)"
                :disabled="immutable"
                @change="togglePermission(p.code)"
              >
              <span>{{ p.title }}</span>
              <span class="muted">· {{ p.code }}</span>
            </label>
            <span class="tip-body">{{ p.desc }}</span>
          </div>
        </fieldset>

        <p v-if="immutable" class="muted">Роль admin неизменяемая.</p>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="row">
          <button class="primary" :disabled="busy || immutable || !title.trim() || (!isEdit && !name.trim())">
            {{ busy ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать' }}
          </button>
          <button type="button" @click="emit('close')">Отмена</button>
        </div>
      </form>
  </SidePanel>
</template>
