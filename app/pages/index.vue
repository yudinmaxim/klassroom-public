<script setup lang="ts">
import { placeholderCover } from '~/utils/placeholder-cover'

const { data: me } = await useFetch('/api/auth/me', { key: 'me' })
if (!me.value?.user) {
  // гостям на главной нечего смотреть — сразу на вход
  await navigateTo('/login', { replace: true })
}

const { data } = await useFetch('/api/courses')
const crumbs = useBreadcrumbs()
crumbs.value = [{ label: 'Курсы' }]
const user = computed(() => me.value?.user ?? null)
const courses = computed(() => data.value?.courses ?? [])
const canCreate = computed(() => user.value?.role === 'teacher' || user.value?.role === 'admin')

const stats = computed(() => {
  const list = courses.value
  const teaching = user.value ? list.filter(c => c.teacher === user.value!.username).length : 0
  return {
    total: list.length,
    students: list.reduce((s, c) => s + c.studentCount, 0),
    teaching,
  }
})

const showForm = ref(false)
</script>

<template>
  <div v-if="user" class="dash">
    <div class="dash-head">
      <div>
        <h1 class="dash-title">Добро пожаловать, {{ user.pseudonym }}</h1>
        <p class="dash-sub">Ваши курсы и учебное пространство</p>
      </div>
      <button v-if="canCreate" class="primary" @click="showForm = true">
        Создать курс
      </button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">Курсов</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.students }}</span>
        <span class="stat-label">Учеников суммарно</span>
      </div>
      <div v-if="user.role !== 'student'" class="stat-card">
        <span class="stat-value">{{ stats.teaching }}</span>
        <span class="stat-label">Веду я</span>
      </div>
    </div>

    <div v-if="courses.length" class="courses-grid">
      <NuxtLink
        v-for="c in courses"
        :key="c.slug"
        :to="`/courses/${c.slug}`"
        class="course-card"
      >
        <img
          class="course-cover"
          :src="c.cover ? `/api/courses/${c.slug}/cover` : placeholderCover(c.title)"
          alt=""
        >
        <div class="course-card-body">
          <div class="course-card-head">
            <strong class="course-title">{{ c.title }}</strong>
            <span class="tip">
              <span class="icon-btn course-open" aria-hidden="true">
                <Icon name="lucide:arrow-right" />
              </span>
            </span>
          </div>
          <div class="course-meta">
            <span class="muted">{{ c.teacher }}</span>
            <span class="course-count">{{ c.studentCount }} уч.</span>
          </div>
        </div>
      </NuxtLink>
    </div>
    <p v-else class="muted">
      {{ canCreate ? 'Курсов пока нет — создайте первый.' : 'Вас пока не зачислили ни на один курс.' }}
    </p>

    <CoursePanel
      v-if="showForm"
      @close="showForm = false"
      @saved="(slug) => navigateTo(`/courses/${slug}`)"
    />
  </div>
</template>

<style scoped>
.dash { padding-bottom: 32px; }
.dash-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.dash-title { margin: 0; font-size: 24px; }
.dash-sub { margin: 4px 0 0; color: var(--muted); font-size: 14px; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}
.stat-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 1px 3px rgba(35, 42, 53, 0.05);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-value { font-size: 26px; font-weight: 700; color: var(--accent); }
.stat-label { font-size: 13px; color: var(--muted); }

.courses-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.course-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0;
  overflow: hidden;
  text-decoration: none;
  color: var(--ink);
  box-shadow: 0 1px 3px rgba(35, 42, 53, 0.05);
  transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
/* обложка: те же пропорции, что у баннера на странице курса (~4:1) */
.course-cover {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 1;
  object-fit: cover;
}
.course-card-body { padding: 12px 18px 16px; }
.course-card:hover {
  box-shadow: 0 4px 14px rgba(0, 144, 192, 0.14);
  transform: translateY(-1px);
}
.course-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.course-title {
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.course-open { color: var(--muted); }
.course-card:hover .course-open { color: var(--accent); }
.course-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}
.course-count {
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
}
</style>
