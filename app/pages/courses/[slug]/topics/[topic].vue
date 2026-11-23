<script setup lang="ts">
import type { TocItem, DocPayload, ExternalLink } from '#shared/types'
import { errText } from '#shared/errors'
import { normalizeExternalUrl, isHttpUrl, urlDomain } from '#shared/url'
import { extractExternalLinks, attachmentRefMatches } from '~/utils/file-ref'
import { useCourseContext } from '~/composables/useCourseContext'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import type { MdEditorExpose } from '~/composables/useEditorFileDrop'

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
const form = reactive({ title: '', content: '', links: [] as ExternalLink[] })

// drag-and-drop чипов вложений/ссылок и файлов ОС в редактор → markdown
const topicEditor = ref<MdEditorExpose | null>(null)
const topicDrop = useEditorFileDrop(topicEditor, () => docPayload.value?.attachments ?? [], {
  onOsFiles: uploadOsFiles,
})

function startEdit() {
  form.title = material.value?.title ?? ''
  form.content = docPayload.value?.content ?? ''
  form.links = (docPayload.value?.links ?? []).map(l => ({ ...l }))
  editing.value = true
  savedSnapshot.value = editSnapshot()
}

// --- защита от ухода без сохранения ---
const savedSnapshot = ref('')
function editSnapshot() {
  return JSON.stringify({ t: form.title, c: form.content, l: form.links })
}
const dirty = computed(() => editing.value && editSnapshot() !== savedSnapshot.value)

const leaveConfirmOpen = ref(false)
let leaveResolve: ((v: boolean) => void) | null = null

onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return new Promise<boolean>((resolve) => {
    leaveResolve = resolve
    leaveConfirmOpen.value = true
  })
})
function answerLeave(stay: boolean) {
  leaveConfirmOpen.value = false
  leaveResolve?.(stay)
  leaveResolve = null
}
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

function cancelEdit() {
  editing.value = false
}

// «Редактировать» из таблицы материалов ведёт сюда с ?edit=1
if (route.query.edit === '1' && canEdit.value) startEdit()

const saveError = ref('')
const saving = ref(false)

/** Ссылка из текста → в блок «Ссылки» (дедуп по url, title = текст или домен). */
function syncLinksFromContent() {
  for (const l of extractExternalLinks(form.content)) {
    const url = normalizeExternalUrl(l.url)
    if (!isHttpUrl(url)) continue
    if (form.links.some(x => normalizeExternalUrl(x.url.trim()) === url)) continue
    if (form.links.length >= 50) break
    form.links.push({ title: (l.title || urlDomain(url)).slice(0, 120), url })
  }
}

const validFormLinks = () =>
  form.links
    .map(l => ({ title: l.title.trim(), url: normalizeExternalUrl(l.url.trim()) }))
    .filter(l => l.title && isHttpUrl(l.url))

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    syncLinksFromContent()
    await $fetch(`/api/courses/${slug.value}/topics/${materialSlug.value}`, {
      method: 'PATCH',
      body: { title: form.title, content: form.content, links: validFormLinks() },
    })
    editing.value = false
    savedSnapshot.value = ''
    await refresh()
  } catch (e) {
    saveError.value = errText(e, 'Не удалось сохранить тему')
  } finally {
    saving.value = false
  }
}

const deleting = ref(false)

const deleteOpen = ref(false)

async function confirmRemoveMaterial() {
  deleteOpen.value = false
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

async function uploadAttachment(file: File): Promise<boolean> {
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
    return true
  } catch (e) {
    uploadError.value = errText(e, 'Не удалось загрузить файл')
    return false
  } finally {
    uploadBusy.value = false
  }
}

/** Файлы, брошенные на редактор из ОС: грузим во вложения, вернём имена для вставки в текст. */
async function uploadOsFiles(files: File[]): Promise<string[]> {
  const names: string[] = []
  for (const f of files) {
    if (await uploadAttachment(f)) names.push(f.name)
  }
  return names
}

/** Выделить место в редакторе (для подсветки ссылки на файл). */
function highlightInEditor(index: number, length: number) {
  const view = topicEditor.value?.getEditorView?.()
  if (!view) return
  view.dispatch({ selection: { anchor: index, head: index + length }, scrollIntoView: true })
  view.focus()
}

