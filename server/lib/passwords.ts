import { randomInt } from 'node:crypto'

/**
 * Генератор человекочитаемых паролей вида `lisa-luna-42` (specs/02-data-model.md).
 * Пароль выдаётся один раз при создании/сбросе и передаётся ученику лично;
 * у аккаунта нет персональных данных, поэтому перебор ограничен только
 * rate-limit'ом входа (specs/06-deployment.md).
 */

const WORDS = [
  // звери
  'lisa', 'volk', 'medved', 'zayac', 'baran', 'koza', 'los', 'tiger', 'lev',
  'beaver', 'vydra', 'bobra', 'enot', 'homyak', 'krot', 'ezh', 'barsuk',
  'sova', 'falcon', 'sokol', 'orlan', 'gus', 'lebed', 'grach', 'soroka',
  'delfin', 'kit', 'murena', 'skat', 'osetr', 'sudak', 'eret',
  // природа и явления
  'luna', 'zvezda', 'vector', 'aksion', 'teorem', 'formul', 'ugol', 'gradus',
  'luch', 'ston', 'trop', 'gora', 'oblako', 'tuman', 'dozhd', 'sneg',
  'list', 'vetka', 'koren', 'semya', 'kolos', 'rog', 'klyk', 'tesla',
]

const MIN_NUMBER = 10
const MAX_NUMBER = 99

export function generateReadablePassword(): string {
  const a = WORDS[randomInt(0, WORDS.length)]
  const b = WORDS[randomInt(0, WORDS.length)]
  const n = randomInt(MIN_NUMBER, MAX_NUMBER + 1)
  return `${a}-${b}-${n}`
}
