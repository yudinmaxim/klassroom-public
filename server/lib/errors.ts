import type { H3Error } from 'h3'
import { createError } from 'h3'

/** Ошибки домена → HTTP-ответы без утечки внутренних деталей. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }

  toH3(): H3Error {
    return createError({ statusCode: this.status, message: this.message })
  }
}

export function httpError(status: number, message: string): never {
  throw new HttpError(status, message).toH3()
}
