/**
 * In-memory rate-limit (specs/06-deployment.md). Не пишет IP в логи:
 * счётчики живут только в памяти процесса и умирают при рестарте.
 */
interface Bucket {
  failures: number
  firstFailureAt: number
}

const buckets = new Map<string, Bucket>()

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5

function sweep(): void {
  const now = Date.now()
  for (const [key, b] of buckets) {
    if (now - b.firstFailureAt > WINDOW_MS) buckets.delete(key)
  }
}

export function isRateLimited(key: string): boolean {
  sweep()
  const b = buckets.get(key)
  if (!b) return false
  return b.failures >= MAX_FAILURES && Date.now() - b.firstFailureAt <= WINDOW_MS
}

export function recordFailure(key: string): void {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now - b.firstFailureAt > WINDOW_MS) {
    buckets.set(key, { failures: 1, firstFailureAt: now })
    return
  }
  b.failures += 1
}

export function clearFailures(key: string): void {
  buckets.delete(key)
}
