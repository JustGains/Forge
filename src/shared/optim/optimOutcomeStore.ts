import type { WorkoutData } from '@justgains/shared/src/api/types/WorkoutData'

import type {
  OptimDemoInputs,
  OptimDemoResult,
} from './optimDemoEngine'
import { estimateOptimGuidedSessionMinutes } from './optimDurationPolicy'

export const OPTIM_ESTIMATOR_VERSION = 2

const STORAGE_VERSION = 1
const STORAGE_PREFIX = 'optimOutcomes'
const MAX_COMPLETED_RECORDS = 40
const MAX_PENDING_RECORDS = 8
const PENDING_TTL_MS = 21 * 24 * 60 * 60 * 1000
const MIN_USEFUL_DURATION_SECONDS = 60
const MAX_USEFUL_DURATION_SECONDS = 6 * 60 * 60

export type OptimGroupingMode = 'straight' | 'supersets' | 'circuits'
export type OptimDurationSource = 'timer' | 'adjustedTimes' | 'wallClockFallback'

export type OptimPlanAggregates = {
  estimatorVersion: number
  seed: number
  generatedAt: string
  requestedMinutes: number
  rawProjectedMinutes: number
  sessionProjectedMinutes: number
  /** Added in estimator v2. Missing on legacy v1 records. */
  guidedProjectedMinutes?: number
  strengthBudgetMinutes: number | null
  grouping: OptimGroupingMode
  goal: OptimDemoInputs['goal']
  experience: OptimDemoInputs['experience']
  split: OptimDemoInputs['split']
  warmupEnabled: boolean
  cooldownEnabled: boolean
  cardioEnabled: boolean
  generatedStrengthExerciseCount: number
  generatedCoreExerciseCount: number
  generatedCardioExerciseCount: number
  generatedMobilityExerciseCount: number
  generatedCardioSeconds: number
  generatedMobilitySeconds: number
  generatedRepCount: number
  generatedUnilateralRepCount: number
  contentEdited: boolean
  titleEdited: boolean
}

export type OptimStartedShape = {
  exerciseCount: number
  plannedSetCount: number
  repWorkingSetCount: number
  warmupSetCount: number
  timedSetCount: number
  plannedTimedSeconds: number
  plannedRestSeconds: number
  plannedRepCount: number
  plannedRepWorkingCount: number
  /** Added during estimator v2. Missing on earlier stored blueprints. */
  guidedProjectedMinutes?: number
}

export type OptimOutcome = {
  completedAt: string
  durationSeconds: number
  durationSource: OptimDurationSource
  /** True when inactivity auto-paused this session at least once. */
  autoPaused: boolean
  /** Added after v1. True when a user-triggered timer pause was observed. */
  manualPaused?: boolean
  /** Added after v1. False when this device restored an already-started timer. */
  pauseAttributionComplete?: boolean
  finalExerciseCount: number
  finalSetCount: number
  completedSetCount: number
  completedRepWorkingSetCount: number
  completedWarmupSetCount: number
  loggedTimedSeconds: number
  completedRepCount: number
  completedRepWorkingCount: number
  /** Sets with values that finish normalization marked complete. */
  autoCompletedSetCount?: number
  /** Placeholder-only sets finish normalization omitted. */
  removedEmptySetCount?: number
}

export type OptimPlanRecord = {
  workoutId: string
  startedAt: string
  plan: OptimPlanAggregates
  startedShape: OptimStartedShape
  outcome?: OptimOutcome
}

type StoredOptimOutcomes = {
  version: number
  records: OptimPlanRecord[]
}

const VALID_GOALS = new Set<OptimPlanAggregates['goal']>([
  'strength',
  'bodybuilding',
  'general',
  'muscleTone',
  'powerlifting',
  'olympic',
])
const VALID_EXPERIENCE = new Set<OptimPlanAggregates['experience']>([
  'beginner',
  'intermediate',
  'advanced',
])
const VALID_SPLITS = new Set<OptimPlanAggregates['split']>([
  'fresh',
  'fullBody',
  'upper',
  'lower',
  'push',
  'pull',
])
const VALID_GROUPING = new Set<OptimGroupingMode>([
  'straight',
  'supersets',
  'circuits',
])
const VALID_DURATION_SOURCES = new Set<OptimDurationSource>([
  'timer',
  'adjustedTimes',
  'wallClockFallback',
])
const TIMED_MEASUREMENT_CODES = new Set(['DURATION', 'HOLD_DURATION'])

