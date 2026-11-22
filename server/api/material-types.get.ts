import { requireUser } from '../lib/validation'
import { listMaterialTypes } from '../material-plugins'

/** Типы материалов из реестра плагинов (для селектора в UI). */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return { types: listMaterialTypes() }
})
