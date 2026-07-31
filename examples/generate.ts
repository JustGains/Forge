/**
 * The five-minute tour: load a catalog, ask Forge for a workout, print it.
 *
 *   bun examples/generate.ts
 *
 * Everything is deterministic: the same inputs and catalog always produce
 * the same plan. Change `seed` to shuffle, `durationMinutes` to resize,
 * `grouping` to 'supersets' or 'circuits' to change the session's shape.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildCatalogByCode,
  buildWorkoutDataFromOptim,
  defaultOptimDemoInputs,
  emptyMuscleUsageCounts,
  generateForgeWorkout,
  generateOptimWorkoutTitle,
  type ExerciseListItem,
} from '../src/index.ts'

// 1. A catalog: any ExerciseListItem[] works. Codes, names, muscles,
//    equipment, tags, and measurement types are what the engine reads.
const catalogPath = join(dirname(fileURLToPath(import.meta.url)), 'sample-catalog.json')
const { exercises } = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
  exercises: ExerciseListItem[]
}

// 2. What the athlete asked for. `defaultOptimDemoInputs` fills in the rest
//    (recovered Fitbod defaults); every field can be overridden.
const allEquipmentCodes = [...new Set(exercises.flatMap((exercise) => [
  ...(exercise.exerciseEquipment?.required ?? []),
  ...(exercise.exerciseEquipment?.optional ?? []),
].flat().map((code) => (code ?? '').trim().toUpperCase()).filter(Boolean)))]

const inputs = {
  ...defaultOptimDemoInputs({ equipmentCodes: allEquipmentCodes, executableLoads: true }),
  durationMinutes: 45,
  goal: 'strength' as const,
  experience: 'intermediate' as const,
  split: 'fullBody' as const,
  warmupSetsEnabled: true,
  seed: 42,
  generationDateIso: '2026-07-15T17:00:00.000Z',
}

// 3. Who is asking. History and muscle usage personalise loads and recovery;
//    empty values give an honest cold start (no invented weights).
const context = {
  exercises,
  completedWorkouts: [],
  muscleUsageStats: {
    '7d': emptyMuscleUsageCounts(),
    '30d': emptyMuscleUsageCounts(),
    '6m': emptyMuscleUsageCounts(),
  },
  bodyWeightKg: 82,
  gender: 'male',
  ageYears: 30,
}

// 4. Generate. `generateForgeWorkout` is the product path: every JustGains
//    improvement is on, and `notices` tells you what could not be honored.
const { result, notices } = generateForgeWorkout(inputs, context, 'straight')

console.log(`\n  ${generateOptimWorkoutTitle(result, inputs.seed)}`)
console.log(`  requested ${inputs.durationMinutes} min · projected ~${Math.round(result.durationEstimate?.sessionProjectedMinutes ?? 0)} min\n`)

for (const exercise of result.exercises) {
  const sets = exercise.sets.map((set) => {
    const parts = [
      set.setType === 'warmup' ? 'warm-up' : null,
      set.reps != null ? `${set.reps} reps` : null,
      set.weightKg != null ? `@ ${set.weightKg} kg` : null,
      set.durationSeconds != null ? `${set.durationSeconds}s` : null,
      set.targetRpe != null ? `RPE ${set.targetRpe}` : null,
    ].filter(Boolean).join(' ')
    return parts
  })
  const group = exercise.groupId != null ? ` [${exercise.groupType} ${exercise.groupId}]` : ''
  console.log(`  ${exercise.phase.padEnd(9)} ${exercise.name}${group}`)
  for (const line of sets) console.log(`            ${line}`)
}

if (notices.length > 0) {
  console.log('\n  Notices (honesty about what could not fit):')
  for (const notice of notices) console.log(`  - ${notice}`)
}

// 5. Want editable rows for a UI? The adapter emits blueprint-style workout
//    data: prescriptions in placeholders, nothing marked as already lifted.
const adapted = buildWorkoutDataFromOptim(result, buildCatalogByCode(exercises))
console.log(`\n  Adapter: ${adapted.workoutData.length} editable exercise rows, ${adapted.missingCatalogCodes.length} missing codes.`)