/**
 * Minimal async key/value persistence seam. Mobile injects AsyncStorage; web
 * can inject a localStorage-backed adapter. Kept here so the store logic itself
 * stays platform-free.
 */
export type OptimOutcomeStorage = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

function getStorageKey(userId?: string | null): string {
  return `${STORAGE_PREFIX}:${userId?.trim() || 'anon'}`
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function finiteNumber(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < minimum || value > maximum) return null
  return value
}

function finiteInteger(value: unknown, minimum = 0, maximum = 100_000): number | null {
  const number = finiteNumber(value, minimum, maximum)
  return number == null ? null : Math.floor(number)
}

function measurementNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function measurementCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function isWarmupSet(set: NonNullable<WorkoutData['exerciseData']>[number]): boolean {
  return typeof set.setType === 'string' && set.setType.toLowerCase() === 'warmup'
}

function getSetMeasurementCodes(set: NonNullable<WorkoutData['exerciseData']>[number]): Set<string> {
  return new Set((set.setMeasurements ?? []).map((measurement) => (
    measurementCode(measurement.measurementCode)
  )))
}

function isRepOnlyWorkingSet(set: NonNullable<WorkoutData['exerciseData']>[number]): boolean {
  if (isWarmupSet(set)) return false
  const codes = getSetMeasurementCodes(set)
  return codes.has('REPS') &&
    !codes.has('DURATION') &&
    !codes.has('HOLD_DURATION') &&
    !codes.has('DISTANCE')
}

function sumMeasurement(
  workoutData: WorkoutData[],
  codes: ReadonlySet<string>,
  source: 'planned' | 'logged',
  completedOnly = false,
): number {
  let total = 0
  for (const exercise of workoutData) {
    for (const set of exercise.exerciseData ?? []) {
      if (completedOnly && set.setCompleted !== true) continue
      for (const measurement of set.setMeasurements ?? []) {
        if (!codes.has(measurementCode(measurement.measurementCode))) continue
        const raw = source === 'logged'
          ? measurement.measurementValue
          : measurement.measurementPlaceholder ?? measurement.measurementValue
        const value = measurementNumber(raw)
        if (value != null && value > 0) total += value
      }
    }
  }
  return Math.round(total)
}

function sumReps(
  workoutData: WorkoutData[],
  source: 'planned' | 'logged',
  options: { completedOnly?: boolean; workingOnly?: boolean } = {},
): number {
  let total = 0
  for (const exercise of workoutData) {
    for (const set of exercise.exerciseData ?? []) {
      if (options.completedOnly && set.setCompleted !== true) continue
      if (options.workingOnly && isWarmupSet(set)) continue
      const reps = (set.setMeasurements ?? []).find((measurement) =>
        measurementCode(measurement.measurementCode) === 'REPS')
      const raw = source === 'logged'
        ? reps?.measurementValue
        : reps?.measurementPlaceholder ?? reps?.measurementValue
      const value = measurementNumber(raw)
      if (value != null && value > 0) total += value
    }
  }
  return Math.round(total)
}

type WorkoutSet = NonNullable<WorkoutData['exerciseData']>[number]

function plannedMeasurementValue(
  set: WorkoutSet,
  codes: ReadonlySet<string>,
): number | null {
  for (const measurement of set.setMeasurements ?? []) {
    if (!codes.has(measurementCode(measurement.measurementCode))) continue
    const value = measurementNumber(
      measurement.measurementPlaceholder ?? measurement.measurementValue,
    )
    if (value != null && value > 0) return value
  }
  return null
}

function plannedSetWorkSeconds(set: WorkoutSet): number {
  const timed = plannedMeasurementValue(set, TIMED_MEASUREMENT_CODES)
  if (timed != null) return timed
  return (plannedMeasurementValue(set, new Set(['REPS'])) ?? 0) * 3
}

