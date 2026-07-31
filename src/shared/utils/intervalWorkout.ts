import type { ExerciseSet } from '@justgains/shared/src/api/types/ExerciseSet'
import type { Measurement } from '@justgains/shared/src/api/types/Measurement'
import type { WorkoutData } from '@justgains/shared/src/api/types/WorkoutData'
import { isVideoOnlyExerciseType } from '@justgains/shared/src/demo-data/ExerciseTypeData'
import { isCountableWorkoutExercise } from '@justgains/shared/src/enums/WorkoutDataTypes'

export const INTERVAL_DURATION_MEASUREMENT_CODES = ['DURATION', 'HOLD_DURATION'] as const

export type IntervalDurationMeasurementCode =
  (typeof INTERVAL_DURATION_MEASUREMENT_CODES)[number]

export type IntervalOrderMode = 'circuit' | 'superset'
export type IntervalTimerPhase = 'countdown' | 'exercise' | 'rest'

/** Lead-in "get ready" countdown before the first work interval, in seconds. */
export const INTERVAL_COUNTDOWN_SECONDS = 5
/** Accent color for the rest phase (shared by the timer ring and resume bar). */
export const INTERVAL_REST_COLOR = '#3B82F6'

export interface IntervalWorkoutExercise {
  entryKey: string
  exercise: WorkoutData
}

export interface IntervalWorkoutStep {
  id: string
  entryKey: string
  exercise: WorkoutData
  exerciseIndex: number
  setIndex: number
  setNumber: number
  totalSetsForExercise: number
  measurementCode: IntervalDurationMeasurementCode
  targetSeconds: number
  restSeconds: number
}

export interface IntervalWorkoutSave {
  entryKey: string
  setNumber: number
  measurementCode: IntervalDurationMeasurementCode
  elapsedSeconds: number
}

function isDurationMeasurementCode(
  measurementCode: string | null | undefined,
): measurementCode is IntervalDurationMeasurementCode {
  return INTERVAL_DURATION_MEASUREMENT_CODES.includes(
    measurementCode as IntervalDurationMeasurementCode,
  )
}

function toDurationSeconds(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
  }

  return null
}

export function getSetDurationMeasurement(
  set: ExerciseSet | null | undefined,
): Measurement | null {
  const measurements = set?.setMeasurements ?? []
  return measurements.find((measurement) =>
    isDurationMeasurementCode(measurement.measurementCode),
  ) ?? null
}

export function getSetDurationSeconds(
  set: ExerciseSet | null | undefined,
  fallbackSeconds = 30,
): number {
  const durationMeasurement = getSetDurationMeasurement(set)
  return (
    toDurationSeconds(durationMeasurement?.measurementPlaceholder) ??
    toDurationSeconds(durationMeasurement?.measurementValue) ??
    fallbackSeconds
  )
}

export function getSetRestSeconds(
  set: ExerciseSet | null | undefined,
): number {
  const restMeasurement = (set?.setMeasurements ?? []).find(
    (measurement) => measurement.measurementCode === 'REST',
  )

  return (
    toDurationSeconds(restMeasurement?.measurementPlaceholder) ??
    toDurationSeconds(restMeasurement?.measurementValue) ??
    0
  )
}

export function canExerciseRunAsInterval(exercise: WorkoutData): boolean {
  const sets = exercise.exerciseData ?? []
  return sets.length > 0 && sets.every((set) => getSetDurationMeasurement(set) != null)
}

export function canStartIntervalWorkoutGroup(exercises: WorkoutData[]): boolean {
  return exercises.length > 0 && exercises.every(canExerciseRunAsInterval)
}

/**
 * A "video flow" workout plays like a follow-along class: every real exercise
 * is VIDEO_ONLY (duration mirrors the video length), so the whole workout can
 * be run start-to-finish through the interval player instead of set-by-set
 * logging. True when the countable exercises are non-empty and ALL carry the
 * VIDEO_ONLY exercise type.
 */
export function isVideoFlowWorkout(exercises: WorkoutData[]): boolean {
  const countable = exercises.filter(isCountableWorkoutExercise)
  return (
    countable.length > 0 &&
    countable.every((exercise) => isVideoOnlyExerciseType(exercise.exerciseTypeCode))
  )
}

