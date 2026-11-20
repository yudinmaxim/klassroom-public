<script setup lang="ts">
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'
import { onNotification } from '~/composables/useNotifications'

const { data: coursePageData } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)
const canMaterials = computed(() => coursePageData.value?.canMaterials ?? false)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const c = course.value
  crumbs.value = c
    ? [{ label: 'Курсы', to: '/' }, { label: c.title, to: `/courses/${c.slug}` }]
    : [{ label: 'Курсы', to: '/' }]
})

interface MaterialRow { slug: string, title: string, type: string, updatedAt: string }
const materials = ref<MaterialRow[]>([])
const materialsError = ref('')

async function loadMaterials() {
  materialsError.value = ''
  try {
    const res = await $fetch<{ materials: MaterialRow[] }>(
      `/api/courses/${course.value?.slug}/topics`,
    )
    materials.value = res.materials
  } catch (e) {
    materialsError.value = errText(e, 'Не удалось загрузить материалы')
  }
}
onMounted(() => { if (course.value) void loadMaterials() })

// live-обновление списка тем по SSE-событиям
onMounted(() => onNotification((n) => {
  if (n.course === course.value?.slug && n.type.startsWith('material.')) {
    void loadMaterials()
  }
}))

const materialUrl = (m: MaterialRow) => `/courses/${course.value?.slug}/topics/${m.slug}`
function openMaterial(m: MaterialRow) { void navigateTo(materialUrl(m)) }
function editMaterial(m: MaterialRow) { void navigateTo(`${materialUrl(m)}?edit=1`) }

// --- оглавление: на широких экранах липкая панель слева, на узких — кнопка ---
const tocOpen = ref(false)

async function deleteMaterial(m: MaterialRow) {
  if (!window.confirm(`Удалить материал «${m.title}» вместе с вложениями?`)) return
  materialsError.value = ''
  try {
    await $fetch(materialUrl(m), { method: 'DELETE' })
    await loadMaterials()
  } catch (e) {
    materialsError.value = errText(e, 'Не удалось удалить материал')
  }
}
</script>

<template>
  <div class="course-page">
  <div class="course-content topics-layout">
    <button
      class="toc-toggle"
      :aria-expanded="tocOpen"
      @click="tocOpen = !tocOpen"
    >
      <Icon name="lucide:list" />
      Оглавление
      <Icon :name="tocOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'" />
    </button>

    <aside class="toc-panel" :class="{ open: tocOpen }" aria-label="Оглавление тем">
      <div class="toc-head">Оглавление</div>
      <nav v-if="materials.length" class="toc-list">
        <button
          v-for="m in materials"
          :key="m.slug"
          class="toc-item"
          @click="openMaterial(m)"
        >
          {{ m.title }}
        </button>
      </nav>
      <p v-else class="muted toc-empty">Тем пока нет.</p>
    </aside>

    <div class="topics-main">
    <div class="card">
      <SectionHead>
        Темы
        <template v-if="canMaterials" #actions>
          <span class="tip">
            <button
              class="icon-btn"
              aria-label="Добавить тему"
              @click="navigateTo(`/courses/${course?.slug}/topics/new`)"
            >
              <Icon name="lucide:plus" />
            </button>
            <span class="tip-body">Добавить тему</span>
          </span>
        </template>
      </SectionHead>

      <p v-if="materialsError" class="error">{{ materialsError }}</p>
      <table v-if="materials.length" class="data-table">
        <thead>
          <tr>
            <th>Тема</th>
            <th>Тип</th>
            <th v-if="canMaterials" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in materials"
            :key="m.slug"
            class="is-clickable"
            tabindex="0"
            @click="openMaterial(m)"
            @keydown.enter="openMaterial(m)"
          >
            <td><strong>{{ m.title }}</strong></td>
            <td class="muted">{{ m.type === 'doc' ? 'конспект' : m.type }}</td>
            <td v-if="canMaterials" class="row-actions">
              <span class="tip">
                <button
                  class="icon-btn"
                  aria-label="Редактировать тему"
                  @click.stop="editMaterial(m)"
                >
                  <Icon name="lucide:pencil" />
                </button>
                <span class="tip-body">Редактировать</span>
              </span>
              <span class="tip">
                <button
                  class="icon-btn danger"
                  aria-label="Удалить тему"
                  @click.stop="deleteMaterial(m)"
                >
                  <Icon name="lucide:trash-2" />
                </button>
                <span class="tip-body">Удалить</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Нет тем для отображения.</p>
    </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
.topics-layout {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.toc-toggle {
  display: none;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.toc-toggle svg { width: 15px; height: 15px; }

.toc-panel {
  position: sticky;
  top: 72px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 10px;
  box-shadow: 0 1px 3px rgba(35, 42, 53, 0.05);
  max-height: calc(100vh - 96px);
  overflow-y: auto;
}
.toc-head {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  padding: 2px 8px 8px;
}
.toc-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.toc-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border: none;
  border-radius: 7px;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toc-item:hover { background: var(--bg-soft); color: var(--accent); }
.toc-empty { padding: 4px 8px; margin: 0; font-size: 13px; }
.topics-main { min-width: 0; }

@media (max-width: 1100px) {
  .topics-layout { grid-template-columns: 1fr; }
  .toc-toggle { display: inline-flex; }
  .toc-panel {
    position: static;
    display: none;
    max-height: none;
    margin-bottom: 12px;
  }
  .toc-panel.open { display: block; }
}
</style>
