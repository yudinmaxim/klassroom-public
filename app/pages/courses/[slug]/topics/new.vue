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
const createdSlug = ref('')

/** Ленивая материализация темы: создаём на диске при первом сохранении/вложении. */
async function ensureCreated(): Promise<string> {
  if (createdSlug.value) return createdSlug.value
  const created = await $fetch<{ material: { slug: string } }>(
    `/api/courses/${slug.value}/topics`,
    { method: 'POST', body: { title: form.title, type: 'doc', content: form.content } },
  )
  createdSlug.value = created.material.slug
  return createdSlug.value
}

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    const existed = !!createdSlug.value
    const target = await ensureCreated()
    if (existed) {
      // тема создана лениво при вложении — досохраняем последние правки
      await $fetch(`/api/courses/${slug.value}/topics/${target}`, {
        method: 'PATCH',
        body: { title: form.title, content: form.content },
      })
    }
    await navigateTo(`/courses/${slug.value}/topics/${target}`)
  } catch (e) {
    saveError.value = errText(e, 'Не удалось создать тему')
  } finally {
    saving.value = false
  }
}

// --- вложения (ленивое создание темы) ---
const fileInput = ref<HTMLInputElement | null>(null)
const uploadError = ref('')
const uploadBusy = ref(false)

async function attachFile() {
  const file = fileInput.value?.files?.[0]
  if (!file) return
  uploadError.value = ''
  if (form.title.trim().length < 3) {
    uploadError.value = 'Укажите название темы, чтобы прикрепить файл'
    return
  }
  uploadBusy.value = true
  try {
    const target = await ensureCreated()
    const fd = new FormData()
    fd.append('file', file)
    await $fetch(`/api/courses/${slug.value}/topics/${target}/attachments`, {
      method: 'POST',
      body: fd,
    })
    await navigateTo(`/courses/${slug.value}/topics/${target}?edit=1`)
  } catch (e) {
    uploadError.value = errText(e, 'Не удалось прикрепить файл')
    uploadBusy.value = false
  }
}
</script>

<template>
  <PageShell>
    <template #title>Новая тема</template>

    <p class="muted">При сохранении или прикреплении файла тема создастся автоматически.</p>

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
      <div style="margin-top: 12px;">
        <h3 style="margin-bottom: 6px;">Вложения</h3>
        <p class="muted" style="margin: 0 0 6px;">
          В тексте: <code>![описание](имя-файла.png)</code> — картинка, <code>[файл](имя-файла.pdf)</code> — ссылка.
          Тема создастся при загрузке — укажите название.
        </p>
        <input ref="fileInput" type="file" style="margin-bottom: 8px;">
        <button class="small" :disabled="uploadBusy" @click="attachFile">
          {{ uploadBusy ? 'Загрузка…' : 'Приложить файл' }}
        </button>
        <p v-if="uploadError" class="error">{{ uploadError }}</p>
      </div>
    </div>

    <div v-else>
      <!-- eslint-disable-next-line vue/no-v-html -- серверный санитизированный рендер -->
      <div class="md-body" v-html="preview" />
    </div>

    <template #foot>
      <p v-if="saveError" class="error" style="margin: 0;">{{ saveError }}</p>
      <button class="primary" :disabled="saving || form.title.trim().length < 3" @click="save">
        {{ saving ? 'Сохраняю…' : 'Создать тему' }}
      </button>
      <button @click="navigateTo(`/courses/${slug}`)">Отмена</button>
    </template>
  </PageShell>
</template>
