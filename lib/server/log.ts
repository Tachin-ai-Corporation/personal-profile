import "server-only"

/**
 * PHI-free server logging (AD-15, D6). A line carries only ids, method,
 * route/upstream template, status/outcome and duration. Never a concrete path,
 * id, query value, token, secret value or body, also under `next dev`.
 */

export interface RequestLogLine {
  readonly requestId: string
  readonly method: string
  /** Route or upstream path template, e.g. `/v2/person/{personId}/ssn/expose`. */
  readonly routeTemplate: string
  readonly status: number
  readonly durationMs: number
  /** Launch only: the outcome code and the detected environment. */
  readonly outcome?: string
  readonly environment?: string
}

export interface ErrorLogLine {
  readonly requestId: string
  readonly routeTemplate: string
  readonly status?: number
  readonly errorName?: string
}

export interface LogSink {
  info(line: string): void
  warn(line: string): void
  error(line: string): void
}

const consoleSink: LogSink = {
  info: (line) => console.info(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
}

let sink: LogSink = consoleSink

/** Test hook: capture log lines. Returns a restore function. */
export function setLogSink(next: LogSink): () => void {
  sink = next
  return () => {
    sink = consoleSink
  }
}

export function logRequest(line: RequestLogLine): void {
  sink.info(JSON.stringify({ kind: "request", ...line }))
}

export function logError(line: ErrorLogLine): void {
  sink.error(JSON.stringify({ kind: "error", ...line }))
}

/** A configuration warning. `message` must never contain a secret value. */
export function logWarning(message: string): void {
  sink.warn(JSON.stringify({ kind: "warning", message }))
}

export function newRequestId(): string {
  return crypto.randomUUID()
}
