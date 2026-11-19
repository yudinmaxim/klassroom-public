<script setup lang="ts">
import type { RoleDef, UserPublic } from '#shared/types'
import { errText } from '#shared/errors'

/** Боковая панель создания/редактирования аккаунта. */
const props = defineProps<{ user: UserPublic | null, roles: RoleDef[] }>()
const emit = defineEmits<{
  close: []
  saved: [generatedPassword?: string]
}>()

const isEdit = computed(() => !!props.user)
const username = ref(props.user?.username ?? '')
const pseudonym = ref(props.user?.pseudonym ?? '')
const role = ref(props.user?.role ?? 'student')
const error = ref('')
const busy = ref(false)

async function save() {
  error.value = ''
  busy.value = true
  try {
    if (props.user) {
      await $fetch(`/api/users/${props.user.username}`, {
        method: 'PATCH',
        body: { pseudonym: pseudonym.value, role: role.value },
      })
      emit('saved')
    } else {
      const res = await $fetch<{ generatedPassword?: string }>('/api/users', {
        method: 'POST',
        body: { username: username.value, pseudonym: pseudonym.value, role: role.value },
      })
      emit('saved', res.generatedPassword)
    }
  } catch (e) {
    error.value = errText(e, isEdit.value ? 'Не удалось сохранить аккаунт' : 'Не удалось создать аккаунт')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="side-backdrop" @click.self="emit('close')">
    <aside class="side-panel" role="dialog" aria-modal="true" :aria-label="isEdit ? 'Редактирование аккаунта' : 'Новый аккаунт'">
      <div class="modal-head">
        <h2>{{ isEdit ? `Аккаунт: ${user?.username}` : 'Новый аккаунт' }}</h2>
        <button class="icon-btn" aria-label="Закрыть" @click="emit('close')">
          <Icon name="lucide:x" />
        </button>
      </div>

      <form class="form" @submit.prevent="save">
        <label>
          Логин
          <input
            v-model="username"
            autocomplete="off"
            placeholder="например ezhik-7"
            :disabled="isEdit"
            required
          >
        </label>
        <label>
          Псевдоним
          <input v-model="pseudonym" placeholder="например Ёжик-7" required>
        </label>
        <label>
          Роль
          <select v-model="role">
            <option v-for="r in roles" :key="r.name" :value="r.name">{{ r.title }}</option>
          </select>
        </label>
        <p v-if="!isEdit" class="muted">
          Пароль сгенерируется автоматически (вид «lisa-luna-42») и будет показан один раз.
        </p>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="row">
          <button class="primary" :disabled="busy || !pseudonym.trim() || (!isEdit && !username.trim())">
            {{ busy ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать' }}
          </button>
          <button type="button" @click="emit('close')">Отмена</button>
        </div>
      </form>
    </aside>
  </div>
</template>
