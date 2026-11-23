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

const deleteTarget = ref<MaterialRow | null>(null)

async function confirmDeleteMaterial() {
  const m = deleteTarget.value
  deleteTarget.value = null
  if (!m) return
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
  <div class="course-content">
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
                  @click.stop="deleteTarget = m"
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

    <ConfirmModal
      v-if="deleteTarget"
      title="Удалить тему?"
      :message="`«${deleteTarget.title}» будет удалена вместе со всеми вложениями. Восстановить можно только из git-журнала.`"
      confirm-label="Удалить"
      danger
      @confirm="confirmDeleteMaterial"
      @cancel="deleteTarget = null"
    />
  </div>
  </div>
</template>
