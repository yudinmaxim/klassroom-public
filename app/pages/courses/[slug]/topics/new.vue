<script setup lang="ts">
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data: coursePageData } = useCourseContext()
if (!coursePageData.value?.canMaterials) {
  throw createError({ statusCode: 403, message: 'Нет доступа', fatal: true })
}

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const courseTitle = coursePageData.value?.course?.title ?? slug.value
  crumbs.value = [
    { label: 'Курсы', to: '/courses' },
    { label: courseTitle, to: `/courses/${slug.value}` },
    { label: 'Новая тема' },
  ]
})

const form = reactive({ title: '', content: '' })

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
const uploadError = ref('')
const uploadBusy = ref(false)
/** Вложения доступны, когда есть название ИЛИ тема уже создана лениво. */
const canAttach = computed(() => form.title.trim().length >= 3 || !!createdSlug.value)

async function attachFile(file: File) {
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
  <div class="course-page">
  <div class="course-content">
    <header class="page-head">
      <h1 class="page-title">Новая тема</h1>
    </header>

    <p class="muted">При сохранении или прикреплении файла тема создастся автоматически.</p>

    <div>
      <label>
        Название
        <input v-model="form.title">
      </label>
      <div class="md-editor-wrap" style="margin-top: 10px;">
        <MdEditor
          id="wikiroom-topic-new-editor"
          v-model="form.content"
          language="en-US"
          :toolbars="MD_TOOLBARS"
        />
      </div>
      <div style="margin-top: 12px;" :style="canAttach ? '' : 'opacity: .55'">
        <h3 style="margin-bottom: 6px;">Вложения</h3>
        <p v-if="!canAttach" class="muted" style="margin: 0 0 6px;">
          Для прикрепления файла назовите тему.
        </p>
        <p v-else class="muted" style="margin: 0 0 6px;">
          В тексте: <code>![описание](имя-файла.png)</code> — картинка, <code>[файл](имя-файла.pdf)</code> — ссылка.
          Тема создастся при загрузке.
        </p>
        <AttachmentField
          :items="[]"
          :busy="uploadBusy"
          :disabled="!canAttach"
          @upload="attachFile"
        />
        <p v-if="uploadError" class="error">{{ uploadError }}</p>
      </div>
    </div>


  </div>

  <footer class="page-foot">
    <p v-if="saveError" class="error" style="margin: 0;">{{ saveError }}</p>
    <button class="primary" :disabled="saving || form.title.trim().length < 3" @click="save">
      {{ saving ? 'Сохраняю…' : 'Создать тему' }}
    </button>
    <button @click="navigateTo(`/courses/${slug}`)">Отмена</button>
  </footer>
  </div>
</template>
