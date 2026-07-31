import type {
  ExerciseListItem,
  ExerciseSet,
  Measurement,
  WorkoutData,
} from '@justgains/shared/src/api'
import { getWorkoutMeasurementSchema } from '@justgains/shared/src/utils/workoutMeasurementToggles'
import { isLinkedSetType } from '@justgains/shared/src/utils/workoutSetUtils'
import { capRestoredRunningElapsed } from './autoPause.logic'

const WEIGHT_PER_SIDE_TAG = 'WEIGHT_PER_SIDE'

function isWeightPerSideExercise(exercise: ExerciseListItem): boolean {
  return Boolean(
    exercise.isWeightPerSide ||
      exercise.exerciseTags?.some(
        (tag) => tag?.trim().toUpperCase() === WEIGHT_PER_SIDE_TAG,
      ),
  )
}

/**
 * Get the currently active measurements for an exercise.
 *
 * Derives from exerciseData (the active/toggled-on set) rather than the
 * measurementTemplate — the template is permanent and never shrinks, so
 * reading from it would always show every measurement the exercise has
 * ever had, regardless of toggle state. Template is only consulted to
 * carry forward the preferredUnit for each active code.
 */
export function getUsedMeasurements(opts: {
  workoutData?: WorkoutData
  exercise?: ExerciseListItem
}): Measurement[] {
  const { workoutData, exercise } = opts

  if (workoutData) {
    const seen = new Set<string>()
    const result: Measurement[] = []

    for (const set of workoutData.exerciseData ?? []) {
      for (const m of set.setMeasurements ?? []) {
        const code = m.measurementCode
        if (code && !seen.has(code)) {
          seen.add(code)
          const templateM = workoutData.measurementTemplate?.find(
            (t) => t.measurementCode === code,
          )
          result.push({
            measurementCode: code,
            preferredUnit: templateM?.preferredUnit ?? m.preferredUnit ?? null,
          })
        }
      }
    }

    if (result.length > 0) return result

    // Fall back to schema (template ∪ exerciseData) when no sets yet
    return getWorkoutMeasurementSchema(workoutData).map((x) => ({
      measurementCode: x.measurementCode,
      preferredUnit: x.preferredUnit ?? null,
    }))
  }

  // Outside of a workout: use the exercise's own default measurements
  if (exercise?.exerciseMeasurements) {
    return exercise.exerciseMeasurements.map((measurementCode) => ({
      measurementCode,
      preferredUnit: null,
    }))
  }

  return []
}

/**
 * Create the next set for an exercise (with measurements from the last set)
 */
export function createNextSet(opts: {
  workoutData?: WorkoutData
  exercise?: ExerciseListItem
}): ExerciseSet {
  const measurements = getUsedMeasurements(opts)
  const exerciseData = opts.workoutData?.exerciseData
  const lastSet = exerciseData?.[exerciseData.length - 1]

  const setMeasurements = measurements.map(
    ({ measurementCode, preferredUnit }) => {
      const previousValue =
        lastSet?.setMeasurements?.find(
          (m) => m.measurementCode === measurementCode,
        )?.measurementValue ?? null

      return {
        measurementCode,
        measurementValue: previousValue,
        preferredUnit,
      }
    },
  )

  const inheritedLinkedType = isLinkedSetType(lastSet?.setType)
    ? lastSet?.setType
    : undefined

  return {
    setNumber: (exerciseData?.length ?? 0) + 1,
    ...(inheritedLinkedType && { setType: inheritedLinkedType }),
    setMeasurements,
  }
}

/**
 * Create a WorkoutData entry from an ExerciseListItem
 */
export function createWorkoutData(opts: {
  exercise: ExerciseListItem
  exerciseOrder?: number
  exerciseGroupType?: string
  exerciseGroupId?: number | null
  /**
   * Optional user-set group label (e.g. "Push day warm-up"). When the user
   * replaces an exercise that belongs to a named superset, the replacement
   * must carry the name forward — otherwise `buildGroupedItems` reads the
   * header's `groupName` from the first (now-replaced) member and the
   * custom label silently disappears.
   */
  exerciseGroupName?: string | null
}): WorkoutData {
  const {
    exercise,
    exerciseOrder = 0,
    exerciseGroupType,
    exerciseGroupId,
    exerciseGroupName,
  } = opts

  return {
    exerciseCode: exercise.exerciseCode,
    exerciseName: exercise.exerciseName || exercise.exerciseCode,
    exerciseData: [createNextSet({ exercise })],
    exerciseGroupId: exerciseGroupId ?? null,
    exerciseGroupType: exerciseGroupType as any,
    exerciseGroupName: exerciseGroupName ?? null,
    exerciseThumbnailUrl:
      exercise.exerciseMedia?.[0]?.exerciseVideos?.[0]?.thumbnailMediaAsset?.fileUrl,
    creatorProfileId: exercise.exerciseMedia?.[0]?.creatorProfileId,
    isWeightPerSide: isWeightPerSideExercise(exercise),
    exerciseTypeCode: exercise.exerciseTypeCode ?? null,
    measurementTemplate: getUsedMeasurements({ exercise }),
    exerciseOrder,
  }
}

