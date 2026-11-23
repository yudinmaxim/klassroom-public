<script setup lang="ts">
/**
 * Единый блок «Приложить файл»: скрытый input + кнопка + список
 * вложений со ссылками (linkFor) и удалением. Загрузку/удаление
 * реализует родитель — эндпоинты разные у тем и сдач.
 */
const props = withDefaults(defineProps<{
  items: string[]
  busy?: boolean
  disabled?: boolean
  /** URL для скачивания/открытия; без него — просто текст */
  linkFor?: (name: string) => string
  /** false — только список без кнопки загрузки (просмотр чужой сдачи) */
  uploadable?: boolean
  /** Чипы можно перетащить в md-редактор — вставится ссылка на файл. */
  draggable?: boolean
}>(), { uploadable: true, linkFor: undefined, busy: false, disabled: false, draggable: false })

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
    <button v-if="props.uploadable" class="small" :disabled="busy || disabled" @click="pick">
      {{ busy ? 'Загрузка…' : 'Приложить файл' }}
    </button>
    <FileChips
      v-if="items.length"
      :files="items"
      :href-for="linkFor"
      :remove-file="uploadable ? (n: string) => emit('remove', n) : undefined"
      :draggable="draggable"
    />
  </div>
</template>
