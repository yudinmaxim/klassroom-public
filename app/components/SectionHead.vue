<script setup lang="ts">
/** Заголовок секции/карточки: название слева, действия (#actions) справа на одной линии. */
</script>

<template>
  <div class="section-head">
    <h2 class="section-title"><slot /></h2>
    <div v-if="$slots.actions" class="section-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
