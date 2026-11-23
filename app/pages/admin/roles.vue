<script setup lang="ts">
import type { RoleDef, RoleScope } from '#shared/types'
import { errText } from '#shared/errors'

const { data, refresh } = await useFetch('/api/roles')
const roles = computed(() => data.value?.roles ?? [])

useBreadcrumbs().value = [{ label: 'Курсы', to: '/' }, { label: 'Роли' }]

const SCOPE_TITLES: Record<RoleScope, string> = {
  owner: 'Свои курсы (как учитель)',
  member: 'Зачисленные курсы (как ученик)',
  none: 'Только платформенные права',
}

// undefined — панель закрыта, null — создание, объект — редактирование
const panelRole = ref<RoleDef | null | undefined>(undefined)
const error = ref('')
const busy = ref(false)

function onSaved() {
  panelRole.value = undefined
  void refresh()
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
  <PageShell>
    <template #title>Роли</template>
    <template #actions>
      <button class="icon-btn" aria-label="Создать роль" @click="panelRole = null">
        <Icon name="lucide:plus" />
      </button>
    </template>

    <p class="muted">
      Роли teacher/student системные: их наборы прав
      можно менять, сами роли удалить нельзя. Роль admin — неизменяемая.
    </p>

    <div class="card">
      <table class="data-table">
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
            <td v-if="r.name !== 'admin'" class="row-actions">
              <span class="tip">
                <button class="icon-btn" aria-label="Редактировать роль" @click="panelRole = r">
                  <Icon name="lucide:pencil" />
                </button>
                <span class="tip-body">Редактировать</span>
              </span>
              <span class="tip">
                <button
                  class="icon-btn danger"
                  :aria-label="r.builtin ? 'Сбросить к системной' : 'Удалить роль'"
                  :disabled="busy"
                  @click="resetRole(r)"
                >
                  <Icon name="lucide:trash-2" />
                </button>
                <span class="tip-body">{{ r.builtin ? 'Сбросить к системной' : 'Удалить' }}</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <RolePanel
      v-if="panelRole !== undefined"
      :role="panelRole"
      @close="panelRole = undefined"
      @saved="onSaved"
    />
  </PageShell>
</template>
