/**
 * Build examples/sample-catalog.json from a full JustGains catalog export.
 * Dev-machine tool: the full catalog is not part of this repo. The sample
 * keeps a balanced spread across muscle buckets, equipment classes, cardio,
 * and mobility, plus every exercise the workshop's edge cases reference,
 * with heavy display fields stripped.
 *
 *   bun scripts/build-sample-catalog.ts <path-to-full-catalog.json>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourcePath = process.argv[2] ?? 'J:/justgains/.tmp/forge-workshop/catalog.json'
const payload = JSON.parse(readFileSync(sourcePath, 'utf8')) as {
  exercises?: Record<string, unknown>[]
}
const exercises = payload.exercises ?? (payload as unknown as Record<string, unknown>[])

const MUST_HAVE = new Set([
  'BARBELL.SQUAT', 'BARBELL.BENCH.PRESS', 'BARBELL.ROMANIAN.DEADLIFT',
  'DUMBBELL.BENT.OVER.ROW', 'DUMBBELL.SQUAT', 'PUSH.PRESS', 'LEVER.SEATED.LEG.PRESS',
  'LATERAL.RAISE', 'DUMBBELL.LYING.FLOOR.SKULLCRUSHER',
  'DUMBBELL.ALTERNATE.BICEPS.CURL', 'DUMBBELL.STANDING.FRENCH.PRESS',
  'DUMBBELL.INCLINE.CHEST.PRESS', 'DUMBBELL.PUSH.PRESS', 'RUN',
])

type AnyExercise = Record<string, any>

const slim = (exercise: AnyExercise): AnyExercise => ({
  exerciseCode: exercise.exerciseCode,
  exerciseName: exercise.exerciseName,
  popularityRating: exercise.popularityRating,
  exerciseTags: exercise.exerciseTags,
  exerciseTypeCode: exercise.exerciseTypeCode,
  exerciseMeasurements: exercise.exerciseMeasurements,
  isWeightPerSide: exercise.isWeightPerSide,
  exerciseEquipment: exercise.exerciseEquipment,
  exerciseMuscles: (exercise.exerciseMuscles ?? []).map((muscle: AnyExercise) => ({
    muscleCode: muscle.muscleCode,
    isPrimary: muscle.isPrimary,
    targetPercentage: muscle.targetPercentage,
  })),
})

const byCode = new Map<string, AnyExercise>()
for (const exercise of exercises as AnyExercise[]) {
  const code = String(exercise.exerciseCode ?? '').toUpperCase()
  if (code && !byCode.has(code)) byCode.set(code, exercise)
}

const picked = new Map<string, AnyExercise>()
for (const code of MUST_HAVE) {
  const exercise = byCode.get(code)
  if (exercise) picked.set(code, exercise)
  else console.warn(`must-have code missing from source: ${code}`)
}

// Balanced top-up: for each (category) keep the most popular entries.
const categoryOf = (exercise: AnyExercise): string => {
  const tags: string[] = (exercise.exerciseTags ?? []).map((tag: string) => String(tag).toUpperCase())
  const type = String(exercise.exerciseTypeCode ?? '').toUpperCase()
  const primary = (exercise.exerciseMuscles ?? []).find((muscle: AnyExercise) => muscle.isPrimary)
  const muscle = String(primary?.muscleCode ?? 'NONE')
  const equipment = JSON.stringify(exercise.exerciseEquipment?.required ?? [])
  if (['DISTANCE_DURATION', 'WALKING', 'CYCLING', 'TREADMILL', 'ROWING', 'SWIMMING', 'STEPS'].includes(type)) return `cardio:${type}`
  if (['STATIC_STRETCHES', 'YOGA'].includes(type)) return `mobility:${type}`
  if (tags.includes('OLYMPIC_LIFTING')) return `olympic:${muscle}`
  if (tags.includes('POWERLIFTING')) return `power:${muscle}`
  const equipmentClass = equipment.includes('BARBELL') ? 'barbell'
    : equipment.includes('DUMBBELL') ? 'dumbbell'
    : equipment.includes('BAND') ? 'band'
    : equipment === '[]' ? 'bodyweight'
    : 'machine'
  return `${equipmentClass}:${muscle}`
}

// 150 exercises total. Cardio, mobility, and the specialized competition
// pools keep a two-deep quota (the engine needs real choice there); ordinary
// strength categories get one seat each, most popular first, until the cap.
const TARGET_TOTAL = 150
const quotaFor = (category: string): number =>
  category.startsWith('cardio:') || category.startsWith('mobility:') ||
  category.startsWith('olympic:') || category.startsWith('power:')
    ? 2
    : 1
const counts = new Map<string, number>()
const sorted = [...byCode.values()].sort(
  (left, right) => (right.popularityRating ?? 0) - (left.popularityRating ?? 0),
)
for (const pass of [0, 1]) {
  for (const exercise of sorted) {
    if (picked.size >= TARGET_TOTAL) break
    const code = String(exercise.exerciseCode).toUpperCase()
    if (picked.has(code)) continue
    const category = categoryOf(exercise)
    const count = counts.get(category) ?? 0
    // First pass honors quotas for breadth; a second pass tops up the most
    // popular remainder if quotas alone could not reach the target.
    if (pass === 0 && count >= quotaFor(category)) continue
    counts.set(category, count + 1)
    picked.set(code, exercise)
  }
}

const output = [...picked.values()].map(slim)
const target = join(dirname(fileURLToPath(import.meta.url)), '../examples/sample-catalog.json')
writeFileSync(target, JSON.stringify({ exercises: output }, null, 1))
console.log(`sample catalog: ${output.length} exercises → ${target}`)