function createIntervalStep(
  item: IntervalWorkoutExercise,
  exerciseIndex: number,
  set: ExerciseSet,
  setIndex: number,
): IntervalWorkoutStep | null {
  const measurement = getSetDurationMeasurement(set)
  if (!measurement || !isDurationMeasurementCode(measurement.measurementCode)) {
    return null
  }

  const setNumber = set.setNumber ?? setIndex + 1
  return {
    id: `${item.entryKey}:${setNumber}:${measurement.measurementCode}`,
    entryKey: item.entryKey,
    exercise: item.exercise,
    exerciseIndex,
    setIndex,
    setNumber,
    totalSetsForExercise: item.exercise.exerciseData?.length ?? 0,
    measurementCode: measurement.measurementCode,
    targetSeconds: getSetDurationSeconds(set),
    restSeconds: getSetRestSeconds(set),
  }
}

export function buildIntervalWorkoutSteps(
  exercises: IntervalWorkoutExercise[],
  mode: IntervalOrderMode,
): IntervalWorkoutStep[] {
  if (mode === 'circuit') {
    return exercises.flatMap((item, exerciseIndex) =>
      (item.exercise.exerciseData ?? [])
        .map((set, setIndex) => createIntervalStep(item, exerciseIndex, set, setIndex))
        .filter((step): step is IntervalWorkoutStep => step != null),
    )
  }

  const maxSets = Math.max(
    0,
    ...exercises.map((item) => item.exercise.exerciseData?.length ?? 0),
  )
  const steps: IntervalWorkoutStep[] = []

  for (let setIndex = 0; setIndex < maxSets; setIndex += 1) {
    exercises.forEach((item, exerciseIndex) => {
      const set = item.exercise.exerciseData?.[setIndex]
      if (!set) return
      const step = createIntervalStep(item, exerciseIndex, set, setIndex)
      if (step) steps.push(step)
    })
  }

  return steps
}

/**
 * The next not-yet-completed step at or after `currentIndex` (wrapping once),
 * or -1 when every step is done. Shared by the screen engine and the headless
 * background engine so collapsed + foreground progression stays identical.
 */
export function findNextOpenIntervalStepIndex(
  steps: IntervalWorkoutStep[],
  currentIndex: number,
  completedStepIds: Set<string>,
): number {
  for (let index = currentIndex + 1; index < steps.length; index += 1) {
    const step = steps[index]
    if (step && !completedStepIds.has(step.id)) return index
  }

  for (let index = 0; index <= currentIndex; index += 1) {
    const step = steps[index]
    if (step && !completedStepIds.has(step.id)) return index
  }

  return -1
}

/**
 * Target duration (seconds) for the given phase — the denominator for the
 * countdown ring and resume-bar progress. Mirrors the inline calculation in
 * IntervalWorkoutScreen so both stay in lockstep.
 */
export function getIntervalPhaseTargetSeconds(
  step: IntervalWorkoutStep | null | undefined,
  phase: IntervalTimerPhase,
): number {
  if (phase === 'countdown') return INTERVAL_COUNTDOWN_SECONDS
  if (phase === 'rest') return Math.max(step?.restSeconds ?? 0, 1)
  return Math.max(step?.targetSeconds ?? 0, 1)
}

/**
 * Open (not-yet-completed) steps in the order the engine will visit them:
 * everything at/after `fromIndex`, then wrapping to anything open before it.
 * Mirrors {@link findNextOpenIntervalStepIndex} so the remaining-time estimate
 * walks the same path the timer will.
 */
function openStepsInPlayOrder(
  steps: IntervalWorkoutStep[],
  fromIndex: number,
  completedStepIds: Set<string>,
): IntervalWorkoutStep[] {
  const ordered: IntervalWorkoutStep[] = []
  for (let index = Math.max(fromIndex, 0); index < steps.length; index += 1) {
    const step = steps[index]
    if (step && !completedStepIds.has(step.id)) ordered.push(step)
  }
  for (let index = 0; index < Math.min(fromIndex, steps.length); index += 1) {
    const step = steps[index]
    if (step && !completedStepIds.has(step.id)) ordered.push(step)
  }
  return ordered
}

