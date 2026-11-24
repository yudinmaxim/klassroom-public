<script setup lang="ts">
/**
 * Оглавление групп курса — по модели TopicsToc: плавающая панель
 * слева от контента на широких экранах, кнопка на узких.
 */
const props = defineProps<{
  courseSlug: string
  activeGid?: string
}>()

interface GroupItem { id: string, title: string }

const { data } = useLazyFetch<GroupItem[]>(
  `/api/courses/${props.courseSlug}/groups`,
)
const groups = computed(() => data.value ?? [])

const tocOpen = ref(false)
</script>

<template>
  <button
    class="toc-toggle"
    :aria-expanded="tocOpen"
    @click="tocOpen = !tocOpen"
  >
    <Icon name="lucide:list" />
    Группы
    <Icon :name="tocOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'" />
  </button>
  <aside class="toc-panel" :class="{ open: tocOpen }" aria-label="Группы курса">
    <div class="toc-head">Группы</div>
    <nav class="toc-list">
      <NuxtLink
        v-for="g in groups"
        :key="g.id"
        :to="`/courses/${courseSlug}/groups/${g.id}`"
        class="toc-item"
        :class="{ active: g.id === activeGid }"
        :title="g.title"
      >
        {{ g.title }}
      </NuxtLink>
    </nav>
    <p v-if="!groups.length" class="muted toc-empty">Групп пока нет.</p>
  </aside>
</template>

<style scoped>
.toc-toggle {
  display: none;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.toc-toggle svg { width: 15px; height: 15px; }

.toc-panel {
  position: fixed;
  left: 232px;
  top: 88px;
  width: 236px;
  max-height: calc(100vh - 112px);
  display: flex;
  flex-direction: column;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 10px;
  box-shadow: 0 1px 3px rgba(35, 42, 53, 0.05);
  overflow: hidden;
  min-width: 0;
  z-index: 20;
}
.toc-head {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  padding: 2px 8px 8px;
}
.toc-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.toc-item {
  display: block;
  padding: 7px 10px;
  border-radius: 7px;
  color: var(--ink);
  font-size: 14px;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toc-item:hover { background: var(--bg-soft); color: var(--accent); }
.toc-item.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.toc-empty { padding: 4px 8px; margin: 0; font-size: 13px; }

@media (max-width: 1100px) {
  .toc-toggle { display: inline-flex; }
  .toc-panel {
    position: static;
    display: none;
    width: auto;
    top: auto;
    bottom: auto;
    left: auto;
    max-height: none;
    margin-bottom: 12px;
  }
  .toc-panel.open { display: block; }
}
</style>
