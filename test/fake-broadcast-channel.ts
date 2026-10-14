/**
 * An in-memory `BroadcastChannel` for tests. Every instance is recorded so a
 * test can inspect what a tab posted (`posted`) and simulate a message from
 * another tab (`deliver`). As in browsers, a post never reaches its own sender.
 */
export class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []

  readonly name: string
  readonly posted: unknown[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  closed = false

  constructor(name: string) {
    this.name = name
    FakeBroadcastChannel.instances.push(this)
  }

  postMessage(data: unknown): void {
    if (this.closed) throw new Error("closed")
    this.posted.push(data)
  }

  close(): void {
    this.closed = true
  }

  /** Simulate a message from another tab arriving on this channel. */
  deliver(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent)
  }

  static reset(): void {
    FakeBroadcastChannel.instances = []
  }
}
