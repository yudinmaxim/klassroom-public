<script setup lang="ts">
/**
 * Квадратная кнопка-иконка с тултипом (.tip/.tip-body).
 * icon — имя иконки вида 'lucide:…'; label — текст тултипа и aria-label.
 */
defineProps<{
  icon: string
  label: string
  danger?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <span class="tip">
    <button
      class="icon-btn"
      :class="{ danger }"
      :disabled="disabled"
      :aria-label="label"
      @click="emit('click')"
    >
      <Icon :name="icon" />
    </button>
    <span class="tip-body">{{ label }}</span>
  </span>
</template>