/**
 * Create multiple WorkoutData entries from selected exercises
 */
export function createWorkoutDataFromExercises(
  exercises: ExerciseListItem[],
  existingWorkoutData: WorkoutData[] = [],
): WorkoutData[] {
  const lastOrder = Math.max(
    -1,
    ...existingWorkoutData.map((x) => x.exerciseOrder ?? -1),
  )

  return exercises.map((exercise, index) =>
    createWorkoutData({
      exercise,
      exerciseOrder: lastOrder + 1 + index,
    }),
  )
}

/**
 * The editable placeholder shown in the workout title field before the user names a
 * workout. It is UI-only and must NEVER be persisted or synced as the real title — a
 * workout with no chosen name is stored blank so every display surface auto-generates
 * a label (see getWorkoutDisplayTitle). The server enforces the same rule
 * (JustGains-API WorkoutTitleHelper).
 */
export const NEW_WORKOUT_TITLE = 'New Workout'

/**
 * Normalize a title for persistence/sync: trim it and treat a blank value or the
 * "New Workout" placeholder as "no title" (undefined), so the placeholder can never
 * be written to the local DB or pushed to the server.
 */
export function normalizeWorkoutTitle(
  title: string | null | undefined,
): string | undefined {
  const trimmed = title?.trim()
  if (!trimmed || trimmed === NEW_WORKOUT_TITLE) return undefined

  return trimmed
}

/**
 * Derive a short fallback title from the first few exercise names.
 */
export function deriveFallbackWorkoutTitle(
  exercises: { exerciseName?: string | null }[] | undefined | null,
): string {
  if (!exercises?.length) return NEW_WORKOUT_TITLE
  return (
    exercises
      .slice(0, 3)
      .map((ex) => ex.exerciseName)
      .filter(Boolean)
      .join(', ') || NEW_WORKOUT_TITLE
  )
}

/**
 * Resolve the timer state to restore from a persisted workout draft.
 *
 * A draft saved while the timer was running stores elapsed as of `savedAt`,
 * but the workout kept running on the wall clock while the app was killed —
 * so restore must add the time since the save and come back still running.
 * Drafts saved paused (or missing the running flag / a parseable savedAt)
 * restore paused at their saved elapsed.
 *
 * Auto-pause: when an `autoPauseThresholdSeconds` is supplied and the away-gap
 * pushed past `lastActivityAt + threshold`, the catch-up is capped at that
 * point and the draft restores auto-paused (so a phone locked overnight doesn't
 * resume reading 8 hours). A draft that was already auto-paused before the kill
 * restores with `autoPaused: true` preserved.
 */
export function resolveRestoredDraftTimer(
  draft: {
    elapsed?: number | null
    isTimerRunning?: boolean
    savedAt?: string | null
    /** ISO of last meaningful activity — anchors the auto-pause cap. */
    lastActivityAt?: string | null
    /** Whether the draft was already auto-paused when saved. */
    workoutLogAutoPaused?: boolean
  },
  opts: {
    /** Fallback when the draft has no elapsed (e.g. server workoutLogDuration). */
    fallbackElapsed?: number | null
    /** The timer can only be running if the workout has a started-at timestamp. */
    hasStartedAt: boolean
    nowMs: number
    /** Per-user auto-pause threshold (seconds); enables the abandoned-gap cap. */
    autoPauseThresholdSeconds?: number | null
  },
): { elapsed: number; isRunning: boolean; autoPaused: boolean } {
  const baseElapsed = draft.elapsed ?? opts.fallbackElapsed ?? 0
  if (!draft.isTimerRunning || !opts.hasStartedAt) {
    return {
      elapsed: baseElapsed,
      isRunning: false,
      autoPaused: draft.workoutLogAutoPaused === true,
    }
  }
  const savedAtMs = draft.savedAt ? Date.parse(draft.savedAt) : Number.NaN
  if (!Number.isFinite(savedAtMs)) {
    return { elapsed: baseElapsed, isRunning: false, autoPaused: false }
  }
  const lastActivityAtMs = draft.lastActivityAt
    ? Date.parse(draft.lastActivityAt)
    : Number.NaN
  const { elapsed, autoPaused } = capRestoredRunningElapsed({
    baseElapsedSeconds: baseElapsed,
    savedAtMs,
    lastActivityAtMs: Number.isFinite(lastActivityAtMs) ? lastActivityAtMs : null,
    thresholdSeconds: opts.autoPauseThresholdSeconds ?? null,
    nowMs: opts.nowMs,
  })
  return { elapsed, isRunning: !autoPaused, autoPaused }
}

/**
 * Whether a workout-shaped object has meaningful data worth persisting
 * (i.e. not just default/empty state).
 */
export function hasMeaningfulWorkoutState(state: {
  workoutLogId?: string | null
  workoutLogStartedAt?: string | null
  exercises?: { length: number }
  workoutTitle?: string | null
}): boolean {
  const trimmedTitle = state.workoutTitle?.trim() ?? ''
  return Boolean(
    state.workoutLogId ||
      state.workoutLogStartedAt ||
      (state.exercises?.length ?? 0) > 0 ||
      (trimmedTitle && trimmedTitle !== NEW_WORKOUT_TITLE),
  )
}
