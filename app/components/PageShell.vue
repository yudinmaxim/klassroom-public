<script setup lang="ts">
/**
 * Шаблон страницы:
 *  - #title    — заголовок (h1)
 *  - #actions  — действия страницы, прижаты к правому краю заголовка
 *  - default   — тело (карточки, таблицы, вкладки)
 *  - #foot     — футер страницы: «Сохранить»/«Отмена» и т.п.
 *                рендерится, только если передан showFoot или слот есть;
 *                showFoot позволяет скрывать футер по условию (вкладка/режим).
 */
const props = withDefaults(defineProps<{ showFoot?: boolean }>(), { showFoot: undefined })
const slots = useSlots()
const fullWidth = usePageFullWidth()

const footVisible = computed(() => props.showFoot ?? Boolean(slots.foot))
</script>

<template>
  <div class="page" :class="{ 'is-full': fullWidth }">
    <header v-if="slots.title || slots.actions" class="page-head">
      <h1 class="page-title"><slot name="title" /></h1>
      <div v-if="slots.actions" class="page-actions"><slot name="actions" /></div>
    </header>

    <div class="page-body"><slot /></div>

    <footer v-if="footVisible" class="page-foot">
      <slot name="foot" />
    </footer>
  </div>
</template>
