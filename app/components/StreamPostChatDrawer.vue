<script setup lang="ts">
import type { StreamComment } from '#shared/types'
import { errText } from '#shared/errors'
import { onNotification } from '~/composables/useNotifications'
import { useStreamChat } from '~/composables/useStreamChat'

/**
 * Боковая панель-чата по треду поста ленты. Монтируется в app.vue — живёт
 * при навигации и закрывается только явным ×.
 */
const { open, ctx, closeThread } = useStreamChat()

const comments = ref<StreamComment[]>([])
const text = ref('')
const busy = ref(false)
const error = ref('')
const listEl = ref<HTMLElement | null>(null)

async function load() {
  if (!ctx.value) return
  try {
    comments.value = await $fetch<StreamComment[]>(
      `/api/courses/${ctx.value.slug}/stream/${ctx.value.pid}/comments`,
    )
    await nextTick()
    listEl.value?.scrollTo({ top: listEl.value.scrollHeight })
  } catch { comments.value = [] }
}

// перезагрузка при смене контекста и live-событиях по этому треду
watch(() => ctx.value && `${ctx.value.slug}/${ctx.value.pid}`, () => {
  text.value = ''
  error.value = ''
  void load()
})
onNotification((n) => {
  if (!ctx.value || n.type !== 'stream.comment.created') return
  if (n.course === ctx.value.slug && n.url?.includes(`p=${ctx.value.pid}`)) {
    void load()
  }
})

async function send() {
  if (!ctx.value || !text.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(
      `/api/courses/${ctx.value.slug}/stream/${ctx.value.pid}/comments`,
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
        <h2>Обсуждение поста<template v-if="ctx?.label"> — {{ ctx.label }}</template></h2>
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
  position: fixed;
  top: 54px;
  right: 0;
  bottom: 0;
  left: auto;
  z-index: 9;
  margin-left: 0;
  width: min(max(20vw, 380px), calc(100vw - 16px));
  height: auto;
  max-width: 100vw;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.chat-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
.chat-list .md-body {
  overflow-wrap: anywhere;
}
.chat-list .md-body pre {
  overflow-x: auto;
}
</style>
