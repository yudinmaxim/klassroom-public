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
}>(), { uploadable: true, linkFor: undefined, busy: false, disabled: false })

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
    <ul v-if="items.length" style="margin-top: 8px;">
      <li v-for="name in items" :key="name" class="row" style="gap: 8px;">
        <a v-if="linkFor" :href="linkFor(name)" target="_blank">{{ name }}</a>
        <template v-else>{{ name }}</template>
        <span class="tip">
          <button class="icon-btn danger" :aria-label="`Удалить ${name}`" @click="emit('remove', name)">
            <Icon name="lucide:trash-2" />
          </button>
          <span class="tip-body">Удалить</span>
        </span>
      </li>
    </ul>
  </div>
</template>
