<script setup lang="ts">
import type { ExternalLink, LinkStat } from '#shared/types'

/**
 * Блок «Ссылки»: внешние источники темы/задания.
 * Ссылки ведут через /api/.../go — клик записывается, потом 302 на сайт.
 * showStats + entity — статистика переходов для проверяющего.
 */
const props = withDefaults(defineProps<{
  links: ExternalLink[]
  /** slug курса для go-эндпоинта */
  course: string
  /** entity-ключ ('topic:<id>' | 'assign:<id>') для трекинга */
  entity?: string
  /** Показывать статистику переходов (загружается для проверяющих). */
  showStats?: boolean
}>(), { entity: undefined, showStats: false })

const goUrl = (url: string) =>
  `/api/courses/${props.course}/go?to=${encodeURIComponent(url)}&e=${encodeURIComponent(props.entity ?? '')}`

const domain = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// статистика переходов — только когда просят (учитель); 403 → пусто
const stats = ref<LinkStat[]>([])
watchEffect(async () => {
  if (!props.showStats || !props.entity) { stats.value = []; return }
  try {
    const r = await $fetch<{ stats: LinkStat[] }>(
      `/api/courses/${props.course}/link-stats?e=${encodeURIComponent(props.entity)}`,
    )
    stats.value = r.stats
  } catch {
    stats.value = []
  }
})
const statByUrl = computed(() => {
  const map = new Map<string, LinkStat>()
  for (const s of stats.value) map.set(s.url, s)
  return map
})
const statOf = (url: string) => statByUrl.value.get(url)
const statNames = (s?: LinkStat) =>
  s ? s.users.map(u => `${u.pseudonym}${u.count > 1 ? ` ×${u.count}` : ''}`).join(', ') : ''

/** Тултип с полным названием — только когда текст реально обрезан ellipsis. */
function titleTip(e: MouseEvent, full: string) {
  const el = e.currentTarget as HTMLElement
  el.title = el.scrollWidth > el.clientWidth ? full : ''
}
</script>

<template>
  <div v-if="links.length" class="ext-links">
    <a
      v-for="l in links"
      :key="l.url"
      class="ext-link"
      :href="goUrl(l.url)"
      target="_blank"
      rel="noopener noreferrer"
    >
      <Icon name="lucide:external-link" />
      <span class="ext-link-title" @mouseenter="titleTip($event, l.title)">{{ l.title }}</span>
      <span class="ext-link-domain">{{ domain(l.url) }}</span>
      <template v-if="showStats && statOf(l.url)?.users.length">
        <span class="ext-link-stats">· {{ statOf(l.url)!.users.length }}</span>
        <span class="tip">
          <span class="ext-link-info">i</span>
          <span class="tip-body tip-file">{{ statNames(statOf(l.url)) }}</span>
        </span>
      </template>
    </a>
  </div>
</template>

<style scoped>
.ext-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 16px;
}
.ext-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card, #fff);
  color: var(--ink);
  text-decoration: none;
  font-size: 14px;
  max-width: 480px;
}
.ext-link:hover { border-color: var(--accent); }
.ext-link svg { width: 15px; height: 15px; flex: none; color: var(--accent); }
.ext-link-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.ext-link-domain { color: var(--muted); font-size: 12px; flex: none; }
.ext-link-stats { color: var(--muted); font-size: 12px; flex: none; }
.ext-link-info {
  flex: none;
  width: 16px; height: 16px;
  border-radius: 50%;
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
  display: inline-grid;
  place-items: center;
  cursor: default;
}
</style>
