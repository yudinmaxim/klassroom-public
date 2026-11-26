<script setup lang="ts">
/**
 * Прямая ссылка на проверку: рендерим ту же модалку прохождения,
 * что и из блока «Закрепление материала». Закрытие → назад к теме.
 */
const route = useRoute()
const slug = computed(() => String(route.params.course))
const materialId = computed(() => String(route.params.id))
const quizId = computed(() => String(route.params.quiz))
const topicUrl = computed(() => `/courses/${slug.value}/topics/${materialId.value}`)

const crumbs = useBreadcrumbs()
watchEffect(() => {
  crumbs.value = [
    { label: 'Курсы', to: '/' },
    { label: 'Темы', to: `/courses/${slug.value}/topics` },
  ]
})
</script>

<template>
  <QuizRunnerModal
    :slug="slug"
    :material-id="materialId"
    :quiz-id="quizId"
    @close="navigateTo(topicUrl)"
  />
</template>
