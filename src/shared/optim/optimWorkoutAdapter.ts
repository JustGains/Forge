/**
 * Pure adapter from the Optim engine's output (`OptimDemoResult`) to canonical
 * JustGains `WorkoutData[]`, ready for the workout editor and the local-first
 * start path.
 *
 * Invariants this module guarantees (and its tests encode):
 * - Generated numbers are prescriptions, never logged results: every planned
 *   value lands in `measurementPlaceholder`, `measurementValue` stays null and
 *   `setCompleted` false (the blueprint shape `resetWorkoutDataToBlueprint`
 *   produces for template starts).
 * - Engine `superset`/`circuit` groups map to production `SUPERSET`/`CIRCUIT`
 *   and only ship as contiguous 2+ member runs — anything else is ungrouped so
 *   `buildGroupedItems` can never render a split or single-member group.
 * - Exercises missing from the catalog are kept (minimal entry) and reported
 *   in `missingCatalogCodes`, never dropped silently.
 * - A load is never written into `BODYWEIGHT_MINUS_ASSISTANCE` (that value
 *   means assistance, not weight lifted).
 */
import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'
import type { ExerciseSet, Measurement } from '@justgains/shared/src/api'
import type { WorkoutData } from '@justgains/shared/src/api/types/WorkoutData'
import { exerciseGroupTypeEnum } from '@justgains/shared/src/api/types/ExerciseGroupType'

import type {
  OptimDemoExercise,
  OptimDemoResult,
  OptimDemoSet,
} from './optimDemoEngine'
import { createWorkoutData, getUsedMeasurements } from '../utils/workoutHelpers'

export type OptimWorkoutAdapterOutput = {
  workoutData: WorkoutData[]
  /** Optim exercise codes with no catalog row — kept in the output as minimal entries. */
  missingCatalogCodes: string[]
}

function normalizeCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

export function buildCatalogByCode(
  exercises: ExerciseListItem[],
): Map<string, ExerciseListItem> {
  const map = new Map<string, ExerciseListItem>()
  for (const exercise of exercises) {
    const code = normalizeCode(exercise.exerciseCode)
    if (code && !map.has(code)) map.set(code, exercise)
  }
  return map
}

/**
 * Pick the measurement code a planned load (kg) should be written to.
 * `WEIGHT` when the exercise measures it, else `BODYWEIGHT_PLUS_WEIGHT`
 * (weighted bodyweight moves). Never `BODYWEIGHT_MINUS_ASSISTANCE`: on an
 * assisted exercise the number means "assistance", so writing a prescribed
 * load there would invert its meaning — drop the load instead.
 */
function resolveWeightCode(
  catalogMeasurements: string[] | null,
  weightedBodyweight: boolean,
): string | null {
  // The engine's weighted-bodyweight fallback is explicitly extra external
  // load, never the athlete's total bodyweight. Keep that meaning even when a
  // reps-only catalog row has not yet opted into the added-weight measurement.
  if (weightedBodyweight) return 'BODYWEIGHT_PLUS_WEIGHT'
  if (!catalogMeasurements || catalogMeasurements.length === 0) return 'WEIGHT'
  const codes = catalogMeasurements.map(normalizeCode)
  if (codes.includes('WEIGHT')) return 'WEIGHT'
  if (codes.includes('BODYWEIGHT_PLUS_WEIGHT')) return 'BODYWEIGHT_PLUS_WEIGHT'
  if (codes.includes('BODYWEIGHT_MINUS_ASSISTANCE')) return null
  return 'WEIGHT'
}

/** `DURATION` unless the exercise only measures `HOLD_DURATION` (both stay interval-eligible). */
function resolveDurationCode(catalogMeasurements: string[] | null): string {
  const codes = (catalogMeasurements ?? []).map(normalizeCode)
  if (!codes.includes('DURATION') && codes.includes('HOLD_DURATION')) {
    return 'HOLD_DURATION'
  }
  return 'DURATION'
}

function placeholder(measurementCode: string, value: number): Measurement {
  return {
    measurementCode,
    measurementValue: null,
    measurementPlaceholder: value,
    preferredUnit: null,
  }
}

