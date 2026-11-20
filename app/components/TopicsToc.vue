<script setup lang="ts">
/**
 * Оглавление тем курса: на широких экранах — липкая панель слева
 * от колонки контента (.course-page.toc-split), на узких — кнопка.
 */
const props = defineProps<{
  courseSlug: string
  activeSlug?: string
}>()

interface TocMaterial { slug: string, title: string }

const { data } = await useFetch<{ materials: TocMaterial[] }>(
  `/api/courses/${props.courseSlug}/topics`,
)
const materials = computed(() => data.value?.materials ?? [])

const tocOpen = ref(false)
</script>

<template>
  <button
    class="toc-toggle"
    :aria-expanded="tocOpen"
    @click="tocOpen = !tocOpen"
  >
    <Icon name="lucide:list" />
    Оглавление
    <Icon :name="tocOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'" />
  </button>
  <aside class="toc-panel" :class="{ open: tocOpen }" aria-label="Оглавление тем">
    <div class="toc-head">Оглавление</div>
    <nav v-if="materials.length" class="toc-list">
      <NuxtLink
        v-for="m in materials"
        :key="m.slug"
        :to="`/courses/${courseSlug}/topics/${m.slug}`"
        class="toc-item"
        :class="{ active: m.slug === activeSlug }"
      >
        {{ m.title }}
      </NuxtLink>
    </nav>
    <p v-else class="muted toc-empty">Тем пока нет.</p>
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
  position: sticky;
  top: 72px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 10px;
  box-shadow: 0 1px 3px rgba(35, 42, 53, 0.05);
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  min-width: 0;
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
    max-height: none;
    margin-bottom: 12px;
  }
  .toc-panel.open { display: block; }
}
</style>
