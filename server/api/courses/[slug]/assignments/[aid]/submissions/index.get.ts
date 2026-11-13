import { requireUser, courseSlugSchema, assignmentSlugSchema } from '../../../../../../lib/validation'

/** Сдачи по заданию — учителю (submissions.view.all/grade). Имена — псевдонимами. */
export default defineEventHandler(async (event) => {
  const actor = await requireUser(event)
  const slug = courseSlugSchema.parse(getRouterParam(event, 'slug'))
  const aid = assignmentSlugSchema.parse(getRouterParam(event, 'aid'))
  const submissions = await useContentStore().listSubmissions(actor, slug, aid)

  const names: Record<string, string> = {}
  const userStore = useUserStore()
  for (const s of submissions) {
    const u = await userStore.getUser(s.username)
    names[s.username] = u?.pseudonym ?? s.username
  }
  return { submissions, names }
})
