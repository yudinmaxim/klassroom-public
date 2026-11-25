<script setup lang="ts">
import { copyText } from '~/utils/clipboard'

/** Блок «секрет показан один раз»: значение + копирование + скрытие. */
const props = defineProps<{ secret: string }>()
const emit = defineEmits<{ hide: [] }>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  if (await copyText(props.secret)) {
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => { copied.value = false }, 1500)
  }
}
</script>

<template>
  <div class="card">
    <h2>Пароль передан один раз — запишите его сейчас</h2>
    <div class="secret">{{ secret }}</div>
    <p class="row" style="margin-top: 10px;">
      <button class="small" @click="copy">
        {{ copied ? 'Скопировано ✓' : 'Скопировать' }}
      </button>
      <button class="small" @click="emit('hide')">Скрыть</button>
    </p>
  </div>
</template>
