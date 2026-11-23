<script setup lang="ts">
import type { StreamPost } from '#shared/types'
import { errText } from '#shared/errors'
import { useCourseContext } from '~/composables/useCourseContext'
import { onNotification } from '~/composables/useNotifications'
import { useStreamChat, streamHasUnread } from '~/composables/useStreamChat'

const { data: coursePageData } = useCourseContext()
const course = computed(() => coursePageData.value?.course ?? null)
const slug = computed(() => course.value?.slug ?? '')

const crumbs = useBreadcrumbs()
watchEffect(() => {
  const c = course.value
  crumbs.value = c
    ? [{ label: 'Курсы', to: '/' }, { label: c.title, to: `/courses/${c.slug}` }]
    : [{ label: 'Курсы', to: '/' }]
})

const posts = ref<StreamPost[]>([])
const error = ref('')
const text = ref('')
const busy = ref(false)

const { openThread } = useStreamChat()

async function load() {
  if (!slug.value) return
  try {
    posts.value = await $fetch<StreamPost[]>(`/api/courses/${slug.value}/stream`)
  } catch (e) {
    error.value = errText(e, 'Не удалось загрузить ленту')
  }
}
watch(slug, () => { void load() }, { immediate: true })

// live-обновление: новый пост или комментарий в этой ленте
onMounted(() => onNotification((n) => {
  if (n.course === slug.value && (n.type === 'stream.posted' || n.type === 'stream.comment.created')) {
    void load()
  }
}))

async function send() {
  if (!slug.value || !text.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/courses/${slug.value}/stream`, {
      method: 'POST',
      body: { text: text.value },
    })
    text.value = ''
    await load()
  } catch (e) {
    error.value = errText(e)
  } finally {
    busy.value = false
  }
}

function openPostChat(p: StreamPost) {
  openThread({
    slug: slug.value,
    pid: p.id,
    label: `${p.author} — ${p.text.slice(0, 40)}${p.text.length > 40 ? '…' : ''}`,
  })
}
</script>

<template>
  <div class="course-page">
    <div class="course-content">
      <div class="card">
        <div class="row" style="gap: 8px; align-items: flex-end;">
          <textarea
            v-model="text"
            rows="2"
            placeholder="Сообщение для курса…"
            style="flex: 1;"
          />
          <button class="primary" :disabled="busy || !text.trim()" @click="send">
            {{ busy ? '…' : 'Отправить' }}
          </button>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <p v-if="!posts.length" class="muted">Пока тихо — первый пост за вами.</p>

      <div
        v-for="p in posts"
        :key="p.id"
        class="card"
        style="margin-bottom: 10px; padding: 12px 14px;"
      >
        <div class="row" style="align-items: center; justify-content: space-between;">
          <p class="muted" style="margin: 0 0 4px; font-size: 12px;">
            {{ p.author }} · {{ new Date(p.createdAt).toLocaleString('ru') }}
          </p>
          <button class="small" @click="openPostChat(p)">
            Обсуждение
            <span
              v-if="streamHasUnread(slug, p.id, p.lastCommentAt)"
              class="unread-dot"
            />
          </button>
        </div>
        <MdBody :html="p.html" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.unread-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  margin-left: 6px;
  vertical-align: middle;
}
</style>
