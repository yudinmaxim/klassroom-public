<script setup lang="ts">
import type { RoleDef, RoleScope } from '#shared/types'
import { PERMISSION_CATALOG, GROUP_TITLES, PERMISSION_GROUPS } from '#shared/permissions-catalog'
import { errText } from '#shared/errors'

const { data, refresh } = await useFetch('/api/roles')
const roles = computed(() => data.value?.roles ?? [])

const SCOPE_TITLES: Record<RoleScope, string> = {
  owner: 'Свои курсы (как учитель)',
  member: 'Зачисленные курсы (как ученик)',
  none: 'Только платформенные права',
}

// --- редактор ---
const editor = reactive({
  open: false,
  name: '' as string,
  title: '',
  scope: 'none' as RoleScope,
  permissions: new Set<string>(),
  builtin: false,
})

const selectedRole = ref<RoleDef | null>(null)
const error = ref('')
const busy = ref(false)

function openEditor(role: RoleDef) {
  selectedRole.value = role
  editor.open = true
  editor.name = role.name
  editor.title = role.title
  editor.scope = role.scope
  editor.builtin = role.builtin
  editor.permissions = new Set(role.permissions)
  error.value = ''
}

function openCreate() {
  selectedRole.value = null
  editor.open = true
  editor.name = ''
  editor.title = ''
  editor.scope = 'owner'
  editor.builtin = false
  editor.permissions = new Set()
  error.value = ''
}

function togglePermission(code: string) {
  if (editor.permissions.has(code)) editor.permissions.delete(code)
  else editor.permissions.add(code)
}

  [...editor.permissions].some(c => PERMISSION_CATALOG.find(p => p.code === c)?.group === g)

async function save() {
  error.value = ''
  busy.value = true
  try {
    const body = { title: editor.title, scope: editor.scope, permissions: [...editor.permissions] }
    if (selectedRole.value) {
      await $fetch(`/api/roles/${editor.name}`, { method: 'PATCH', body })
    } else {
      await $fetch('/api/roles', { method: 'POST', body: { name: editor.name, ...body } })
    }
    editor.open = false
    await refresh()
  } catch (e) {
    error.value = errText(e, 'Не удалось сохранить роль')
  } finally {
    busy.value = false
  }
}

async function resetRole(role: RoleDef) {
  error.value = ''
  busy.value = true
  try {
    await $fetch(`/api/roles/${role.name}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    error.value = errText(e, 'Не удалось удалить роль')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <div class="row" style="margin-bottom: 16px;">
      <h1 style="margin: 0;">Роли</h1>
      <div class="spacer" />
      <button class="primary" @click="openCreate">Создать роль</button>
    </div>
    <p class="muted">
      Роль — набор пермишенов (спека 08). Роли teacher/student системные: их наборы прав
      можно менять, сами роли удалить нельзя. Роль admin — неизменяемая.
    </p>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Название</th>
            <th>Код</th>
            <th>Область</th>
            <th>Прав</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in roles" :key="r.name">
            <td><strong>{{ r.title }}</strong> <span v-if="r.builtin" class="muted">· системная</span></td>
            <td class="muted">{{ r.name }}</td>
            <td class="muted">{{ SCOPE_TITLES[r.scope] }}</td>
            <td>{{ r.name === 'admin' ? 'все' : r.permissions.length }}</td>
            <td>
              <button v-if="r.name !== 'admin'" class="small" @click="openEditor(r)">Редактировать</button>
              <button
                v-if="r.name !== 'admin'"
                class="small"
                :disabled="busy"
                :title="r.builtin ? 'Сбросить к системному набору' : 'Удалить роль'"
                @click="resetRole(r)"
              >
                {{ r.builtin ? 'Сбросить' : 'Удалить' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editor.open" class="card">
      <h2>{{ selectedRole ? `Роль: ${selectedRole.title}` : 'Новая роль' }}</h2>
      <form class="form" @submit.prevent="save">
        <div class="row" style="gap: 12px; flex-wrap: wrap;">
          <label style="flex: 1; min-width: 140px;">
            Код роли
            <input v-model="editor.name" :disabled="!!selectedRole" placeholder="например assistant" required>
          </label>
          <label style="flex: 2; min-width: 160px;">
            Название
            <input v-model="editor.title" placeholder="например Ассистент" required>
          </label>
        </div>
        <label>
          Область действия курсовых прав
          <select v-model="editor.scope">
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
          <div v-for="p in PERMISSION_CATALOG.filter(p => p.group === g)" :key="p.code" style="margin: 4px 0;">
            <label style="display: flex; gap: 8px; align-items: center; color: var(--ink); font-size: 14px;">
              <input
                type="checkbox"
                :checked="editor.permissions.has(p.code)"
                :disabled="editor.name === 'admin'"
                @change="togglePermission(p.code)"
              >
              <span>{{ p.title }}</span>
              <span class="muted">· {{ p.code }}</span>
            </label>
          </div>
        </fieldset>

        <p v-if="error" class="error">{{ error }}</p>
        <div class="row">
          <button type="submit" class="primary" :disabled="busy || editor.name === 'admin'">Сохранить</button>
          <button type="button" @click="editor.open = false">Отмена</button>
        </div>
      </form>
    </div>
  </div>
</template>