function plannedSetRestSeconds(set: WorkoutSet): number {
  return plannedMeasurementValue(set, new Set(['REST'])) ?? 0
}

function isFullyTimedWorkoutExercise(exercise: WorkoutData): boolean {
  return (exercise.exerciseData?.length ?? 0) > 0 &&
    (exercise.exerciseData ?? []).every(
      (set) => plannedMeasurementValue(set, TIMED_MEASUREMENT_CODES) != null,
    )
}

function startedGuidedFinalRestExcessSeconds(workoutData: WorkoutData[]): number {
  const intervalGroups = new Map<string, number[]>()
  workoutData.forEach((exercise, index) => {
    if (exercise.exerciseGroupId == null || exercise.exerciseGroupType == null) return
    const groupType = String(exercise.exerciseGroupType).toUpperCase()
    if (!groupType.includes('SUPERSET') && !groupType.includes('CIRCUIT')) return
    const key = `${groupType}:${exercise.exerciseGroupId}`
    intervalGroups.set(key, [...(intervalGroups.get(key) ?? []), index])
  })

  const intervalGroupIndexes = new Set<number>()
  const unguidedFinalRestIndexes = new Set<number>()
  for (const [key, indexes] of intervalGroups) {
    if (
      indexes.length < 2 ||
      !indexes.every((index) => isFullyTimedWorkoutExercise(workoutData[index]!))
    ) continue
    indexes.forEach((index) => intervalGroupIndexes.add(index))
    if (key.startsWith('CIRCUIT:')) {
      unguidedFinalRestIndexes.add(indexes.at(-1)!)
      continue
    }
    const maximumSetCount = Math.max(
      ...indexes.map((index) => workoutData[index]!.exerciseData?.length ?? 0),
    )
    for (let setIndex = maximumSetCount - 1; setIndex >= 0; setIndex -= 1) {
      const terminalIndex = [...indexes].reverse().find(
        (index) => workoutData[index]!.exerciseData?.[setIndex] != null,
      )
      if (terminalIndex != null) {
        unguidedFinalRestIndexes.add(terminalIndex)
        break
      }
    }
  }

  const finalExerciseIndex = workoutData.length - 1
  if (!intervalGroupIndexes.has(finalExerciseIndex)) {
    unguidedFinalRestIndexes.add(finalExerciseIndex)
  }

  return workoutData.reduce((seconds, exercise, index) => {
    if (unguidedFinalRestIndexes.has(index)) return seconds
    const finalSet = exercise.exerciseData?.at(-1)
    return seconds + Math.max(
      (finalSet ? plannedSetRestSeconds(finalSet) : 0) - 30,
      0,
    )
  }, 0)
}

export function estimateOptimStartedGuidedMinutes(workoutData: WorkoutData[]): number {
  const subtotalSeconds = workoutData.reduce((total, exercise) => {
    const sets = exercise.exerciseData ?? []
    const setSeconds = sets.reduce(
      (seconds, set) =>
        seconds + plannedSetWorkSeconds(set) + plannedSetRestSeconds(set),
      0,
    )
    return total + setSeconds - (sets.at(-1) ? plannedSetRestSeconds(sets.at(-1)!) : 0)
  }, 0)
  // Match the generated-plan estimator's established rounding boundary so an
  // untouched plan cannot jump by 0.1 minute when review switches to the
  // editable WorkoutData clock.
  const sessionMinutes = Math.round((
    subtotalSeconds + workoutData.length * 30
  ) / 60 * 10) / 10
  return Math.round((
    sessionMinutes + startedGuidedFinalRestExcessSeconds(workoutData) / 60
  ) * 10) / 10
}

