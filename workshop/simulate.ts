/**
 * ForgeWorkshop journey simulator: an athlete generates a plan, trains it,
 * logs it, and comes back — session after session, sometimes twice a day.
 * Each completion is fed back as real history (completed Workout rows +
 * muscle-usage stats), so recovery, progression, warm starts, and variety
 * are exercised exactly the way the shipping generator sees them.
 *
 * The athlete is modeled with a latent strength profile (per-bucket 1RM
 * factors with a deterministic per-exercise spread). That gives the sim a
 * ground truth to measure the load pipeline against: when Forge leaves a
 * load open the athlete logs what they can actually lift, and when Forge
 * prescribes one we can score it against the athlete's true capability.
 */
import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'
import type { Workout } from '@justgains/shared/src/api/types/Workout'
import type { WorkoutData } from '@justgains/shared/src/api/types/WorkoutData'
import {
  buildCatalogByCode,
  buildWorkoutDataFromOptim,
  defaultOptimDemoInputs,
  estimateOptimGuidedSessionMinutes,
  generateOptimUserWorkout,
  isOptimHomeEquipmentCode,
  type OptimDemoInputs,
  type OptimDemoResult,
  type OptimDemoSplit,
  type OptimGeneratorGroupingMode,
  type OptimWorkoutNotice,
} from '@justgains/shared/src/optim'
import {
  computeMuscleUsage,
  emptyMuscleUsageCounts,
  getExerciseBuckets,
  type MuscleBucketKey,
  type MuscleUsageStats,
} from '@justgains/shared/src/utils/muscleUsage'

import { mulberry32, type WorkshopGear, type WorkshopPersona } from './scenarios'

const DAY_MS = 24 * 60 * 60 * 1000

export type WorkshopCatalog = {
  exercises: ExerciseListItem[]
  byCode: Map<string, ExerciseListItem>
  bucketsByCode: Map<string, Set<MuscleBucketKey>>
  allEquipmentCodes: string[]
  homeEquipmentCodes: string[]
}

export function buildWorkshopCatalog(exercises: ExerciseListItem[]): WorkshopCatalog {
  const byCode = buildCatalogByCode(exercises)
  const bucketsByCode = new Map<string, Set<MuscleBucketKey>>()
  for (const [code, exercise] of byCode) {
    bucketsByCode.set(code, getExerciseBuckets(exercise))
  }
  const allEquipmentCodes = [...new Set(exercises.flatMap((exercise) => [
    ...(exercise.exerciseEquipment?.required ?? []),
    ...(exercise.exerciseEquipment?.optional ?? []),
  ].flat().map((code) => (code ?? '').trim().toUpperCase()).filter(Boolean)))].sort()
  return {
    exercises,
    byCode,
    bucketsByCode,
    allEquipmentCodes,
    homeEquipmentCodes: allEquipmentCodes.filter(isOptimHomeEquipmentCode),
  }
}

export function equipmentForGear(catalog: WorkshopCatalog, gear: WorkshopGear): string[] {
  if (gear === 'bodyweight') return []
  return gear === 'home' ? catalog.homeEquipmentCodes : catalog.allEquipmentCodes
}

export type GenerationRequest = {
  durationMinutes: number
  goal: OptimDemoInputs['goal']
  experience: OptimDemoInputs['experience']
  split: OptimDemoSplit
  gear: WorkshopGear
  grouping: OptimGeneratorGroupingMode
  warmupSets: boolean
  cardio: boolean
  cooldown: boolean
  seed: number
  generationDateIso: string
  /** Raw engine-input overrides for edge scenarios (muscle targets, pins, exclusions, units). */
  inputOverrides?: Partial<OptimDemoInputs>
}

export function buildWorkshopInputs(
  catalog: WorkshopCatalog,
  request: GenerationRequest,
): OptimDemoInputs {
  return {
    ...defaultOptimDemoInputs({
      equipmentCodes: equipmentForGear(catalog, request.gear),
      executableLoads: true,
    }),
    durationMinutes: request.durationMinutes,
    goal: request.goal,
    experience: request.experience,
    split: request.split,
    bodyweightOnly: request.gear === 'bodyweight',
    warmupSetsEnabled: request.warmupSets,
    mobilityCooldownEnabled: request.cooldown,
    cardioEnabled: request.cardio,
    supersetsEnabled: request.grouping === 'supersets',
    circuitsEnabled: request.grouping === 'circuits',
    seed: request.seed,
    generationDateIso: request.generationDateIso,
    ...request.inputOverrides,
  }
}

