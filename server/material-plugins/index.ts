/**
 * Точка сборки реестра плагинов материалов (specs/04-plugins.md).
 * Новый тип материала = плагин здесь + строка в UI-каталоге пермишенов не нужна.
 */
import { docPlugin } from './doc'
import { getMaterialPlugin, listMaterialTypes } from '../ports/material-plugin'

void docPlugin // регистрация происходит в defineMaterialPlugin при импорте

export { getMaterialPlugin, listMaterialTypes }