export function buildOptimPlanAggregates(input: {
  result: OptimDemoResult
  inputs: OptimDemoInputs
  grouping: OptimGroupingMode
  seed: number
  contentEdited?: boolean
  titleEdited?: boolean
}): OptimPlanAggregates {
  const estimate = input.result.durationEstimate
  const phaseSeconds = (phase: 'cardio' | 'mobilityWarmup' | 'mobilityCooldown') => (
    input.result.exercises
      .filter((exercise) => exercise.phase === phase)
      .flatMap((exercise) => exercise.sets)
      .reduce((total, set) => total + (set.durationSeconds ?? 0), 0)
  )

  return {
    estimatorVersion: OPTIM_ESTIMATOR_VERSION,
    seed: input.seed,
    generatedAt: input.result.generatedAt,
    requestedMinutes: estimate?.requestedMinutes ?? input.inputs.durationMinutes,
    rawProjectedMinutes: estimate?.projectedMinutes ?? input.inputs.durationMinutes,
    sessionProjectedMinutes: estimate?.sessionProjectedMinutes ??
      estimate?.projectedMinutes ??
      input.inputs.durationMinutes,
    guidedProjectedMinutes: estimateOptimGuidedSessionMinutes(input.result) ??
      estimate?.sessionProjectedMinutes ??
      estimate?.projectedMinutes ??
      input.inputs.durationMinutes,
    strengthBudgetMinutes: estimate?.strengthBudgetMinutes ?? null,
    grouping: input.grouping,
    goal: input.inputs.goal,
    experience: input.inputs.experience,
    split: input.inputs.split,
    warmupEnabled: input.inputs.warmupSetsEnabled,
    cooldownEnabled: input.inputs.mobilityCooldownEnabled,
    cardioEnabled: input.inputs.cardioEnabled,
    generatedStrengthExerciseCount: input.result.counts.generatedStrength,
    generatedCoreExerciseCount: input.result.counts.generatedCore,
    generatedCardioExerciseCount: input.result.counts.generatedCardio,
    generatedMobilityExerciseCount: input.result.counts.generatedMobility,
    generatedCardioSeconds: Math.round(phaseSeconds('cardio')),
    generatedMobilitySeconds: Math.round(
      phaseSeconds('mobilityWarmup') + phaseSeconds('mobilityCooldown'),
    ),
    generatedRepCount: Math.round(input.result.exercises.reduce(
      (total, exercise) =>
        total + exercise.sets.reduce((setTotal, set) => setTotal + (set.reps ?? 0), 0),
      0,
    )),
    generatedUnilateralRepCount: Math.round(input.result.exercises.reduce(
      (total, exercise) => exercise.isUnilateral
        ? total + exercise.sets.reduce((setTotal, set) => setTotal + (set.reps ?? 0), 0)
        : total,
      0,
    )),
    contentEdited: input.contentEdited ?? false,
    titleEdited: input.titleEdited ?? false,
  }
}

export function buildOptimStartedShape(workoutData: WorkoutData[]): OptimStartedShape {
  const sets = workoutData.flatMap((exercise) => exercise.exerciseData ?? [])
  return {
    exerciseCount: workoutData.length,
    plannedSetCount: sets.length,
    repWorkingSetCount: sets.filter(isRepOnlyWorkingSet).length,
    warmupSetCount: sets.filter(isWarmupSet).length,
    timedSetCount: sets.filter((set) => {
      const codes = getSetMeasurementCodes(set)
      return codes.has('DURATION') || codes.has('HOLD_DURATION')
    }).length,
    plannedTimedSeconds: sumMeasurement(workoutData, TIMED_MEASUREMENT_CODES, 'planned'),
    plannedRestSeconds: sumMeasurement(workoutData, new Set(['REST']), 'planned'),
    plannedRepCount: sumReps(workoutData, 'planned'),
    plannedRepWorkingCount: sumReps(workoutData, 'planned', { workingOnly: true }),
    guidedProjectedMinutes: estimateOptimStartedGuidedMinutes(workoutData),
  }
}

