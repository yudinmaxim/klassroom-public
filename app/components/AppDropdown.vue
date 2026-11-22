<script setup lang="ts">
/** Дропдаун: #trigger — кнопка, #menu — пункты (получают close). Закрытие по клику вне. */
const open = ref(false)
function close() {
  open.value = false
}
</script>

<template>
  <div class="dropdown">
    <div class="dropdown-trigger" @click="open = !open">
      <slot name="trigger" :open="open" />
    </div>
    <template v-if="open">
      <div class="dropdown-backdrop" @click="close" />
      <div class="dropdown-menu" role="menu">
        <slot name="menu" :close="close" />
      </div>
    </template>
  </div>
</template>
