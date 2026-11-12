<script setup lang="ts">
import { errText } from '#shared/errors'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data: courseData, error: loadError } = await useFetch(`/api/courses/${slug.value}`)
if (loadError.value || !courseData.value?.canMaterials) {
  throw createError({ statusCode: 403, message: 'Нет доступа', fatal: true })
}

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const courseTitle = courseData.value?.course?.title ?? slug.value
  crumbs.value = [
    { label: 'Курсы', to: '/' },
    { label: courseTitle, to: `/courses/${slug.value}` },
    { label: 'Новая тема' },
  ]
})

const editTab = ref<'edit' | 'preview'>('edit')
const form = reactive({ title: '', content: '' })
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
      body: { course: slug.value, content: form.content },
    })
    preview.value = res.html
  } catch {
    // ошибка превью не блокирует редактирование
  }
}

let previewTimer: ReturnType<typeof setTimeout> | null = null
watch(() => form.content, () => {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(renderPreview, 400)
})

function showPreviewTab() {
  editTab.value = 'preview'
  void renderPreview()
}

const saveError = ref('')
const saving = ref(false)

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    const created = await $fetch<{ material: { slug: string } }>(
      `/api/courses/${slug.value}/topics`,
      { method: 'POST', body: { title: form.title, type: 'doc', content: form.content } },
    )
    await navigateTo(`/courses/${slug.value}/topics/${created.material.slug}`)
  } catch (e) {
    saveError.value = errText(e, 'Не удалось создать тему')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <h1>Новая тема</h1>
    <p class="muted">Вложения и тип «конспект» — после сохранения тема откроется как обычная.</p>

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

    <div v-if="editTab === 'edit'">
      <label>
        Название
        <input v-model="form.title">
      </label>
      <div class="md-editor-wrap" style="margin-top: 10px;">
        <MdEditor
          id="wikiroom-topic-new-editor"
          v-model="form.content"
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

    <p v-if="saveError" class="error" style="margin-top: 12px;">{{ saveError }}</p>
    <div class="row" style="margin-top: 14px;">
      <button class="primary" :disabled="saving || form.title.trim().length < 3" @click="save">
        {{ saving ? 'Сохраняю…' : 'Создать тему' }}
      </button>
      <button @click="navigateTo(`/courses/${slug}`)">Отмена</button>
    </div>
  </div>
</template>
