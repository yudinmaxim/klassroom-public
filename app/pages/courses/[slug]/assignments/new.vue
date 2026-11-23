<script setup lang="ts">
import { errText } from '#shared/errors'
import type { ExternalLink } from '#shared/types'
import { useCourseContext } from '~/composables/useCourseContext'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { useEditorFileDrop, type MdEditorExpose } from '~/composables/useEditorFileDrop'
import { normalizeExternalUrl, isHttpUrl, urlDomain } from '#shared/url'
import { extractExternalLinks } from '~/utils/file-ref'
import { PUBLIC_GROUP } from '#shared/types'

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data: coursePageData } = useCourseContext()
if (!coursePageData.value?.canAssignments) {
  throw createError({ statusCode: 403, message: 'Нет доступа', fatal: true })
}

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const courseTitle = coursePageData.value?.course?.title ?? slug.value
  crumbs.value = [
    { label: 'Курсы', to: '/' },
    { label: courseTitle, to: `/courses/${slug.value}` },
    { label: 'Новое задание' },
  ]
})

const form = reactive({
  title: '',
  due: '',
  maxPoints: null as number | null,
  description: '',
  allowResubmit: true,
  links: [] as ExternalLink[],
  groups: [PUBLIC_GROUP] as string[],
})

const saveError = ref('')
const saving = ref(false)
const canSave = computed(() => form.title.trim().length >= 3)

// drag-and-drop чипов ссылок в редактор описания → markdown-ссылка
const descEditor = ref<MdEditorExpose | null>(null)
const descDrop = useEditorFileDrop(descEditor, () => [])

/** Выделить место в редакторе (для подсветки ссылки при блокировке удаления). */
function highlightInEditor(index: number, length: number) {
  const view = descEditor.value?.getEditorView?.()
  if (!view) return
  view.dispatch({ selection: { anchor: index, head: index + length }, scrollIntoView: true })
  view.focus()
}

/** Ссылки из текста → в блок «Ссылки» (дедуп по url). */
function syncLinksFromContent() {
  for (const l of extractExternalLinks(form.description)) {
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
    const res = await $fetch<{ assignment: { slug: string } }>(
      `/api/courses/${slug.value}/assignments`,
      {
        method: 'POST',
        body: {
          title: form.title,
          due: form.due || null,
          maxPoints: form.maxPoints,
          description: form.description,
          allowResubmit: form.allowResubmit,
          links: validFormLinks(),
          groups: form.groups,
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
  <div class="course-page">
  <div class="course-content">
    <header class="page-head">
      <h1 class="page-title">Новое задание</h1>
    </header>

    <p class="muted">Задание создаётся в статусе «Не выдано» — при выдаче выберете, кому его показать: всем или конкретным ученикам.</p>

    <div class="form">
      <label>
        Название
        <input v-model="form.title">
      </label>
      <div class="row" style="gap: 16px;">
        <label>
          Дата сдачи
          <input v-model="form.due" type="date">
        </label>
        <label>
          Макс. баллов
          <input v-model.number="form.maxPoints" type="number" min="1" max="1000" style="width: 110px;">
        </label>
        <label class="check">
          <input v-model="form.allowResubmit" type="checkbox">
          Разрешить пересдачу
        </label>
      </div>
      <div
        class="md-editor-wrap"
        style="margin-top: 10px;"
        @dragover="descDrop.onDragover"
        @dragleave="descDrop.onDragleave"
        @drop="descDrop.onDrop"
      >
        <MdEditor
          id="klassroom-assignment-new-editor"
          ref="descEditor"
          v-model="form.description"
          language="en-US"
          :toolbars="MD_TOOLBARS"
        />
      </div>
      <div style="margin-top: 14px;">
        <h3 style="margin-bottom: 6px;">Ссылки</h3>
        <LinksField v-model="form.links" :content="form.description" :highlight="highlightInEditor" />
      </div>
      <div style="margin-top: 14px;">
        <GroupField v-model="form.groups" :slug="slug" />
      </div>
    </div>

  </div>

  <footer class="page-foot">
    <p v-if="saveError" class="error" style="margin: 0;">{{ saveError }}</p>
    <button class="primary" :disabled="saving || !canSave" @click="save">
      {{ saving ? 'Создаю…' : 'Создать задание' }}
    </button>
    <button @click="navigateTo(`/courses/${slug}`)">Отмена</button>
  </footer>
  </div>
</template>
