export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  allow(key: string): boolean {
    const fresh = this.fresh(key)
    if (fresh.length >= this.limit) return false
    fresh.push(this.now())
    this.hits.set(key, fresh)
    return true
  }

  blocked(key: string): boolean {
    return this.fresh(key).length >= this.limit
  }

  private fresh(key: string): number[] {
    const t = this.now()
    const bucket = (this.hits.get(key) ?? []).filter((stamp) => t - stamp < this.windowMs)
    this.hits.set(key, bucket)
    return bucket
  }
}