function buildSets(
  exercise: OptimDemoExercise,
  catalogMeasurements: string[] | null,
): ExerciseSet[] {
  const weightCode = resolveWeightCode(
    catalogMeasurements,
    exercise.weightedBodyweight,
  )
  const durationCode = resolveDurationCode(catalogMeasurements)
  // Uniform REST column: if any set prescribes rest, every set carries the
  // REST measurement (0 where absent) so the column renders consistently and
  // the rest timer always finds its value.
  const anyRest = exercise.sets.some((set) => set.restSeconds > 0)

  return exercise.sets.map((set: OptimDemoSet, index) => {
    const measurements: Measurement[] = []
    if (set.reps != null) measurements.push(placeholder('REPS', set.reps))
    if (set.weightKg != null && weightCode) {
      // kg is the storage unit; display conversion happens downstream.
      measurements.push(placeholder(weightCode, set.weightKg))
    }
    if (set.durationSeconds != null) {
      measurements.push(placeholder(durationCode, set.durationSeconds))
    }
    if (set.distanceMeters != null) {
      // Canonical DISTANCE is stored in km (the one intentional unit change).
      measurements.push(placeholder('DISTANCE', set.distanceMeters / 1000))
    }
    if (anyRest) measurements.push(placeholder('REST', set.restSeconds))
    if (set.targetRpe != null) measurements.push(placeholder('RPE', set.targetRpe))

    return {
      setNumber: index + 1,
      ...(set.setType === 'warmup' ? { setType: 'warmup' as const } : {}),
      setCompleted: false,
      setMeasurements: measurements,
    }
  })
}

/** Union of the template's measurement codes and every code the sets actually use. */
function extendTemplate(
  template: Measurement[],
  sets: ExerciseSet[],
): Measurement[] {
  const result = [...template]
  const seen = new Set(result.map((m) => m.measurementCode))
  for (const set of sets) {
    for (const m of set.setMeasurements ?? []) {
      if (!m.measurementCode || seen.has(m.measurementCode)) continue
      seen.add(m.measurementCode)
      result.push({ measurementCode: m.measurementCode, preferredUnit: null })
    }
  }
  return result
}

function mapGroupType(
  groupType: OptimDemoExercise['groupType'],
): string | undefined {
  if (groupType === 'superset') return exerciseGroupTypeEnum.SUPERSET
  if (groupType === 'circuit') return exerciseGroupTypeEnum.CIRCUIT
  return undefined
}

/**
 * Null the group fields on every entry whose group is not a contiguous run of
 * 2+ members. `buildGroupedItems` groups only adjacent rows, so a split run
 * would render duplicate headers, and `normalizeExerciseGroups` cannot repair
 * a 2+2 split — the first contiguous run keeps the group, strays lose it.
 */
function normalizeGroupRuns(workoutData: WorkoutData[]): WorkoutData[] {
  // Identify contiguous runs per group id in array order.
  const keptIndexes = new Set<number>()
  const claimedGroupIds = new Set<number>()
  let runStart = -1
  let runGroupId: number | null = null
  let runGroupType: WorkoutData['exerciseGroupType'] = null

  const closeRun = (endExclusive: number) => {
    if (runGroupId == null || runStart < 0) return
    const runLength = endExclusive - runStart
    if (runLength >= 2 && !claimedGroupIds.has(runGroupId)) {
      claimedGroupIds.add(runGroupId)
      for (let i = runStart; i < endExclusive; i++) keptIndexes.add(i)
    }
  }

  workoutData.forEach((entry, index) => {
    const gid = entry.exerciseGroupId ?? null
    const groupType = entry.exerciseGroupType ?? null
    const validGroupType =
      groupType === exerciseGroupTypeEnum.SUPERSET ||
      groupType === exerciseGroupTypeEnum.CIRCUIT
    const normalizedGroupId = validGroupType ? gid : null
    const normalizedGroupType = normalizedGroupId == null ? null : groupType
    if (
      normalizedGroupId !== runGroupId ||
      normalizedGroupType !== runGroupType
    ) {
      closeRun(index)
      runStart = normalizedGroupId == null ? -1 : index
      runGroupId = normalizedGroupId
      runGroupType = normalizedGroupType
    }
  })
  closeRun(workoutData.length)

  return workoutData.map((entry, index) => {
    const hasCompleteGeneratedGroup =
      entry.exerciseGroupId != null &&
      (entry.exerciseGroupType === exerciseGroupTypeEnum.SUPERSET ||
        entry.exerciseGroupType === exerciseGroupTypeEnum.CIRCUIT)
    if (hasCompleteGeneratedGroup && keptIndexes.has(index)) return entry
    return {
      ...entry,
      exerciseGroupId: null,
      exerciseGroupType: null,
      exerciseGroupName: null,
    }
  })
}

