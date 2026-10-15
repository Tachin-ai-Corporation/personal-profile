/**
 * Client telemetry (AD-15, NFR14, PNFR12). The sink is a no-op until a sink
 * with a BAA exists. Payloads are typed with closed unions (Section ids,
 * mapped error codes, numbers, booleans), so no field value, typed code or
 * user id fits. A failing sink never reaches the caller.
 */

import type { SectionId } from "./section-ids"

/**
 * The PHI-free `section_save` codes: `lib/api/errors#mappedErrorCode` results
 * plus the shell's `UNEXPECTED` (a `save()` that threw).
 */
export type TelemetryErrorCode =
  | "FORBIDDEN"
  | "NETWORK_ERROR"
  | "SESSION_EXPIRED"
  | "GENERIC"
  | "FIELD"
  | "MFA_NOT_ENABLED"
  | "TOTP_ALREADY_ENABLED"
  | "NPI_ALREADY_REGISTERED"
  | "UNEXPECTED"

export interface TelemetryEvents {
  readonly section_save: { readonly sectionId: SectionId; readonly ok: boolean; readonly code: TelemetryErrorCode | null }
  readonly save_all: { readonly saved: number; readonly failed: number }
  readonly mfa_link: { readonly ok: boolean; readonly attempt: number }
  /** F4 drafts: draft fields dropped in production (names never sent). */
  readonly draft_fields_dropped: {
    readonly sectionId: SectionId
    readonly count: number
    readonly reason: "denylisted" | "guardOnly" | "nestedDenylisted"
  }
}

export type TelemetryEvent = keyof TelemetryEvents

export type TelemetrySink = <E extends TelemetryEvent>(event: E, payload: TelemetryEvents[E]) => void

const noopSink: TelemetrySink = () => undefined

let sink: TelemetrySink = noopSink

export const telemetry = {
  track<E extends TelemetryEvent>(event: E, payload: TelemetryEvents[E]): void {
    try {
      sink(event, payload)
    } catch {
      // Telemetry must never break a save or a dialog.
    }
  },
} as const

/** Replaces the sink (tests; a future BAA-covered sink). Returns a restore function. */
export function setTelemetrySink(next: TelemetrySink): () => void {
  const previous = sink
  sink = next
  return () => {
    sink = previous
  }
}