/** Work + between-step rest for a queue of upcoming steps (no trailing rest). */
function sumQueueSeconds(queue: IntervalWorkoutStep[]): number {
  return queue.reduce(
    (total, step, index) =>
      total + step.targetSeconds + (index < queue.length - 1 ? step.restSeconds : 0),
    0,
  )
}

export interface IntervalSessionProgress {
  phase: IntervalTimerPhase
  currentIndex: number
  pendingNextIndex: number | null
  completedStepIds: Set<string>
  /** Seconds elapsed within the current phase. */
  phaseElapsedSeconds: number
}

/**
 * Whole-session time remaining (seconds): the rest of the current phase plus
 * every open step still ahead, with rest counted only between steps. This is
 * the "4:32 left" readout — an honest total, not a per-phase one.
 */
export function getIntervalSessionRemainingSeconds(
  steps: IntervalWorkoutStep[],
  progress: IntervalSessionProgress,
): number {
  const { phase, currentIndex, pendingNextIndex, completedStepIds, phaseElapsedSeconds } = progress
  const currentStep = steps[currentIndex] ?? null
  const phaseRemaining = Math.max(
    0,
    getIntervalPhaseTargetSeconds(currentStep, phase) - phaseElapsedSeconds,
  )

  if (phase === 'countdown') {
    return phaseRemaining + sumQueueSeconds(openStepsInPlayOrder(steps, currentIndex, completedStepIds))
  }

  if (phase === 'rest') {
    const queue = openStepsInPlayOrder(steps, pendingNextIndex ?? currentIndex + 1, completedStepIds)
    return phaseRemaining + sumQueueSeconds(queue)
  }

  // exercise: the current step's work counts via phaseRemaining; its rest only
  // applies when something is still ahead of it.
  const upcoming = openStepsInPlayOrder(steps, currentIndex + 1, completedStepIds).filter(
    (step) => step.id !== currentStep?.id,
  )
  const restAfterCurrent = upcoming.length > 0 ? currentStep?.restSeconds ?? 0 : 0
  return phaseRemaining + restAfterCurrent + sumQueueSeconds(upcoming)
}

/** Measurement code reps are logged under — matches the workout table column. */
export const INTERVAL_REPS_MEASUREMENT_CODE = 'REPS'

export interface IntervalWorkoutRepsChange {
  entryKey: string
  setNumber: number
  /** New rep count, or null to clear (e.g. the user scrolled back to 0). */
  reps: number | null
}

