/**
 * Pure, RN-free math for client-side workout auto-pause.
 *
 * Auto-pause mirrors the web/API feature: an in-progress workout that sits idle
 * for the user's `autoStopAbandonedWorkouts` window is paused. On mobile the
 * timer is wall-clock based, so a workout left running while the phone is locked
 * would otherwise count the whole idle gap. These helpers freeze the recorded
 * duration at the moment activity stopped (`pauseAt = lastActivity + threshold`)
 * rather than at detection/return time.
 *
 * Kept free of React/React Native imports so it can be unit-tested directly
 * (see the matching `.test.ts`).
 */

/**
 * Minimum threshold (seconds) at which auto-pause is enabled, i.e. 1 minute.
 * A sub-minute timeout would fire mid-set, so anything below this is treated as
 * "off" (and `0`/null is the explicit disabled value the Settings toggle saves).
 * The settings UI only offers 15-minute increments; exactly 1 minute is reachable
 * solely via the admin testing shortcut. (Web disables `<= 60`; we enable at
 * exactly 60 so a 1-minute value is meaningful.)
 */
export const AUTO_PAUSE_MIN_THRESHOLD_SECONDS = 60

/** Whether auto-pause should run for the given per-user threshold (seconds). */
export function isAutoPauseEnabled(
  thresholdSeconds: number | null | undefined,
): boolean {
  return (
    typeof thresholdSeconds === 'number' &&
    Number.isFinite(thresholdSeconds) &&
    thresholdSeconds >= AUTO_PAUSE_MIN_THRESHOLD_SECONDS
  )
}

/**
 * Wall-clock instant (epoch ms) at which an idle workout should auto-pause:
 * the last meaningful activity plus the threshold window.
 */
export function computePauseAtMs(
  lastActivityAtMs: number,
  thresholdSeconds: number,
): number {
  return lastActivityAtMs + thresholdSeconds * 1000
}

/**
 * Has the idle window elapsed by `nowMs`? False (never expired) when the
 * feature is disabled or `lastActivityAtMs` isn't a real timestamp.
 */
export function isAutoPauseExpired(
  nowMs: number,
  lastActivityAtMs: number | null | undefined,
  thresholdSeconds: number | null | undefined,
): boolean {
  if (!isAutoPauseEnabled(thresholdSeconds)) return false
  if (typeof lastActivityAtMs !== 'number' || !Number.isFinite(lastActivityAtMs)) {
    return false
  }
  return nowMs >= computePauseAtMs(lastActivityAtMs, thresholdSeconds as number)
}

export interface RestoreCapInput {
  /** Elapsed seconds captured when the draft was saved (the running base). */
  baseElapsedSeconds: number
  /** Epoch ms the draft was saved at. */
  savedAtMs: number
  /** Epoch ms of the last meaningful activity (may be null on old drafts). */
  lastActivityAtMs: number | null | undefined
  /** Per-user threshold in seconds. */
  thresholdSeconds: number | null | undefined
  /** Current epoch ms. */
  nowMs: number
}

/**
 * Restore math for a draft that was saved while the timer was RUNNING.
 *
 * Normally elapsed grows by `now − savedAt` (the wall clock kept ticking while
 * the app was gone). But if the idle window elapsed during that gap, the
 * workout should have auto-paused at `pauseAt` — so we cap the added time there
 * and report `autoPaused: true`. Added time is clamped to ≥ 0, so a degenerate
 * `pauseAt < savedAt` never trims below the saved elapsed.
 */
export function capRestoredRunningElapsed({
  baseElapsedSeconds,
  savedAtMs,
  lastActivityAtMs,
  thresholdSeconds,
  nowMs,
}: RestoreCapInput): { elapsed: number; autoPaused: boolean } {
  const enabled =
    isAutoPauseEnabled(thresholdSeconds) &&
    typeof lastActivityAtMs === 'number' &&
    Number.isFinite(lastActivityAtMs)

  const pauseAtMs = enabled
    ? computePauseAtMs(lastActivityAtMs as number, thresholdSeconds as number)
    : Number.POSITIVE_INFINITY

  const effectiveNowMs = Math.min(nowMs, pauseAtMs)
  const addedSeconds = Math.max(0, Math.floor((effectiveNowMs - savedAtMs) / 1000))

  return {
    elapsed: baseElapsedSeconds + addedSeconds,
    autoPaused: nowMs >= pauseAtMs,
  }
}