export function buildOptimOutcomeFromFinish(input: {
  workoutData: WorkoutData[]
  durationSeconds: number
  durationWasAdjusted: boolean
  completedAt: string
  autoPaused: boolean
  manualPaused: boolean
  pauseAttributionComplete: boolean
  autoCompletedSetCount?: number
  removedEmptySetCount?: number
}): OptimOutcome {
  const sets = input.workoutData.flatMap((exercise) => exercise.exerciseData ?? [])
  const completedSets = sets.filter((set) => set.setCompleted === true)
  const durationSource: OptimDurationSource = input.durationWasAdjusted
    ? 'adjustedTimes'
    : input.durationSeconds > 0
      ? 'timer'
      : 'wallClockFallback'
  return {
    completedAt: input.completedAt,
    durationSeconds: Math.round(input.durationSeconds),
    durationSource,
    autoPaused: input.autoPaused,
    manualPaused: input.manualPaused,
    pauseAttributionComplete: input.pauseAttributionComplete,
    finalExerciseCount: input.workoutData.length,
    finalSetCount: sets.length,
    completedSetCount: completedSets.length,
    completedRepWorkingSetCount: completedSets.filter(isRepOnlyWorkingSet).length,
    completedWarmupSetCount: completedSets.filter(isWarmupSet).length,
    loggedTimedSeconds: sumMeasurement(
      input.workoutData,
      TIMED_MEASUREMENT_CODES,
      'logged',
      true,
    ),
    completedRepCount: sumReps(input.workoutData, 'logged', { completedOnly: true }),
    completedRepWorkingCount: sumReps(input.workoutData, 'logged', {
      completedOnly: true,
      workingOnly: true,
    }),
    ...(input.autoCompletedSetCount == null
      ? {}
      : { autoCompletedSetCount: Math.max(0, Math.floor(input.autoCompletedSetCount)) }),
    ...(input.removedEmptySetCount == null
      ? {}
      : { removedEmptySetCount: Math.max(0, Math.floor(input.removedEmptySetCount)) }),
  }
}

function normalizePlan(value: unknown): OptimPlanAggregates | null {
  if (!value || typeof value !== 'object') return null
  const plan = value as Partial<OptimPlanAggregates>
  const estimatorVersion = finiteInteger(plan.estimatorVersion, 1, 10_000)
  const seed = finiteInteger(plan.seed, 0, Number.MAX_SAFE_INTEGER)
  const requestedMinutes = finiteNumber(plan.requestedMinutes, 1, 24 * 60)
  const rawProjectedMinutes = finiteNumber(plan.rawProjectedMinutes, 0, 24 * 60)
  const sessionProjectedMinutes = finiteNumber(plan.sessionProjectedMinutes, 0, 24 * 60)
  const guidedProjectedMinutes = plan.guidedProjectedMinutes == null
    ? undefined
    : finiteNumber(plan.guidedProjectedMinutes, 0, 24 * 60)
  const strengthBudgetMinutes = plan.strengthBudgetMinutes == null
    ? null
    : finiteNumber(plan.strengthBudgetMinutes, 0, 24 * 60)
  const generatedStrengthExerciseCount = finiteInteger(plan.generatedStrengthExerciseCount)
  const generatedCoreExerciseCount = finiteInteger(plan.generatedCoreExerciseCount)
  const generatedCardioExerciseCount = finiteInteger(plan.generatedCardioExerciseCount)
  const generatedMobilityExerciseCount = finiteInteger(plan.generatedMobilityExerciseCount)
  const generatedCardioSeconds = finiteInteger(plan.generatedCardioSeconds)
  const generatedMobilitySeconds = finiteInteger(plan.generatedMobilitySeconds)
  const generatedRepCount = finiteInteger(plan.generatedRepCount)
  const generatedUnilateralRepCount = finiteInteger(plan.generatedUnilateralRepCount)

  if (
    estimatorVersion == null ||
    seed == null ||
    !isValidTimestamp(plan.generatedAt) ||
    requestedMinutes == null ||
    rawProjectedMinutes == null ||
    sessionProjectedMinutes == null ||
    (plan.guidedProjectedMinutes != null && guidedProjectedMinutes == null) ||
    (plan.strengthBudgetMinutes != null && strengthBudgetMinutes == null) ||
    !VALID_GROUPING.has(plan.grouping as OptimGroupingMode) ||
    !VALID_GOALS.has(plan.goal as OptimPlanAggregates['goal']) ||
    !VALID_EXPERIENCE.has(plan.experience as OptimPlanAggregates['experience']) ||
    !VALID_SPLITS.has(plan.split as OptimPlanAggregates['split']) ||
    typeof plan.warmupEnabled !== 'boolean' ||
    typeof plan.cooldownEnabled !== 'boolean' ||
    typeof plan.cardioEnabled !== 'boolean' ||
    generatedStrengthExerciseCount == null ||
    generatedCoreExerciseCount == null ||
    generatedCardioExerciseCount == null ||
    generatedMobilityExerciseCount == null ||
    generatedCardioSeconds == null ||
    generatedMobilitySeconds == null ||
    generatedRepCount == null ||
    generatedUnilateralRepCount == null ||
    typeof plan.contentEdited !== 'boolean' ||
    typeof plan.titleEdited !== 'boolean'
  ) {
    return null
  }

  return {
    estimatorVersion,
    seed,
    generatedAt: plan.generatedAt,
    requestedMinutes,
    rawProjectedMinutes,
    sessionProjectedMinutes,
    ...(guidedProjectedMinutes == null ? {} : { guidedProjectedMinutes }),
    strengthBudgetMinutes,
    grouping: plan.grouping as OptimGroupingMode,
    goal: plan.goal as OptimPlanAggregates['goal'],
    experience: plan.experience as OptimPlanAggregates['experience'],
    split: plan.split as OptimPlanAggregates['split'],
    warmupEnabled: plan.warmupEnabled,
    cooldownEnabled: plan.cooldownEnabled,
    cardioEnabled: plan.cardioEnabled,
    generatedStrengthExerciseCount,
    generatedCoreExerciseCount,
    generatedCardioExerciseCount,
    generatedMobilityExerciseCount,
    generatedCardioSeconds,
    generatedMobilitySeconds,
    generatedRepCount,
    generatedUnilateralRepCount,
    contentEdited: plan.contentEdited,
    titleEdited: plan.titleEdited,
  }
}