export type GenerationOutcome = {
  result: OptimDemoResult
  notices: OptimWorkoutNotice[]
  circuitFallback: boolean
  workoutData: WorkoutData[]
  missingCatalogCodes: string[]
  guidedMinutes: number | null
  elapsedMs: number
}

export function generateForWorkshop(
  catalog: WorkshopCatalog,
  request: GenerationRequest,
  context: {
    completedWorkouts: Workout[]
    muscleUsageStats: MuscleUsageStats
    bodyWeightKg?: number | null
    gender?: string | null
    ageYears?: number | null
    injuries?: string[]
  },
): GenerationOutcome {
  const inputs = buildWorkshopInputs(catalog, request)
  const startedAt = performance.now()
  const generated = generateOptimUserWorkout(
    inputs,
    {
      exercises: catalog.exercises,
      completedWorkouts: context.completedWorkouts,
      muscleUsageStats: context.muscleUsageStats,
      bodyWeightKg: context.bodyWeightKg,
      gender: context.gender,
      ageYears: context.ageYears,
      injuries: context.injuries,
    },
    request.grouping,
  )
  const elapsedMs = performance.now() - startedAt
  const adapted = buildWorkoutDataFromOptim(generated.result, catalog.byCode)
  return {
    result: generated.result,
    notices: generated.notices,
    circuitFallback: generated.circuitFallback,
    workoutData: adapted.workoutData,
    missingCatalogCodes: adapted.missingCatalogCodes,
    guidedMinutes: estimateOptimGuidedSessionMinutes(generated.result),
    elapsedMs,
  }
}

export function emptyUsageStats(): MuscleUsageStats {
  return {
    '7d': emptyMuscleUsageCounts(),
    '30d': emptyMuscleUsageCounts(),
    '6m': emptyMuscleUsageCounts(),
  }
}