function buildMissingCatalogEntry(
  exercise: OptimDemoExercise,
  index: number,
): WorkoutData {
  const sets = buildSets(exercise, null)
  return {
    exerciseCode: normalizeCode(exercise.code),
    exerciseName: exercise.name || normalizeCode(exercise.code),
    exerciseData: sets,
    exerciseGroupId: exercise.groupId ?? null,
    exerciseGroupType: mapGroupType(exercise.groupType) as WorkoutData['exerciseGroupType'] ?? null,
    exerciseGroupName: null,
    exerciseThumbnailUrl: undefined,
    creatorProfileId: undefined,
    isWeightPerSide: exercise.isWeightPerSide === true,
    exerciseTypeCode: null,
    measurementTemplate: extendTemplate([], sets),
    exerciseOrder: index,
  }
}

/**
 * Map an `OptimDemoResult` onto canonical `WorkoutData[]`, preserving the
 * engine's exercise order. Pure: no I/O, no clock, no randomness.
 */
export function buildWorkoutDataFromOptim(
  result: OptimDemoResult,
  catalogByCode: ReadonlyMap<string, ExerciseListItem>,
): OptimWorkoutAdapterOutput {
  const missingCatalogCodes: string[] = []

  const workoutData = result.exercises.map((exercise, index) => {
    const code = normalizeCode(exercise.code)
    const catalogItem = catalogByCode.get(code)
    if (!catalogItem) {
      missingCatalogCodes.push(code)
      return buildMissingCatalogEntry(exercise, index)
    }

    const entry = createWorkoutData({
      exercise: catalogItem,
      exerciseOrder: index,
      exerciseGroupType: mapGroupType(exercise.groupType),
      exerciseGroupId: exercise.groupId ?? null,
    })
    const sets = buildSets(
      exercise,
      catalogItem.exerciseMeasurements ?? null,
    )
    return {
      ...entry,
      exerciseData: sets,
      measurementTemplate: extendTemplate(
        getUsedMeasurements({ exercise: catalogItem }),
        sets,
      ),
    }
  })

  return {
    workoutData: normalizeGroupRuns(workoutData),
    missingCatalogCodes,
  }
}

/** Highest group id in the adapted data, for seeding an editor's next-group-id counter. */
export function maxExerciseGroupId(workoutData: WorkoutData[]): number {
  return workoutData.reduce(
    (max, entry) => Math.max(max, entry.exerciseGroupId ?? 0),
    0,
  )
}

const TITLE_TAGLINES = [
  'Served Fresh',
  'No Excuses Edition',
  'By the Numbers',
  'On the House',
]

const BUCKET_TITLE_LABELS: Record<string, { fallback: string; translationKey: string }> = {
  chest: { fallback: 'Chest', translationKey: 'Chest (muscle)' },
  back: { fallback: 'Back', translationKey: 'Back (muscle)' },
  shoulders: { fallback: 'Shoulders', translationKey: 'Shoulders (muscle)' },
  arms: { fallback: 'Arms', translationKey: 'Arms (muscle)' },
  legs: { fallback: 'Legs', translationKey: 'Legs (muscle)' },
  core: { fallback: 'Core', translationKey: 'Core (muscle)' },
}

/**
 * A confident, deterministic title for a generated workout, e.g.
 * "Chest & Arms, Served Fresh". Seed picks the tagline so Shuffle
 * rotates the flavor along with the exercises.
 */
export function generateOptimWorkoutTitle(
  result: OptimDemoResult,
  seed: number,
  translate: (key: string) => string = (key) => key,
): string {
  const buckets: Array<{ fallback: string; translationKey: string }> = []
  for (const exercise of result.exercises) {
    if (exercise.phase !== 'strength' && exercise.phase !== 'core') continue
    const bucket = exercise.primaryBucket
      ? BUCKET_TITLE_LABELS[exercise.primaryBucket]
      : null
    if (bucket && !buckets.some(item => item.translationKey === bucket.translationKey)) {
      buckets.push(bucket)
    }
  }
  const localizedBuckets = buckets.map(({ fallback, translationKey }) => {
    const translated = translate(translationKey)
    return translated === translationKey ? fallback : translated
  })
  const focus = buckets.length === 0 || buckets.length > 2
    ? translate('Full Body')
    : buckets.length === 1
      ? localizedBuckets[0]!
      : translate('{first} & {second}')
          .replace('{first}', localizedBuckets[0]!)
          .replace('{second}', localizedBuckets[1]!)
  const tagline = translate(TITLE_TAGLINES[Math.abs(seed) % TITLE_TAGLINES.length]!)
  return translate('{focus}, {tagline}')
    .replace('{focus}', focus)
    .replace('{tagline}', tagline)
}