function normalizeStartedShape(value: unknown): OptimStartedShape | null {
  if (!value || typeof value !== 'object') return null
  const shape = value as Partial<OptimStartedShape>
  const normalized = {
    exerciseCount: finiteInteger(shape.exerciseCount),
    plannedSetCount: finiteInteger(shape.plannedSetCount),
    repWorkingSetCount: finiteInteger(shape.repWorkingSetCount),
    warmupSetCount: finiteInteger(shape.warmupSetCount),
    timedSetCount: finiteInteger(shape.timedSetCount),
    plannedTimedSeconds: finiteInteger(shape.plannedTimedSeconds),
    plannedRestSeconds: finiteInteger(shape.plannedRestSeconds),
    plannedRepCount: finiteInteger(shape.plannedRepCount),
    plannedRepWorkingCount: finiteInteger(shape.plannedRepWorkingCount),
  }
  const guidedProjectedMinutes = shape.guidedProjectedMinutes == null
    ? undefined
    : finiteNumber(shape.guidedProjectedMinutes, 0, 24 * 60)
  if (
    Object.values(normalized).some((entry) => entry == null) ||
    (shape.guidedProjectedMinutes != null && guidedProjectedMinutes == null)
  ) return null
  return {
    ...(normalized as OptimStartedShape),
    ...(guidedProjectedMinutes == null ? {} : { guidedProjectedMinutes }),
  }
}

