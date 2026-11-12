<script setup lang="ts">
import { errText } from '#shared/errors'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data: courseData, error: loadError } = await useFetch(`/api/courses/${slug.value}`)
if (loadError.value || !courseData.value?.canAssignments) {
  throw createError({ statusCode: 403, message: 'Нет доступа', fatal: true })
}
const roster = computed(() => courseData.value?.roster ?? [])

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const courseTitle = courseData.value?.course?.title ?? slug.value
  crumbs.value = [
    { label: 'Курсы', to: '/' },
    { label: courseTitle, to: `/courses/${slug.value}` },
    { label: 'Новое задание' },
  ]
})

const editTab = ref<'edit' | 'preview'>('edit')
const form = reactive({
  title: '',
  type: 'general' as 'general' | 'private',
  audience: [] as string[],
  due: '',
  maxPoints: null as number | null,
  description: '',
})
const preview = ref('')

const toolbars = [
  'bold', 'underline', 'italic', 'strikeThrough', '-',
  'title', 'unorderedList', 'orderedList', 'task', 'quote', '-',
  'codeRow', 'code', 'link', 'image', 'table', '-',
  'revoke', 'next',
]

async function renderPreview() {
  try {
    const res = await $fetch<{ html: string }>('/api/md/render', {
      method: 'POST',
      body: { course: slug.value, content: form.description },
    })
    preview.value = res.html
  } catch { /* превью не критично */ }
}

let previewTimer: ReturnType<typeof setTimeout> | null = null
watch(() => form.description, () => {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(renderPreview, 400)
})

function showPreviewTab() {
  editTab.value = 'preview'
  void renderPreview()
}

const saveError = ref('')
const saving = ref(false)
const canSave = computed(() =>
  form.title.trim().length >= 3 && (form.type === 'general' || form.audience.length > 0),
)

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    const res = await $fetch<{ assignment: { slug: string } }>(
      `/api/courses/${slug.value}/assignments`,
      {
        method: 'POST',
        body: {
          title: form.title,
          type: form.type,
          audience: form.type === 'private' ? form.audience : [],
          due: form.due || null,
          maxPoints: form.maxPoints,
          description: form.description,
        },
      },
    )
    await navigateTo(`/courses/${slug.value}/assignments/${res.assignment.slug}`)
  } catch (e) {
    saveError.value = errText(e, 'Не удалось создать задание')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PageShell>
    <template #title>Новое задание</template>

    <p class="muted">Задание создаётся в статусе «Не выдано» — опубликуйте его на странице задания.</p>

    <div class="editor-tabs" role="tablist" style="margin-top: 14px;">
      <button
        class="small"
        :class="{ active: editTab === 'edit' }"
        role="tab"
        :aria-selected="editTab === 'edit'"
        @click="editTab = 'edit'"
      >
        Редактор
      </button>
      <button
        class="small"
        :class="{ active: editTab === 'preview' }"
        role="tab"
        :aria-selected="editTab === 'preview'"
        @click="showPreviewTab"
      >
        Предпросмотр
      </button>
    </div>

    <div v-if="editTab === 'edit'" class="form">
      <label>
        Название
        <input v-model="form.title">
      </label>
      <label>
        Тип
        <select v-model="form.type">
          <option value="general">Общее (весь курс)</option>
          <option value="private">Частное (выбранным ученикам)</option>
        </select>
      </label>
      <div v-if="form.type === 'private'">
        <span class="muted" style="display:block; margin-bottom: 4px;">Ученики:</span>
        <label v-for="s in roster" :key="s.username" class="row" style="gap: 6px;">
          <input v-model="form.audience" type="checkbox" :value="s.username">
          {{ s.pseudonym }} <span class="muted">({{ s.username }})</span>
        </label>
        <p v-if="!roster.length" class="muted">В курсе пока нет учеников.</p>
      </div>
      <div class="row" style="gap: 16px;">
        <label>
          Дедлайн
          <input v-model="form.due" type="date">
        </label>
        <label>
          Макс. баллов
          <input v-model.number="form.maxPoints" type="number" min="1" max="1000" style="width: 110px;">
        </label>
      </div>
      <div class="md-editor-wrap" style="margin-top: 10px;">
        <MdEditor
          id="wikiroom-assignment-new-editor"
          v-model="form.description"
          language="en-US"
          :preview="false"
          :toolbars="toolbars"
        />
      </div>
    </div>
    <div v-else>
      <!-- eslint-disable-next-line vue/no-v-html -- серверный санитизированный рендер -->
      <div class="md-body" v-html="preview" />
    </div>

    <template #foot>
      <p v-if="saveError" class="error" style="margin: 0;">{{ saveError }}</p>
      <button class="primary" :disabled="saving || !canSave" @click="save">
        {{ saving ? 'Создаю…' : 'Создать задание' }}
      </button>
      <button @click="navigateTo(`/courses/${slug}`)">Отмена</button>
    </template>
  </PageShell>
</template>
