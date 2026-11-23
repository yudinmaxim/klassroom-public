<script setup lang="ts">
import type { TocItem, DocPayload } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const materialSlug = computed(() => String(route.params.topic))

const { data, refresh, error: loadError } = await useFetch(
  `/api/courses/${slug.value}/topics/${materialSlug.value}`,
)
if (loadError.value) {
  throw createError({ statusCode: 404, message: 'Тема не найдена', fatal: true })
}

const { data: coursePageData } = useCourseContext()
const canEdit = computed(() => coursePageData.value?.canMaterials ?? false)

const material = computed(() => data.value?.material ?? null)
const docPayload = computed<DocPayload | null>(() =>
  material.value?.type === 'doc' ? (material.value.payload as DocPayload) : null,
)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const courseTitle = coursePageData.value?.course?.title ?? slug.value
  crumbs.value = material.value
    ? [
        { label: 'Курсы', to: '/' },
        { label: courseTitle, to: `/courses/${slug.value}` },
        { label: 'Темы', to: `/courses/${slug.value}/topics` },
        { label: material.value.title },
      ]
    : [
        { label: 'Курсы', to: '/' },
        { label: courseTitle, to: `/courses/${slug.value}` },
      ]
})

// --- режим редактирования ---
const editing = ref(false)
const form = reactive({ title: '', content: '' })

function startEdit() {
  form.title = material.value?.title ?? ''
  form.content = docPayload.value?.content ?? ''
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

// «Редактировать» из таблицы материалов ведёт сюда с ?edit=1
if (route.query.edit === '1' && canEdit.value) startEdit()

const saveError = ref('')
const saving = ref(false)

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/topics/${materialSlug.value}`, {
      method: 'PATCH',
      body: { title: form.title, content: form.content },
    })
    editing.value = false
    await refresh()
  } catch (e) {
    saveError.value = errText(e, 'Не удалось сохранить тему')
  } finally {
    saving.value = false
  }
}

const deleting = ref(false)

async function removeMaterial() {
  if (!window.confirm('Удалить тему вместе с вложениями? Восстановить можно только из git-журнала.')) return
  deleting.value = true
  try {
    await $fetch(`/api/courses/${slug.value}/topics/${materialSlug.value}`, { method: 'DELETE' })
    await navigateTo(`/courses/${slug.value}`)
  } catch (e) {
    saveError.value = errText(e, 'Не удалось удалить тему')
    deleting.value = false
  }
}

// --- вложения ---
const uploadError = ref('')
const uploadBusy = ref(false)

async function uploadAttachment(file: File) {
  uploadError.value = ''
  uploadBusy.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    await $fetch(`/api/courses/${slug.value}/topics/${materialSlug.value}/attachments`, {
      method: 'POST',
      body: fd,
    })
    await refresh()
  } catch (e) {
    uploadError.value = errText(e, 'Не удалось загрузить файл')
  } finally {
    uploadBusy.value = false
  }
}

async function removeAttachment(name: string) {
  uploadError.value = ''
  try {
    await $fetch(
      `/api/courses/${slug.value}/topics/${materialSlug.value}/attachments/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    )
    await refresh()
  } catch (e) {
    uploadError.value = errText(e, 'Не удалось удалить файл')
  }
}

const attachmentUrl = (name: string) =>
  `/api/courses/${slug.value}/topics/${materialSlug.value}/attachments/${encodeURIComponent(name)}`

const fmtDate = (iso: string) => new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div v-if="material" class="course-page">
  <div class="course-content">
    <header class="page-head topic-hero">
      <div class="topic-hero-text">
        <h1 class="page-title">{{ material.title }}</h1>
        <p v-if="!editing" class="muted topic-meta">Конспект · обновлён {{ fmtDate(material.updatedAt) }}</p>
      </div>
      <div v-if="!editing && canEdit" class="page-actions">
        <span class="tip">
          <button class="icon-btn" aria-label="Редактировать тему" @click="startEdit">
            <Icon name="lucide:pencil" />
          </button>
          <span class="tip-body">Редактировать</span>
        </span>
        <span class="tip">
          <button class="icon-btn danger" aria-label="Удалить тему" :disabled="deleting" @click="removeMaterial">
            <Icon name="lucide:trash-2" />
          </button>
          <span class="tip-body">Удалить</span>
        </span>
      </div>
    </header>

    <p v-if="saveError && !editing" class="error">{{ saveError }}</p>
    <p v-if="saveError && editing" class="error" style="margin-bottom: 10px;">{{ saveError }}</p>

    <!-- Просмотр -->
    <div v-if="!editing && docPayload" class="md-layout">
      <details v-if="material.toc.length" class="toc">
        <summary>Содержание</summary>
        <ul>
          <li v-for="t in material.toc as TocItem[]" :key="t.id" :class="`level-${t.level}`">
            <a :href="`#${t.id}`">{{ t.text }}</a>
          </li>
        </ul>
      </details>
      <div>
        <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере (sanitize-html, server/lib/md.ts) -->
        <div class="md-body" v-html="material.html" />

        <div v-if="docPayload.attachments.length" style="margin-top: 26px; border-top: 1px solid var(--line); padding-top: 14px;">
          <h2>Вложения</h2>
          <FileChips :files="docPayload.attachments" :href-for="attachmentUrl" />
        </div>
      </div>
    </div>

    <!-- Редактирование -->
    <div v-if="editing" style="margin-top: 14px;">
      <div>
        <label>
          Название
          <input v-model="form.title">
        </label>
        <div class="md-editor-wrap" style="margin-top: 10px;">
          <MdEditor
            id="klassroom-material-editor"
            v-model="form.content"
            language="en-US"
            :toolbars="MD_TOOLBARS"
          />
        </div>
        <div v-if="canEdit" style="margin-top: 10px;">
          <h3 style="margin-bottom: 6px;">Вложения</h3>
          <p class="muted" style="margin: 0 0 6px;">
            В тексте: <code>![описание](имя-файла.png)</code> — картинка, <code>[файл](имя-файла.pdf)</code> — ссылка.
          </p>
          <AttachmentField
            :items="docPayload?.attachments ?? []"
            :busy="uploadBusy"
            :link-for="attachmentUrl"
            @upload="uploadAttachment"
            @remove="removeAttachment"
          />
          <p v-if="uploadError" class="error">{{ uploadError }}</p>
        </div>
      </div>

    </div>

  </div>

  <footer v-if="editing" class="page-foot">
    <button class="primary" :disabled="saving || !form.title" @click="save">
      {{ saving ? 'Сохраняю…' : 'Сохранить' }}
    </button>
    <button @click="cancelEdit">Отмена</button>
  </footer>
  </div>
</template>

<style scoped>
/* Шапка темы: воздух между заголовком и содержимым */
.topic-hero {
  align-items: center;
  margin-bottom: 32px;
}
.topic-hero-text { flex: 1; min-width: 0; }
.topic-hero .page-title { margin: 0; }
.topic-meta { margin: 4px 0 0; font-size: 13px; }
</style>