async function removeAttachment(name: string) {
  uploadError.value = ''
  // файл упоминается в тексте — не даём удалить «молча», показываем место
  const refs = attachmentRefMatches(form.content, name)
  if (refs.length) {
    uploadError.value = `Файл «${name}» используется в тексте (${refs.length} раз). Сначала уберите ссылки на него.`
    highlightInEditor(refs[0].index, refs[0].length)
    return
  }
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

/** Соседние файлы темы для навигации в модалке предпросмотра. */
const topicFiles = computed(() =>
  (docPayload.value?.attachments ?? []).map(n => ({ name: n, url: attachmentUrl(n) })),
)

const fmtDate = (iso: string) => new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div v-if="material" class="course-page">
  <div class="course-content">
    <header v-if="!editing" class="page-head topic-hero">
      <div class="topic-hero-text">
        <h1 class="page-title">{{ material.title }}</h1>
        <p class="muted topic-meta">Конспект · обновлён {{ fmtDate(material.updatedAt) }}</p>
      </div>
      <div v-if="!editing && canEdit" class="page-actions">
        <span class="tip">
          <button class="icon-btn" aria-label="Редактировать тему" @click="startEdit">
            <Icon name="lucide:pencil" />
          </button>
          <span class="tip-body">Редактировать</span>
        </span>
        <span class="tip">
          <button class="icon-btn danger" aria-label="Удалить тему" :disabled="deleting" @click="deleteOpen = true">
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
        <MdBody :html="material.html" :files="topicFiles" />

        <div v-if="docPayload.attachments.length" style="margin-top: 26px; border-top: 1px solid var(--line); padding-top: 14px;">
          <h2>Вложения</h2>
          <FileChips :files="docPayload.attachments" :href-for="attachmentUrl" />
        </div>

        <LinkList
          v-if="docPayload.links.length"
          :links="docPayload.links"
          :course="slug"
          :entity="`topic:${material.id}`"
          :show-stats="canEdit"
        />
      </div>
    </div>

    <!-- Редактирование -->
    <div v-if="editing" style="margin-top: 14px;">
      <div>
        <h2 style="margin: 0 0 10px;">Редактирование темы</h2>
        <label>
          Название
          <input v-model="form.title">
        </label>
        <div
          class="md-editor-wrap"
          style="margin-top: 10px;"
          @dragover="topicDrop.onDragover"
          @dragleave="topicDrop.onDragleave"
          @drop="topicDrop.onDrop"
        >
          <MdEditor
            id="klassroom-material-editor"
            ref="topicEditor"
            v-model="form.content"
            language="en-US"
            :toolbars="MD_TOOLBARS"
          />
        </div>
        <div v-if="canEdit" style="margin-top: 14px;">
          <h3 style="margin-bottom: 6px;">Вложения</h3>
          <p class="muted" style="margin: 0 0 6px; line-height: 1.5;">
            Файл можно перетащить прямо в текст — вставится markdown-ссылка.
            В тексте: <code>![подпись](имя-файла.png)</code> — встроенная картинка,
            <code>[имя-файла.pdf](имя-файла.pdf)</code> — ссылка на файл (клик открывает предпросмотр).
            Удалить файл, который упоминается в тексте, нельзя — сначала уберите ссылки на него.
          </p>
          <AttachmentField
            :items="docPayload?.attachments ?? []"
            :busy="uploadBusy"
            :link-for="attachmentUrl"
            draggable
            @upload="uploadAttachment"
            @remove="removeAttachment"
          />
          <p v-if="uploadError" class="error">{{ uploadError }}</p>
        </div>
        <div style="margin-top: 14px;">
          <h3 style="margin-bottom: 6px;">Ссылки</h3>
          <LinksField v-model="form.links" :content="form.content" :highlight="highlightInEditor" />
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

  <ConfirmModal
    v-if="deleteOpen"
    title="Удалить тему?"
    message="Тема будет удалена вместе со всеми вложениями. Восстановить можно только из git-журнала."
    confirm-label="Удалить"
    danger
    @confirm="confirmRemoveMaterial"
    @cancel="deleteOpen = false"
  />
  <ConfirmModal
    v-if="leaveConfirmOpen"
    title="Несохранённые изменения"
    message="Тема не сохранена. Уйти без сохранения?"
    confirm-label="Уйти без сохранения"
    danger
    @confirm="answerLeave(true)"
    @cancel="answerLeave(false)"
  />
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
