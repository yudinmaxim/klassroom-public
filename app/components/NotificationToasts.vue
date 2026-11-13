<script setup lang="ts">
import type { NotifyPayload } from '#shared/types'
import { useNotifications } from '~/composables/useNotifications'

const { toasts, dismiss } = useNotifications()

const labels: Record<NotifyPayload['type'], string> = {
  'assignment.published': 'Выдано задание',
  'assignment.unpublished': 'Задание снято с выдачи',
  'material.created': 'Новая тема',
  'material.updated': 'Тема обновлена',
  'submission.created': 'Новая сдача',
  'roster.changed': 'Изменён состав курса',
}

function text(n: NotifyPayload): string {
  const base = `${labels[n.type]} «${n.title}»`
  return n.actor ? `${base} — ${n.actor}` : base
}

function open(n: NotifyPayload) {
  dismiss(n)
  void navigateTo(n.url)
}
</script>

<template>
  <div class="toasts" aria-live="polite">
    <button
      v-for="n in toasts"
      :key="`${n.type}-${n.at}-${n.url}`"
      class="toast"
      @click="open(n)"
    >
      <span>{{ text(n) }}</span>
      <span class="toast-close" @click.stop="dismiss(n)">×</span>
    </button>
  </div>
</template>
