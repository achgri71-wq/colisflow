/**
 * Sliding-window dedupe: accepts a code only if it was not already
 * accepted within the given window (double trigger / key bounce guard).
 */
export class ScanDeduplicator {
  private readonly windowMs: number
  private readonly lastAccepted = new Map<string, number>()

  constructor(windowMs: number) {
    this.windowMs = windowMs
  }

  accept(code: string): boolean {
    const now = Date.now()
    if (this.lastAccepted.size > 200) {
      const cutoff = now - this.windowMs
      for (const [key, at] of this.lastAccepted) {
        if (at < cutoff) this.lastAccepted.delete(key)
      }
    }
    const previous = this.lastAccepted.get(code)
    if (previous !== undefined && now - previous < this.windowMs) return false
    this.lastAccepted.set(code, now)
    return true
  }
}
