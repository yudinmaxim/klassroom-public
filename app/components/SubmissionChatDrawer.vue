<script setup lang="ts">
import type { SubmissionComment } from '#shared/types'
import { errText } from '#shared/errors'
import { onNotification } from '~/composables/useNotifications'
import { useSubmissionChat } from '~/composables/useSubmissionChat'

/**
 * Боковая панель-чата по треду сдачи. Монтируется в app.vue — живёт
 * при навигации и закрывается только явным ×.
 */
const { open, ctx, closeThread } = useSubmissionChat()

const comments = ref<SubmissionComment[]>([])
const text = ref('')
const busy = ref(false)
const error = ref('')
const listEl = ref<HTMLElement | null>(null)

async function load() {
  if (!ctx.value) return
  try {
    comments.value = await $fetch<SubmissionComment[]>(
      `/api/courses/${ctx.value.slug}/assignments/${ctx.value.aid}/submissions/${ctx.value.username}/comments`,
    )
    await nextTick()
    listEl.value?.scrollTo({ top: listEl.value.scrollHeight })
  } catch { comments.value = [] }
}

// перезагрузка при смене контекста и live-событиях по этому треду
watch(() => ctx.value && `${ctx.value.slug}/${ctx.value.aid}/${ctx.value.username}`, () => {
  text.value = ''
  error.value = ''
  void load()
})
onNotification((n) => {
  if (!ctx.value || n.type !== 'comment.created') return
  if (n.course === ctx.value.slug && n.username === ctx.value.username && n.url?.includes(ctx.value.aid)) {
    void load()
  }
})

async function send() {
  if (!ctx.value || !text.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(
      `/api/courses/${ctx.value.slug}/assignments/${ctx.value.aid}/submissions/${ctx.value.username}/comments`,
      { method: 'POST', body: { text: text.value } },
    )
    text.value = ''
    await load()
  } catch (e) {
    error.value = errText(e, 'Не удалось отправить')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <aside v-if="open" class="side-panel chat-panel">
      <div class="modal-head">
        <h2>Обсуждение<template v-if="ctx?.label"> — {{ ctx.label }}</template></h2>
        <button class="small" aria-label="Закрыть" @click="closeThread">×</button>
      </div>

      <div ref="listEl" class="chat-list">
        <p v-if="!comments.length" class="muted">Комментариев пока нет — начните обсуждение.</p>
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
      </div>

      <div class="row" style="gap: 8px; align-items: flex-end; margin-top: 10px;">
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
  </aside>
</template>

<style scoped>
.chat-panel {
  /* модельess-панель: без бэкдропа, страница остаётся интерактивной;
     top = высота топбара (10+32+10+border ≈ 53px), чтобы не перекрываться */
  position: fixed;
  top: 54px;
  right: 0;
  bottom: 0;
  z-index: 9;
  margin-left: 0;
  display: flex;
  flex-direction: column;
}
.chat-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
</style>
