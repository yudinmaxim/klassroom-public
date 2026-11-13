<script setup lang="ts">
/**
 * Единый блок «Приложить файл»: скрытый input + кнопка + список
 * вложений со ссылками (linkFor) и удалением. Загрузку/удаление
 * реализует родитель — эндпоинты разные у тем и сдач.
 */
defineProps<{
  items: string[]
  busy?: boolean
  disabled?: boolean
  /** URL для скачивания/открытия; без него — просто текст */
  linkFor?: (name: string) => string
  /** Текст кнопки (по умолчанию «Приложить файл») */
  label?: string
  /** primary-стиль кнопки — для главного действия (сдача ответа) */
  primary?: boolean
  /** false — только список без кнопки загрузки (просмотр чужой сдачи) */
  uploadable?: boolean
}>()

const emit = defineEmits<{
  upload: [file: File]
  remove: [name: string]
}>()

const input = ref<HTMLInputElement | null>(null)

function pick() {
  input.value?.click()
}
function onChange(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (file) emit('upload', file)
}
</script>

<template>
  <div>
    <input ref="input" type="file" hidden :disabled="disabled" @change="onChange">
    <button
      v-if="uploadable !== false"
      :class="primary ? 'primary' : 'small'"
      :disabled="busy || disabled"
      @click="pick"
    >
      {{ busy ? 'Загрузка…' : (label ?? 'Приложить файл') }}
    </button>
    <ul v-if="items.length" style="margin-top: 8px;">
      <li v-for="name in items" :key="name" class="row" style="gap: 8px;">
        <a v-if="linkFor" :href="linkFor(name)" target="_blank">{{ name }}</a>
        <template v-else>{{ name }}</template>
        <button class="small" @click="emit('remove', name)">удалить</button>
      </li>
    </ul>
  </div>
</template>
