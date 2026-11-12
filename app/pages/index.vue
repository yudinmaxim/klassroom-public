<script setup lang="ts">
import { errText } from '#shared/errors'

const { data: me } = useFetch('/api/auth/me', { key: 'me' })
const { data, refresh } = await useFetch('/api/courses')
const user = computed(() => me.value?.user ?? null)
const courses = computed(() => data.value?.courses ?? [])
const canCreate = computed(() => user.value?.role === 'teacher' || user.value?.role === 'admin')

const showForm = ref(false)
const form = reactive({ title: '', description: '' })
const error = ref('')
const busy = ref(false)

async function createCourse() {
  error.value = ''
  busy.value = true
  try {
    const res = await $fetch<{ course: { slug: string } }>('/api/courses', {
      method: 'POST',
      body: form,
    })
    form.title = ''
    form.description = ''
    await refresh()
    await navigateTo(`/courses/${res.course.slug}`)
  } catch (e) {
    error.value = errText(e, 'Не удалось создать курс')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="user">
    <div class="row" style="margin-bottom: 16px;">
      <h1 style="margin: 0;">Мои курсы</h1>
      <div class="spacer" />
      <button v-if="canCreate" class="primary" @click="showForm = !showForm">
        {{ showForm ? 'Отмена' : 'Создать курс' }}
      </button>
    </div>

    <div v-if="showForm" class="card">
      <h2>Новый курс</h2>
      <form class="form" @submit.prevent="createCourse">
        <label>
          Название
          <input v-model="form.title" placeholder="Например: Геометрия 9А" required>
        </label>
        <label>
          Описание (необязательно)
          <textarea v-model="form.description" rows="2" />
        </label>
        <p class="muted">Адрес курса (slug) сформируется из названия автоматически.</p>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy">Создать</button>
      </form>
    </div>

    <div v-if="courses.length" class="card">
      <table>
        <thead>
          <tr>
            <th>Курс</th>
            <th>Учитель</th>
            <th>Учеников</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in courses" :key="c.slug">
            <td>
              <NuxtLink :to="`/courses/${c.slug}`"><strong>{{ c.title }}</strong></NuxtLink>
            </td>
            <td class="muted">{{ c.teacher }}</td>
            <td>{{ c.studentCount }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">
      {{ canCreate ? 'Курсов пока нет — создайте первый.' : 'Вас пока не зачислили ни на один курс.' }}
    </p>
  </div>
</template>