function normalizeOutcome(value: unknown): OptimOutcome | null {
  if (!value || typeof value !== 'object') return null
  const outcome = value as Partial<OptimOutcome>
  const durationSeconds = finiteInteger(
    outcome.durationSeconds,
    MIN_USEFUL_DURATION_SECONDS,
    MAX_USEFUL_DURATION_SECONDS,
  )
  const normalized = {
    finalExerciseCount: finiteInteger(outcome.finalExerciseCount),
    finalSetCount: finiteInteger(outcome.finalSetCount),
    completedSetCount: finiteInteger(outcome.completedSetCount),
    completedRepWorkingSetCount: finiteInteger(outcome.completedRepWorkingSetCount),
    completedWarmupSetCount: finiteInteger(outcome.completedWarmupSetCount),
    loggedTimedSeconds: finiteInteger(outcome.loggedTimedSeconds),
    completedRepCount: finiteInteger(outcome.completedRepCount),
    completedRepWorkingCount: finiteInteger(outcome.completedRepWorkingCount),
  }
  const autoCompletedSetCount = outcome.autoCompletedSetCount == null
    ? undefined
    : finiteInteger(outcome.autoCompletedSetCount)
  const removedEmptySetCount = outcome.removedEmptySetCount == null
    ? undefined
    : finiteInteger(outcome.removedEmptySetCount)
  const manualPaused = outcome.manualPaused == null
    ? undefined
    : outcome.manualPaused
  const pauseAttributionComplete = outcome.pauseAttributionComplete == null
    ? undefined
    : outcome.pauseAttributionComplete
  if (
    !isValidTimestamp(outcome.completedAt) ||
    durationSeconds == null ||
    !VALID_DURATION_SOURCES.has(outcome.durationSource as OptimDurationSource) ||
    typeof outcome.autoPaused !== 'boolean' ||
    (outcome.manualPaused != null && typeof manualPaused !== 'boolean') ||
    (
      outcome.pauseAttributionComplete != null &&
      typeof pauseAttributionComplete !== 'boolean'
    ) ||
    Object.values(normalized).some((entry) => entry == null) ||
    (outcome.autoCompletedSetCount != null && autoCompletedSetCount == null) ||
    (outcome.removedEmptySetCount != null && removedEmptySetCount == null)
  ) {
    return null
  }
  return {
    completedAt: outcome.completedAt,
    durationSeconds,
    durationSource: outcome.durationSource as OptimDurationSource,
    autoPaused: outcome.autoPaused,
    ...(normalized as Omit<
      OptimOutcome,
      'completedAt' | 'durationSeconds' | 'durationSource' | 'autoPaused'
    >),
    ...(autoCompletedSetCount == null ? {} : { autoCompletedSetCount }),
    ...(removedEmptySetCount == null ? {} : { removedEmptySetCount }),
    ...(manualPaused == null ? {} : { manualPaused }),
    ...(pauseAttributionComplete == null ? {} : { pauseAttributionComplete }),
  }
}

function normalizeRecord(value: unknown): OptimPlanRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<OptimPlanRecord>
  const workoutId = typeof record.workoutId === 'string' ? record.workoutId.trim() : ''
  const plan = normalizePlan(record.plan)
  const startedShape = normalizeStartedShape(record.startedShape)
  const outcome = record.outcome == null ? undefined : normalizeOutcome(record.outcome)
  if (
    !workoutId ||
    !isValidTimestamp(record.startedAt) ||
    !plan ||
    !startedShape ||
    (record.outcome != null && !outcome)
  ) {
    return null
  }
  return {
    workoutId,
    startedAt: record.startedAt,
    plan,
    startedShape,
    ...(outcome ? { outcome } : {}),
  }
}

function normalizeRecords(records: unknown, nowMs: number): OptimPlanRecord[] {
  if (!Array.isArray(records)) return []
  const byWorkoutId = new Map<string, OptimPlanRecord>()
  for (const value of records) {
    const record = normalizeRecord(value)
    if (!record) continue
    if (!record.outcome && nowMs - Date.parse(record.startedAt) > PENDING_TTL_MS) continue
    const existing = byWorkoutId.get(record.workoutId)
    if (
      !existing ||
      Number(Boolean(record.outcome)) > Number(Boolean(existing.outcome)) ||
      Date.parse(record.outcome?.completedAt ?? record.startedAt) >
        Date.parse(existing.outcome?.completedAt ?? existing.startedAt)
    ) {
      byWorkoutId.set(record.workoutId, record)
    }
  }
  const recordsByNewest = [...byWorkoutId.values()].sort((left, right) => (
    Date.parse(right.outcome?.completedAt ?? right.startedAt) -
    Date.parse(left.outcome?.completedAt ?? left.startedAt)
  ))
  const completed = recordsByNewest
    .filter((record) => record.outcome)
    .slice(0, MAX_COMPLETED_RECORDS)
  const pending = recordsByNewest
    .filter((record) => !record.outcome)
    .slice(0, MAX_PENDING_RECORDS)
  return [...completed, ...pending].sort((left, right) => (
    Date.parse(right.outcome?.completedAt ?? right.startedAt) -
    Date.parse(left.outcome?.completedAt ?? left.startedAt)
  ))
}