function toPositiveReps(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

/**
 * Planned reps for an interval step's set: the logged value if present, else the
 * template placeholder, else null. Used to seed the reps scroller so it opens on
 * the planned target rather than a blank value.
 */
export function getIntervalStepPlannedReps(step: IntervalWorkoutStep): number | null {
  const set = step.exercise.exerciseData?.find(
    (candidate) => (candidate.setNumber ?? 0) === step.setNumber,
  )
  const reps = set?.setMeasurements?.find(
    (measurement) => measurement.measurementCode === INTERVAL_REPS_MEASUREMENT_CODE,
  )
  return toPositiveReps(reps?.measurementValue) ?? toPositiveReps(reps?.measurementPlaceholder)
}

/**
 * Record (or clear) reps performed for one interval set, keeping the REPS
 * *column* consistent across the whole exercise.
 *
 * The REPS column is optional — it only exists while *some* set holds a real
 * value:
 *  - Recording reps (> 0) writes the target set's value AND back-fills an empty
 *    REPS measurement onto every other set, so the workout table renders one
 *    uniform REPS column (never a ragged, partial one).
 *  - Clearing reps (null / 0) blanks the target set's value; if that leaves no
 *    set with a value, the REPS measurement is stripped from every set so the
 *    column disappears entirely rather than lingering empty and unused.
 *
 * DURATION (and any other) measurements and the set's completed flag are left
 * untouched, so this composes safely with the duration save on step completion.
 */
export function setIntervalRepsOnExercise(
  exercise: WorkoutData,
  setNumber: number,
  reps: number | null,
): WorkoutData {
  const sets = exercise.exerciseData ?? []
  const nextReps = toPositiveReps(reps)

  // 1. Write / clear the target set's REPS value (touching that set only).
  const withTarget = sets.map((set) => {
    if ((set.setNumber ?? 0) !== setNumber) return set
    const measurements = set.setMeasurements ?? []
    const hasReps = measurements.some(
      (measurement) => measurement.measurementCode === INTERVAL_REPS_MEASUREMENT_CODE,
    )

    if (nextReps == null) {
      if (!hasReps) return set
      return {
        ...set,
        setMeasurements: measurements.map((measurement) =>
          measurement.measurementCode === INTERVAL_REPS_MEASUREMENT_CODE
            ? { ...measurement, measurementValue: null }
            : measurement,
        ),
      }
    }

    return {
      ...set,
      setMeasurements: hasReps
        ? measurements.map((measurement) =>
            measurement.measurementCode === INTERVAL_REPS_MEASUREMENT_CODE
              ? { ...measurement, measurementValue: nextReps }
              : measurement,
          )
        : [
            ...measurements,
            { measurementCode: INTERVAL_REPS_MEASUREMENT_CODE, measurementValue: nextReps },
          ],
    }
  })

  // 2. The column survives iff some set still holds a real value.
  const anyRepsLogged = withTarget.some((set) =>
    (set.setMeasurements ?? []).some(
      (measurement) =>
        measurement.measurementCode === INTERVAL_REPS_MEASUREMENT_CODE &&
        toPositiveReps(measurement.measurementValue) != null,
    ),
  )

  if (!anyRepsLogged) {
    // Nothing recorded anywhere → drop the (now unused) REPS measurement so the
    // column never lingers. Covers "added on the only set, then removed".
    return {
      ...exercise,
      exerciseData: withTarget.map((set) => {
        const measurements = set.setMeasurements ?? []
        if (
          !measurements.some(
            (measurement) => measurement.measurementCode === INTERVAL_REPS_MEASUREMENT_CODE,
          )
        ) {
          return set
        }
        return {
          ...set,
          setMeasurements: measurements.filter(
            (measurement) => measurement.measurementCode !== INTERVAL_REPS_MEASUREMENT_CODE,
          ),
        }
      }),
    }
  }

  // 3. A value exists → ensure every set carries the REPS column (empty where
  // not recorded) so the workout table renders one uniform column.
  return {
    ...exercise,
    exerciseData: withTarget.map((set) => {
      const measurements = set.setMeasurements ?? []
      if (
        measurements.some(
          (measurement) => measurement.measurementCode === INTERVAL_REPS_MEASUREMENT_CODE,
        )
      ) {
        return set
      }
      return {
        ...set,
        setMeasurements: [
          ...measurements,
          { measurementCode: INTERVAL_REPS_MEASUREMENT_CODE, measurementValue: null },
        ],
      }
    }),
  }
}

export function saveIntervalMeasurementToExercise(
  exercise: WorkoutData,
  save: Omit<IntervalWorkoutSave, 'entryKey'>,
): WorkoutData {
  return {
    ...exercise,
    exerciseData: (exercise.exerciseData ?? []).map((set) => {
      if ((set.setNumber ?? 0) !== save.setNumber) return set

      const measurements = set.setMeasurements ?? []
      const hasMeasurement = measurements.some(
        (measurement) => measurement.measurementCode === save.measurementCode,
      )
      const nextMeasurements = hasMeasurement
        ? measurements.map((measurement) =>
            measurement.measurementCode === save.measurementCode
              ? { ...measurement, measurementValue: save.elapsedSeconds }
              : measurement.measurementValue == null && measurement.measurementPlaceholder != null
                ? { ...measurement, measurementValue: measurement.measurementPlaceholder }
              : measurement,
          )
        : [
            ...measurements,
            {
              measurementCode: save.measurementCode,
              measurementValue: save.elapsedSeconds,
            },
          ]

      return {
        ...set,
        setCompleted: true,
        setMeasurements: nextMeasurements,
      }
    }),
  }
}