/** Deterministic per-exercise spread in [0.55, 1.45] so a persona's lifts differ believably. */
function exerciseSpread(code: string): number {
  let hash = 2166136261
  for (let index = 0; index < code.length; index += 1) {
    hash ^= code.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return 0.55 + ((hash >>> 0) % 1000) / 1000 * 0.9
}

export type AthleteState = {
  persona: WorkshopPersona
  /** Latent 1RM per exercise code, kg. Mutates as the athlete adapts. */
  latentMaxKg: Map<string, number>
  /** Latent unloaded rep capacity per exercise code. */
  latentMaxReps: Map<string, number>
  completedWorkouts: Workout[]
}

export function createAthlete(persona: WorkshopPersona): AthleteState {
  return {
    persona,
    latentMaxKg: new Map(),
    latentMaxReps: new Map(),
    completedWorkouts: [],
  }
}

const EXPERIENCE_REP_CAPACITY = { beginner: 10, intermediate: 16, advanced: 22 } as const

export function latentMaxFor(
  athlete: AthleteState,
  code: string,
  bucket: MuscleBucketKey | null,
): number {
  const existing = athlete.latentMaxKg.get(code)
  if (existing != null) return existing
  const bodyWeight = athlete.persona.bodyWeightKg ?? 75
  const factor = athlete.persona.strengthFactors[bucket ?? 'arms'] ?? 0.5
  const value = Math.max(10, bodyWeight * factor * exerciseSpread(code))
  athlete.latentMaxKg.set(code, value)
  return value
}

function latentRepsFor(athlete: AthleteState, code: string): number {
  const existing = athlete.latentMaxReps.get(code)
  if (existing != null) return existing
  const base = EXPERIENCE_REP_CAPACITY[athlete.persona.experience]
  const value = Math.max(4, Math.round(base * exerciseSpread(code)))
  athlete.latentMaxReps.set(code, value)
  return value
}

/** Inverse of the engine's Epley-like max: the weight this athlete can move for `reps`. */
export function executableLoadAtReps(maxKg: number, reps: number, sets: number): number {
  return (maxKg * (1.0278 - Math.min(reps, 20) * 0.0278)) / (1 + sets * 0.018)
}

function repsToFailureAt(maxKg: number, weightKg: number): number {
  if (weightKg <= 0) return 30
  return Math.max(0, (1.0278 - weightKg / maxKg) / 0.0278)
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

export type SessionCompletion = {
  workout: Workout
  completedSetCount: number
  skippedSetCount: number
  loggedRpeCount: number
  /** Per-exercise prescription accuracy vs latent capability, weighted work only. */
  loadAccuracy: Array<{
    code: string
    prescribedKg: number
    idealKg: number
    relativeError: number
  }>
}

/**
 * Train the plan: complete sets with realistic adherence, log loads from the
 * latent strength model when the plan leaves them open, log RPE per the
 * persona's logging habit, and nudge latent strength upward afterwards.
 */
export function completeSession(
  athlete: AthleteState,
  workoutData: WorkoutData[],
  bucketsByCode: Map<string, Set<MuscleBucketKey>>,
  endedAtIso: string,
  sessionSeed: number,
  options?: { rpeLoggingRate?: number },
): SessionCompletion {
  const random = mulberry32(sessionSeed)
  const rpeLoggingRate = options?.rpeLoggingRate ?? 0.5
  let completedSetCount = 0
  let skippedSetCount = 0
  let loggedRpeCount = 0
  const loadAccuracy: SessionCompletion['loadAccuracy'] = []
  const trainedBuckets = new Set<MuscleBucketKey>()

  const loggedData: WorkoutData[] = workoutData.map((entry) => {
    const code = (entry.exerciseCode ?? '').trim().toUpperCase()
    const bucket = [...(bucketsByCode.get(code) ?? [])][0] ?? null
    const maxKg = latentMaxFor(athlete, code, bucket)
    const workingSets = (entry.exerciseData ?? []).filter((set) => set.setType !== 'warmup')
    const prescribedTop = Math.max(
      0,
      ...workingSets.map((set) =>
        Number(set.setMeasurements?.find((m) =>
          m.measurementCode === 'WEIGHT' || m.measurementCode === 'BODYWEIGHT_PLUS_WEIGHT',
        )?.measurementPlaceholder ?? 0)),
    )
    if (prescribedTop > 0) {
      const topReps = Math.max(
        1,
        ...workingSets.map((set) =>
          Number(set.setMeasurements?.find((m) => m.measurementCode === 'REPS')?.measurementPlaceholder ?? 0)),
      )
      const idealKg = executableLoadAtReps(maxKg, topReps, workingSets.length)
      loadAccuracy.push({
        code,
        prescribedKg: prescribedTop,
        idealKg,
        relativeError: idealKg > 0 ? (prescribedTop - idealKg) / idealKg : 0,
      })
    }

    const exerciseData = (entry.exerciseData ?? []).map((set) => {
      // 93% adherence on working sets; warmups are always done when attempted.
      const attempted = set.setType === 'warmup' || random() > 0.07
      if (!attempted) {
        skippedSetCount += 1
        return set
      }
      completedSetCount += 1
      if (bucket) trainedBuckets.add(bucket)

      const setCount = Math.max(1, workingSets.length)
      const prescribedWeight = Number(set.setMeasurements?.find((m) =>
        m.measurementCode === 'WEIGHT' || m.measurementCode === 'BODYWEIGHT_PLUS_WEIGHT',
      )?.measurementPlaceholder ?? 0)
      const prescribedReps = Number(set.setMeasurements?.find((m) => m.measurementCode === 'REPS')?.measurementPlaceholder ?? 8)
      const hasWeightColumn = (set.setMeasurements ?? []).some((m) =>
        m.measurementCode === 'WEIGHT' || m.measurementCode === 'BODYWEIGHT_PLUS_WEIGHT')
      // The load the athlete actually puts on the bar: the prescription when
      // one exists, otherwise what their latent strength supports.
      const chosenWeight = prescribedWeight > 0
        ? prescribedWeight
        : hasWeightColumn
          ? Math.max(2.5, roundTo(
              executableLoadAtReps(maxKg, Math.max(1, prescribedReps), setCount) * (0.94 + random() * 0.08),
              2.5,
            ))
          : 0
      const rpeFor = (weight: number, reps: number) => {
        const failureReps = repsToFailureAt(maxKg, weight)
        return Math.min(10, Math.max(6, roundTo(10 - (failureReps - reps), 0.5)))
      }
      const measurements = (set.setMeasurements ?? []).map((measurement) => {
        const placeholder = Number(measurement.measurementPlaceholder ?? 0)
        switch (measurement.measurementCode) {
          case 'REPS': {
            const target = placeholder > 0
              ? placeholder
              : Math.min(10, latentRepsFor(athlete, code))
            const wiggle = random() < 0.2 ? (random() < 0.5 ? -1 : 1) : 0
            // An athlete under load fails past their rep capacity at that
            // weight; unloaded work is bounded by latent rep capacity.
            const capacity = chosenWeight > 0
              ? Math.floor(repsToFailureAt(maxKg, chosenWeight))
              : latentRepsFor(athlete, code) + 2
            const reps = Math.max(1, Math.min(capacity, Math.round(target + wiggle)))
            return { ...measurement, measurementValue: reps }
          }
          case 'WEIGHT':
          case 'BODYWEIGHT_PLUS_WEIGHT': {
            return { ...measurement, measurementValue: chosenWeight > 0 ? chosenWeight : null }
          }
          case 'BODYWEIGHT_MINUS_ASSISTANCE': {
            // Assistance the athlete actually needed, not a prescription echo.
            const bodyWeight = athlete.persona.bodyWeightKg ?? 75
            const assistance = Math.max(0, roundTo(bodyWeight - maxKg, 2.5))
            return { ...measurement, measurementValue: assistance > 0 ? assistance : null }
          }
          case 'DURATION':
          case 'HOLD_DURATION': {
            const seconds = placeholder > 0 ? placeholder : 30
            return { ...measurement, measurementValue: Math.round(seconds * (0.9 + random() * 0.2)) }
          }
          case 'DISTANCE': {
            const km = placeholder > 0 ? placeholder : 1
            return { ...measurement, measurementValue: Math.round(km * (0.9 + random() * 0.2) * 100) / 100 }
          }
          case 'RPE': {
            if (random() > rpeLoggingRate) return measurement
            loggedRpeCount += 1
            return { ...measurement, measurementValue: rpeFor(chosenWeight, prescribedReps) }
          }
          case 'REST':
            return { ...measurement, measurementValue: placeholder }
          default:
            return measurement
        }
      })
      // Real loggers add an RPE entry even when the plan did not prescribe
      // one; that measured effort is what the catch-up policies key off.
      const hasRpeColumn = measurements.some((m) => m.measurementCode === 'RPE')
      if (!hasRpeColumn && chosenWeight > 0 && set.setType !== 'warmup' && random() < rpeLoggingRate) {
        loggedRpeCount += 1
        measurements.push({
          measurementCode: 'RPE',
          measurementValue: rpeFor(chosenWeight, prescribedReps),
          measurementPlaceholder: null,
          preferredUnit: null,
        })
      }
      return { ...set, setCompleted: true, setMeasurements: measurements }
    })
    return { ...entry, exerciseData }
  })

  // Adaptation: buckets trained today get a touch stronger everywhere they map.
  for (const [code, value] of athlete.latentMaxKg) {
    const codeBuckets = bucketsByCode.get(code)
    if (!codeBuckets) continue
    if ([...codeBuckets].some((candidate) => trainedBuckets.has(candidate))) {
      athlete.latentMaxKg.set(code, value * 1.004)
    }
  }
  for (const [code, value] of athlete.latentMaxReps) {
    const codeBuckets = bucketsByCode.get(code)
    if (!codeBuckets) continue
    if ([...codeBuckets].some((candidate) => trainedBuckets.has(candidate))) {
      athlete.latentMaxReps.set(code, Math.min(40, value + (random() < 0.3 ? 1 : 0)))
    }
  }

  const workout = {
    workoutId: `workshop-${sessionSeed}`,
    workoutTitle: 'Workshop session',
    workoutType: null,
    workoutLogEndedAt: endedAtIso,
    workoutData: loggedData,
  } as unknown as Workout

  athlete.completedWorkouts.push(workout)
  return { workout, completedSetCount, skippedSetCount, loggedRpeCount, loadAccuracy }
}

export type JourneySessionRecord = {
  index: number
  dateIso: string
  daysSincePrevious: number | null
  request: GenerationRequest
  outcome: GenerationOutcome
  completion: SessionCompletion
  /** Engine-visible usage per bucket at generation time (post-history). */
  muscleUsageAtGeneration: Record<string, number>
}

export type JourneyPlanTemplate = {
  key: string
  personaKey: string
  sessions: number
  /** Days between sessions, cycled. 0 = same-day double session. */
  restPattern: number[]
  split: OptimDemoSplit | 'ppl' | 'upperLower'
  durationMinutes: number
  grouping: OptimGeneratorGroupingMode
  gearOverride?: WorkshopGear
  warmupSets?: boolean
  cardio?: boolean
  cooldown?: boolean
  rpeLoggingRate?: number
}

const PPL_CYCLE: OptimDemoSplit[] = ['push', 'pull', 'lower']
const UPPER_LOWER_CYCLE: OptimDemoSplit[] = ['upper', 'lower']

export function splitForSession(
  template: JourneyPlanTemplate,
  sessionIndex: number,
): OptimDemoSplit {
  if (template.split === 'ppl') return PPL_CYCLE[sessionIndex % PPL_CYCLE.length]!
  if (template.split === 'upperLower') return UPPER_LOWER_CYCLE[sessionIndex % UPPER_LOWER_CYCLE.length]!
  return template.split
}

export function runJourney(
  catalog: WorkshopCatalog,
  persona: WorkshopPersona,
  template: JourneyPlanTemplate,
  options: { startDateIso: string; runSeed: number },
): JourneySessionRecord[] {
  const athlete = createAthlete(persona)
  const records: JourneySessionRecord[] = []
  let currentMs = new Date(options.startDateIso).getTime()
  let previousMs: number | null = null

  for (let index = 0; index < template.sessions; index += 1) {
    const nowIso = new Date(currentMs).toISOString()
    const muscleUsageStats = computeMuscleUsage(
      athlete.completedWorkouts,
      catalog.bucketsByCode,
      currentMs,
    )
    const request: GenerationRequest = {
      durationMinutes: template.durationMinutes,
      goal: persona.goal,
      experience: persona.experience,
      split: splitForSession(template, index),
      gear: template.gearOverride ?? persona.gear,
      grouping: template.grouping,
      warmupSets: template.warmupSets ?? true,
      cardio: template.cardio ?? false,
      cooldown: template.cooldown ?? false,
      seed: options.runSeed + index * 7919,
      generationDateIso: nowIso,
    }
    const outcome = generateForWorkshop(catalog, request, {
      completedWorkouts: athlete.completedWorkouts,
      muscleUsageStats,
      bodyWeightKg: persona.bodyWeightKg,
      gender: persona.gender,
      ageYears: persona.ageYears,
      injuries: persona.injuries,
    })

    // The athlete finishes about when the guided estimate says, then logs it.
    const sessionMinutes = outcome.guidedMinutes ?? template.durationMinutes
    const endedAtIso = new Date(currentMs + sessionMinutes * 60 * 1000).toISOString()
    const completion = completeSession(
      athlete,
      outcome.workoutData,
      catalog.bucketsByCode,
      endedAtIso,
      options.runSeed ^ (index * 104729),
      { rpeLoggingRate: template.rpeLoggingRate },
    )

    records.push({
      index,
      dateIso: nowIso,
      daysSincePrevious: previousMs == null ? null : (currentMs - previousMs) / DAY_MS,
      request,
      outcome,
      completion,
      muscleUsageAtGeneration: outcome.result.muscleUsage,
    })

    previousMs = currentMs
    const gapDays = template.restPattern[index % template.restPattern.length]!
    // Same-day doubles land 6 hours later; rest days land at the same hour.
    currentMs += gapDays === 0 ? 6 * 60 * 60 * 1000 : gapDays * DAY_MS
  }

  return records
}