export function createOptimOutcomeStore(storage: OptimOutcomeStorage) {
let operationQueue: Promise<unknown> = Promise.resolve()

async function readRecords(key: string, nowMs: number): Promise<OptimPlanRecord[]> {
  const raw = await storage.getItem(key)
  if (!raw) return []
  let parsed: Partial<StoredOptimOutcomes>
  try {
    parsed = JSON.parse(raw) as Partial<StoredOptimOutcomes>
  } catch {
    return []
  }
  if (parsed.version !== STORAGE_VERSION) return []
  return normalizeRecords(parsed.records, nowMs)
}

async function writeRecords(key: string, records: OptimPlanRecord[]): Promise<void> {
  if (records.length === 0) {
    await storage.removeItem(key)
    return
  }
  const payload: StoredOptimOutcomes = {
    version: STORAGE_VERSION,
    records,
  }
  await storage.setItem(key, JSON.stringify(payload))
}

function serialized<T>(
  operation: () => Promise<T>,
  fallback: T,
  operationName: string,
): Promise<T> {
  const run = operationQueue.then(async () => {
    try {
      return await operation()
    } catch (error) {
      console.warn(`[optimOutcomeStore] ${operationName} failed:`, error)
      return fallback
    }
  })
  operationQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function recordOptimPlanStarted(
  userId: string | null | undefined,
  workoutId: string,
  plan: OptimPlanAggregates,
  startedShape: OptimStartedShape,
  startedAt = new Date().toISOString(),
): Promise<void> {
  const normalizedWorkoutId = workoutId.trim()
  if (!normalizedWorkoutId) return
  const candidate = normalizeRecord({
    workoutId: normalizedWorkoutId,
    startedAt,
    plan,
    startedShape,
  })
  if (!candidate) return
  const key = getStorageKey(userId)
  await serialized(async () => {
    const nowMs = Date.now()
    const current = await readRecords(key, nowMs)
    const existing = current.find((record) => record.workoutId === normalizedWorkoutId)
    if (existing?.outcome) return
    const next = normalizeRecords([
      candidate,
      ...current.filter((record) => record.workoutId !== normalizedWorkoutId),
    ], nowMs)
    await writeRecords(key, next)
  }, undefined, 'record start')
}

async function attachOptimOutcome(
  userId: string | null | undefined,
  workoutId: string,
  outcome: OptimOutcome,
): Promise<boolean> {
  const normalizedWorkoutId = workoutId.trim()
  if (!normalizedWorkoutId) return false
  const key = getStorageKey(userId)
  return serialized(async () => {
    const nowMs = Date.now()
    const current = await readRecords(key, nowMs)
    const index = current.findIndex((record) => record.workoutId === normalizedWorkoutId)
    if (index < 0) {
      await writeRecords(key, current)
      return false
    }
    if (current[index]?.outcome) return true

    const normalizedOutcome = normalizeOutcome(outcome)
    if (!normalizedOutcome || normalizedOutcome.durationSource === 'wallClockFallback') {
      await writeRecords(
        key,
        current.filter((record) => record.workoutId !== normalizedWorkoutId),
      )
      return false
    }

    const next = [...current]
    next[index] = { ...next[index]!, outcome: normalizedOutcome }
    await writeRecords(key, normalizeRecords(next, nowMs))
    return true
  }, false, 'attach outcome')
}

async function readOptimPlanRecords(
  userId?: string | null,
): Promise<OptimPlanRecord[]> {
  const key = getStorageKey(userId)
  return serialized(async () => {
    const records = await readRecords(key, Date.now())
    await writeRecords(key, records)
    return records
  }, [], 'read')
}

async function clearOptimPlanRecords(
  userId?: string | null,
): Promise<void> {
  const key = getStorageKey(userId)
  await serialized(
    () => storage.removeItem(key),
    undefined,
    'clear',
  )
}

return {
  recordOptimPlanStarted,
  attachOptimOutcome,
  readOptimPlanRecords,
  clearOptimPlanRecords,
}
}
