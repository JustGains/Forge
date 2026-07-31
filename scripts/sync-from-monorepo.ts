/**
 * Re-sync the vendored engine and its support files from the JustGains
 * monorepo. The alias `@justgains/shared/src/*` maps onto `src/shared/*`
 * here, so files copy over verbatim with no import rewriting.
 *
 *   bun run sync             # copy everything in the manifest
 *   bun run sync -- --check  # list files that differ without copying
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MONOREPO_SHARED = 'J:/justgains/packages/shared/src'
const TARGET_SHARED = join(dirname(fileURLToPath(import.meta.url)), '../src/shared')

/** Whole directories copied as-is. */
const DIRECTORIES = ['optim']

/** Individual files, paths relative to packages/shared/src. */
const FILES = [
  'utils/muscleUsage.ts',
  'utils/WeightConfig.ts',
  'utils/workoutHelpers.ts',
  'utils/exerciseGrouping.ts',
  'utils/intervalWorkout.ts',
  'utils/measurementUtils.ts',
  'utils/plateLoading.ts',
  'utils/workoutMeasurementToggles.ts',
  'utils/workoutSetUtils.ts',
  'utils/autoPause.logic.ts',
  'utils/injuryTracking.ts',
  'demo-data/MuscleGroupData.ts',
  'demo-data/ExerciseTypeData.ts',
  'demo-data/MeasurementData.ts',
  'demo-data/BandOptions.ts',
  'enums/WorkoutDataTypes.ts',
  'api/types/ExerciseListItem.ts',
  'api/types/ExerciseEquipment.ts',
  'api/types/ExerciseMedia.ts',
  'api/types/ExerciseMuscle.ts',
  'api/types/ExerciseOgData.ts',
  'api/types/ExerciseSet.ts',
  'api/types/Measurement.ts',
  'api/types/Workout.ts',
  'api/types/BaseWorkout.ts',
  'api/types/MediaAsset.ts',
  'api/types/MediaAssetList.ts',
  'api/types/ProgramDayType.ts',
  'api/types/WorkoutAchievementList.ts',
  'api/types/WorkoutAnalytics.ts',
  'api/types/WorkoutMeta.ts',
  'api/types/WorkoutSource.ts',
  'api/types/WorkoutType.ts',
  'api/types/WorkoutData.ts',
  'api/types/ExerciseAdditionalData.ts',
  'api/types/ExerciseData.ts',
  'api/types/ExerciseGroupType.ts',
  'api/types/MeasurementTemplate.ts',
  'api/types/WorkoutDataType.ts',
  'api/types/BaseModel.ts',
  'api/types/CreatorProfile.ts',
  'api/types/ExerciseVideo.ts',
  'api/types/MediaAssetImageVariant.ts',
  'api/types/MediaFrameOffsets.ts',
  'api/types/WorkoutAchievement.ts',
  'api/types/WorkoutSummary.ts',
  'types/auth.ts',
  'demo-data/UnitData.ts',
  'assets/logo-paths.ts',
  'api/types/CreatorProfileDetails.ts',
  'api/types/CreatorProfileLink.ts',
  'api/types/CreatorSocialMediaAccount.ts',
  'api/types/MediaFrameOffset.ts',
  'api/types/Muscle.ts',
  'api/types/MuscleGroup.ts',
  'api/types/MuscleTranslation.ts',
  'api/types/MuscleGroupTranslation.ts',
  'api/types/MuscleSplitTarget.ts',
]

const checkOnly = process.argv.includes('--check')
let copied = 0
let differing = 0

function syncFile(relativePath: string) {
  const source = join(MONOREPO_SHARED, relativePath)
  const target = join(TARGET_SHARED, relativePath)
  if (!existsSync(source)) {
    console.warn(`missing in monorepo: ${relativePath}`)
    return
  }
  const differs = !existsSync(target) ||
    readFileSync(source, 'utf8') !== readFileSync(target, 'utf8')
  if (!differs) return
  differing += 1
  if (checkOnly) {
    console.log(`differs: ${relativePath}`)
    return
  }
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  copied += 1
}

for (const directory of DIRECTORIES) {
  for (const entry of readdirSync(join(MONOREPO_SHARED, directory))) {
    syncFile(join(directory, entry).replaceAll('\\', '/'))
  }
}
for (const file of FILES) syncFile(file)

console.log(checkOnly
  ? `${differing} file(s) differ from the monorepo`
  : `${copied} file(s) copied (${differing} differed)`)
console.log('Note: src/shared/api/index.ts is a hand-written stub owned by this repo.')
