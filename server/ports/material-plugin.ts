/**
 * Реестр типов материалов (specs/04-plugins.md) — compile-time плагины.
 *
 * Ядро хранилища знает только material.yml (title, type, слаг, время) и
 * каталог content/, целиком принадлежащий плагину типа. Контракт:
 *
 *   - write(dir, input) — провалидировать и записать содержимое в content/
 *     (валидация подтипа — забота плагина, ядро проверяет только общие поля);
 *   - read(dir) — прочитать payload плагина из content/;
 *   - render(payload, ctx) — санитизированный HTML + оглавление.
 */

export interface TocEntry {
  id: string
  text: string
  level: number
}

export interface RenderedMaterial {
  html: string
  toc: TocEntry[]
}

export interface MaterialPlugin {
  type: string
  /** Человекочитаемое название типа (для UI-селектора). */
  title: string
  io: {
    write(dir: string, input: unknown): Promise<void>
    read(dir: string): Promise<unknown>
  }
  render(payload: unknown, ctx: { courseSlug: string, materialSlug: string, trackEntity?: string }): RenderedMaterial
}

const REGISTRY = new Map<string, MaterialPlugin>()

/** Зарегистрировать плагин (вызывается из server/material-plugins/index.ts). */
export function defineMaterialPlugin(plugin: MaterialPlugin): MaterialPlugin {
  if (REGISTRY.has(plugin.type)) {
    throw new Error(`Плагин материала «${plugin.type}» уже зарегистрирован`)
  }
  REGISTRY.set(plugin.type, plugin)
  return plugin
}

/** Плагин по типу материала или null. */
export function getMaterialPlugin(type: string): MaterialPlugin | null {
  return REGISTRY.get(type) ?? null
}

/** Все зарегистрированные типы (для UI-селектора). */
export function listMaterialTypes(): Array<{ type: string, title: string }> {
  return [...REGISTRY.values()].map(p => ({ type: p.type, title: p.title }))
}
