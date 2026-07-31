import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'
import type { Workout } from '@justgains/shared/src/api/types/Workout'
import { getMuscleMuscleGroup } from '@justgains/shared/src/demo-data/MuscleGroupData'

/**
 * Offline muscle-usage aggregation for the profile radar chart.
 *
 * Counts completed *working* sets (warmups excluded) per high-level muscle
 * bucket over rolling time windows, attributing each set to the muscle groups
 * its exercise primarily trains. Everything here is pure and runs on local
 * WatermelonDB data — no API involvement.
 */

export type MuscleBucketKey =
  | 'chest'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'core'
  | 'back'

/**
 * Display order around the radar, clockwise from the top. Chosen so the web is
 * visually balanced: chest top, legs bottom, push (shoulders/arms) down the
 * right, back/core down the left.
 */
export const MUSCLE_BUCKETS: { key: MuscleBucketKey; label: string }[] = [
  { key: 'chest', label: 'Chest' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'arms', label: 'Arms' },
  { key: 'legs', label: 'Legs' },
  { key: 'core', label: 'Core' },
  { key: 'back', label: 'Back' },
]

export type MuscleUsageCounts = Record<MuscleBucketKey, number>

export type MuscleUsageWindowKey = '7d' | '30d' | '6m'

export const MUSCLE_USAGE_WINDOWS: { key: MuscleUsageWindowKey; days: number }[] = [
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
  { key: '6m', days: 180 },
]

export type MuscleUsageStats = Record<MuscleUsageWindowKey, MuscleUsageCounts>

/**
 * Maps a muscle *subgroup* code (what `getMuscleMuscleGroup` resolves to) onto
 * one of the six radar buckets. Subgroups not listed here (neck, etc.) are
 * intentionally ignored — they aren't part of the headline groups the radar
 * tracks.
 */
const SUBGROUP_TO_BUCKET: Record<string, MuscleBucketKey> = {
  CHEST: 'chest',
  SHOULDERS: 'shoulders',
  BICEPS: 'arms',
  TRICEPS: 'arms',
  FOREARMS: 'arms',
  QUADS: 'legs',
  HAMSTRINGS: 'legs',
  GLUTES_AND_HIPS: 'legs',
  CALVES_SHINS: 'legs',
  HIP_ABDUCTORS: 'legs',
  HIP_ADDUCTORS: 'legs',
  CORE: 'core',
  BACK: 'back',
  LOWER_BACK: 'back',
  TRAPEZIUS: 'back',
}

export function getMuscleBucket(muscleCode: string | null | undefined): MuscleBucketKey | undefined {
  if (!muscleCode) return undefined
  const subgroup = getMuscleMuscleGroup(muscleCode)
  return subgroup ? SUBGROUP_TO_BUCKET[subgroup.muscleGroupCode] : undefined
}

export function emptyMuscleUsageCounts(): MuscleUsageCounts {
  return { chest: 0, shoulders: 0, arms: 0, legs: 0, core: 0, back: 0 }
}

/**
 * The set of buckets an exercise should credit a set toward. Uses the primary
 * movers; if the exercise flags none as primary, falls back to its single
 * highest-effort muscle so the set still lands somewhere sensible.
 */
export function getExerciseBuckets(
  exercise: ExerciseListItem | null | undefined,
): Set<MuscleBucketKey> {
  const buckets = new Set<MuscleBucketKey>()
  const muscles = exercise?.exerciseMuscles ?? []
  if (muscles.length === 0) return buckets

  let source = muscles.filter((m) => m.isPrimary)
  if (source.length === 0) {
    const top = muscles.reduce((best, m) =>
      (m.targetPercentage ?? 0) > (best.targetPercentage ?? 0) ? m : best,
    )
    source = [top]
  }

  for (const muscle of source) {
    const bucket = getMuscleBucket(muscle.muscleCode)
    if (bucket) buckets.add(bucket)
  }
  return buckets
}

/** Completed working sets (warmups excluded) in a single logged exercise. */
function countWorkingSets(sets: { setCompleted?: boolean; setType?: string | null }[] | undefined): number {
  if (!sets) return 0
  let count = 0
  for (const set of sets) {
    if (set.setCompleted && set.setType !== 'warmup') count++
  }
  return count
}

/**
 * Aggregate completed-workout set volume per muscle bucket across the rolling
 * windows. `exerciseBuckets` is a code → buckets lookup built once from the
 * local exercise catalog so we don't re-resolve muscle groups per set.
 */
export function computeMuscleUsage(
  workouts: Workout[],
  exerciseBuckets: Map<string, Set<MuscleBucketKey>>,
  now: number,
): MuscleUsageStats {
  const stats: MuscleUsageStats = {
    '7d': emptyMuscleUsageCounts(),
    '30d': emptyMuscleUsageCounts(),
    '6m': emptyMuscleUsageCounts(),
  }
  const cutoffs = MUSCLE_USAGE_WINDOWS.map((w) => ({
    key: w.key,
    cutoff: now - w.days * 24 * 60 * 60 * 1000,
  }))

  for (const workout of workouts) {
    const endedAtRaw = workout.workoutLogEndedAt
    if (!endedAtRaw) continue
    const endedAt = new Date(endedAtRaw).getTime()
    if (!Number.isFinite(endedAt)) continue

    // Which windows does this workout fall into? (windows are nested)
    const windows = cutoffs.filter((c) => endedAt >= c.cutoff)
    if (windows.length === 0) continue

    for (const data of workout.workoutData ?? []) {
      const code = (data.exerciseCode ?? '').trim().toUpperCase()
      if (!code) continue
      const buckets = exerciseBuckets.get(code)
      if (!buckets || buckets.size === 0) continue
      const sets = countWorkingSets(data.exerciseData)
      if (sets === 0) continue

      for (const { key } of windows) {
        for (const bucket of buckets) {
          stats[key][bucket] += sets
        }
      }
    }
  }

  return stats
}

/** Largest bucket value — used to normalise the radar to its own scale. */
export function maxCount(counts: MuscleUsageCounts): number {
  return Math.max(...MUSCLE_BUCKETS.map((b) => counts[b.key]))
}

/** One exercise's contribution to a distribution: its code and how many sets it carries. */
export type ExerciseSetCount = { exerciseCode: string; setCount: number }

/**
 * Muscle-bucket distribution for a single workout or whole program, by *planned*
 * working-set volume. Each exercise credits its set count to every bucket its
 * primary movers train (same attribution as the profile radar via
 * {@link getExerciseBuckets}); this is volume, not recovery, so set completion
 * is irrelevant and templates count exactly like logs.
 *
 * Pure: the caller resolves `exerciseBuckets` once from the local catalog and
 * normalises set counts (warmups already excluded). Mirrors
 * {@link computeMuscleUsage} but without the time-window dimension.
 */
export function computeMuscleDistribution(
  items: ExerciseSetCount[],
  exerciseBuckets: Map<string, Set<MuscleBucketKey>>,
): MuscleUsageCounts {
  const counts = emptyMuscleUsageCounts()
  for (const { exerciseCode, setCount } of items) {
    if (setCount <= 0) continue
    const buckets = exerciseBuckets.get(exerciseCode.trim().toUpperCase())
    if (!buckets || buckets.size === 0) continue
    for (const bucket of buckets) counts[bucket] += setCount
  }
  return counts
}
