<script setup lang="ts">
import type { SubmissionComment } from '#shared/types'
import { errText } from '#shared/errors'
import { onNotification } from '~/composables/useNotifications'

/**
 * Тред комментариев к сдаче: ученик ↔ проверяющий.
 * HTML комментариев санитизирован на сервере при записи.
 */
const props = defineProps<{ slug: string, aid: string, username: string }>()

const comments = ref<SubmissionComment[]>([])
const text = ref('')
const busy = ref(false)
const error = ref('')

async function load() {
  try {
    comments.value = await $fetch<SubmissionComment[]>(
      `/api/courses/${props.slug}/assignments/${props.aid}/submissions/${props.username}/comments`,
    )
  } catch { /* нет доступа — тред не показываем */ }
}

onMounted(load)
// live-обновление: комментарий по этому курсу/заданию
onNotification((n) => {
  if (n.type === 'comment.created' && n.course === props.slug && n.url?.includes(props.aid)) {
    void load()
  }
})

async function send() {
  if (!text.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(
      `/api/courses/${props.slug}/assignments/${props.aid}/submissions/${props.username}/comments`,
      { method: 'POST', body: { text: text.value } },
    )
    text.value = ''
    await load()
  } catch (e) {
    error.value = errText(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="submission-thread" style="margin-top: 14px;">
    <h3 style="margin: 0 0 8px;">Обсуждение</h3>
    <p v-if="!comments.length" class="muted">Комментариев пока нет.</p>
    <div
      v-for="c in comments"
      :key="c.id"
      class="card"
      style="margin-bottom: 8px; padding: 10px 12px;"
    >
      <p class="muted" style="margin: 0 0 4px; font-size: 12px;">
        {{ c.author }} · {{ new Date(c.createdAt).toLocaleString('ru') }}
      </p>
      <!-- eslint-disable-next-line vue/no-v-html -- html санитизирован на сервере -->
      <div class="md-body" style="font-size: 14px;" v-html="c.html" />
    </div>
    <div class="row" style="gap: 8px; align-items: flex-end;">
      <textarea
        v-model="text"
        rows="2"
        placeholder="Вопрос или комментарий (markdown)…"
        style="flex: 1;"
      />
      <button class="primary" :disabled="busy || !text.trim()" @click="send">
        {{ busy ? '…' : 'Отправить' }}
      </button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
