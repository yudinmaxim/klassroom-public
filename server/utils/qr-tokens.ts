import type { QrTokenStore } from '../lib/qr-tokens'
import { createQrTokenStore } from '../lib/qr-tokens'
import { resolve } from 'node:path'

/** Точка доступа к хранилищу QR-токенов (автоимпорт Nitro). */
export type { QrTokenStore }

let instance: QrTokenStore | null = null

export function useQrTokens(): QrTokenStore {
  if (!instance) {
    instance = createQrTokenStore(resolve(useRuntimeConfig().qrTokensDir))
  }
  return instance
}
