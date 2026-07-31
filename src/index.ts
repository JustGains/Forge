/**
 * Forge: the public surface.
 *
 * Most integrations need exactly three things:
 *   1. `generateForgeWorkout` (product policies on, honest notices) or the
 *      raw `generateOptimDemo` (byte-faithful recovered Fitbod behavior).
 *   2. `buildWorkoutDataFromOptim` to turn a result into editable workout rows.
 *   3. Your own exercise catalog, shaped like `ExerciseListItem[]`.
 *
 * See examples/generate.ts for a complete, runnable walkthrough.
 */
export * from './shared/optim/index.ts'

export {
  generateOptimUserWorkout as generateForgeWorkout,
} from './shared/optim/optimWorkoutNotices.ts'

export type {
  ExerciseListItem,
  ExerciseSet,
  Measurement,
  Workout,
  WorkoutData,
} from './shared/api/index.ts'

export {
  computeMuscleUsage,
  emptyMuscleUsageCounts,
  getExerciseBuckets,
  MUSCLE_BUCKETS,
  type MuscleBucketKey,
  type MuscleUsageStats,
} from './shared/utils/muscleUsage.ts'
