<script setup lang="ts">
import type { QuizAttempt } from '#shared/types'
import { errText } from '#shared/errors'

/** Результаты проверки для учителя: попытки всех учеников. */
const props = defineProps<{ slug: string, materialId: string, quizId: string, title: string }>()
const emit = defineEmits<{ close: [] }>()

const { data, error } = await useFetch<{ attempts: { username: string, attempts: QuizAttempt[] }[] }>(
  () => `/api/courses/${props.slug}/topics/${props.materialId}/quizzes/${props.quizId}/attempts`,
)
const loadError = ref('')
watchEffect(() => {
  if (error.value) loadError.value = errText(error.value, 'Не удалось загрузить результаты')
})

interface Row {
  username: string
  count: number
  best: number
  lastAt: string
  lastScore: number
  total: number
  expanded: boolean
}
const rows = computed<Row[]>(() =>
  (data.value?.attempts ?? []).map(a => {
    const last = a.attempts[a.attempts.length - 1]!
    return {
      username: a.username,
      count: a.attempts.length,
      best: Math.max(...a.attempts.map(x => x.score)),
      lastAt: last.submittedAt,
      lastScore: last.score,
      total: last.total,
      expanded: false,
    }
  }),
)
const byUser = computed(() => new Map((data.value?.attempts ?? []).map(a => [a.username, a.attempts])))

const fmtDate = (iso: string) => new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <BaseModal :title="`Результаты: ${title}`" width="min(720px, 94vw)" height="min(640px, 88vh)" @close="emit('close')">
    <div class="qr-body">
      <p v-if="loadError" class="error">{{ loadError }}</p>
      <p v-else-if="!rows.length" class="muted">Пока никто не проходил проверку.</p>
      <table v-else class="qr-table">
        <thead>
          <tr>
            <th>Ученик</th>
            <th>Попыток</th>
            <th>Лучший</th>
            <th>Последний</th>
            <th>Дата</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in rows" :key="r.username">
            <tr class="qr-row" @click="r.expanded = !r.expanded">
              <td>{{ r.username }}</td>
              <td>{{ r.count }}</td>
              <td>{{ r.best }}/{{ r.total }}</td>
              <td>{{ r.lastScore }}/{{ r.total }}</td>
              <td class="muted">{{ fmtDate(r.lastAt) }}</td>
            </tr>
            <tr v-if="r.expanded">
              <td colspan="5" class="qr-detail">
                <div v-for="(a, i) in byUser.get(r.username)" :key="i" class="qr-attempt">
                  <span>Попытка {{ i + 1 }}: <b>{{ a.score }}/{{ a.total }}</b></span>
                  <span class="muted">{{ fmtDate(a.submittedAt) }}</span>
                  <div v-if="a.results" class="qr-perq">
                    <span
                      v-for="(res, qid) in a.results"
                      :key="qid"
                      class="qr-mark"
                      :class="res.correct ? 'ok' : 'bad'"
                      :title="qid"
                    >{{ res.correct ? '✓' : '✗' }} {{ res.score }}</span>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </BaseModal>
</template>

<style scoped>
.qr-body { overflow-y: auto; padding: 4px; }
.qr-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.qr-table th {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
  font-weight: 600;
}
.qr-table td { padding: 7px 10px; border-bottom: 1px solid var(--line); }
.qr-row { cursor: pointer; }
.qr-row:hover { background: rgba(127, 127, 127, 0.06); }
.qr-detail { background: rgba(127, 127, 127, 0.04); }
.qr-attempt { display: flex; align-items: center; gap: 14px; padding: 4px 0; flex-wrap: wrap; }
.qr-perq { display: flex; gap: 6px; flex-wrap: wrap; }
.qr-mark { font-size: 12px; padding: 1px 7px; border-radius: 8px; }
.qr-mark.ok { background: rgba(60, 160, 80, 0.15); color: #3c8f50; }
.qr-mark.bad { background: rgba(200, 60, 60, 0.12); color: #b04444; }
</style>
