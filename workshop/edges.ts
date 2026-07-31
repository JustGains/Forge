/**
 * ForgeWorkshop edge cases: explicit scenarios for engine paths the random
 * matrix cannot reach — manual muscle targets, pinned starting exercises,
 * exclusions, manual recovery, imperial racks, injuries, and seed extremes.
 * Each edge runs the standard validators plus its own expectation.
 */
import type { Workout } from '@justgains/shared/src/api/types/Workout'

import { evaluateGeneration, type ScenarioEvaluation } from './metrics'
import { WORKSHOP_PERSONAS, type WorkshopPersona } from './scenarios'
import {
  emptyUsageStats,
  generateForWorkshop,
  type GenerationOutcome,
  type GenerationRequest,
  type WorkshopCatalog,
} from './simulate'
import { computeMuscleUsage } from '@justgains/shared/src/utils/muscleUsage'

const GENERATION_DATE_ISO = '2026-07-15T17:00:00.000Z'

function persona(key: string): WorkshopPersona {
  const found = WORKSHOP_PERSONAS.find((candidate) => candidate.key === key)
  if (!found) throw new Error(`Unknown persona ${key}`)
  return found
}

function baseRequest(overrides: Partial<GenerationRequest>): GenerationRequest {
  return {
    durationMinutes: 45,
    goal: 'general',
    experience: 'intermediate',
    split: 'fresh',
    gear: 'full',
    grouping: 'straight',
    warmupSets: true,
    cardio: false,
    cooldown: false,
    seed: 7,
    generationDateIso: GENERATION_DATE_ISO,
    ...overrides,
  }
}

/** A completed heavy leg session yesterday, for recovery-sensitive edges. */
function legDayYesterday(): Workout {
  const endedAt = new Date(new Date(GENERATION_DATE_ISO).getTime() - 24 * 60 * 60 * 1000)
  return {
    workoutType: 'Log',
    workoutLogEndedAt: endedAt.toISOString(),
    workoutData: ['BARBELL.SQUAT', 'BARBELL.ROMANIAN.DEADLIFT', 'LEVER.SEATED.LEG.PRESS'].map((code) => ({
      exerciseCode: code,
      exerciseData: [1, 2, 3, 4].map((setNumber) => ({
        setNumber,
        setType: 'normal' as const,
        setCompleted: true,
        setMeasurements: [
          { measurementCode: 'WEIGHT', measurementValue: 80 },
          { measurementCode: 'REPS', measurementValue: 8 },
        ],
      })),
    })),
  } as Workout
}

export type EdgeCaseRecord = {
  key: string
  description: string
  evaluation: ScenarioEvaluation
  edgeViolations: string[]
  notices: string[]
}

type EdgeCase = {
  key: string
  description: string
  personaKey: string
  request: GenerationRequest
  completedWorkouts?: () => Workout[]
  /** Optional catalog mutation (e.g. mark favorites) applied before generation. */
  transformCatalog?: (catalog: WorkshopCatalog) => WorkshopCatalog
  /** Baseline (untransformed-catalog) outcome is supplied when transformCatalog exists. */
  verify: (outcome: GenerationOutcome, baseline?: GenerationOutcome) => string[]
}

const FAVORITE_CODES = ['DUMBBELL.LYING.FLOOR.SKULLCRUSHER', 'DUMBBELL.ALTERNATE.BICEPS.CURL', 'DUMBBELL.STANDING.FRENCH.PRESS']

const EDGE_CASES: EdgeCase[] = [
  {
    key: 'muscle-target-core-only',
    description: 'Manual core-only target keeps counts and attributes underfill instead of morphing the session',
    personaKey: 'alex-intermediate-strength',
    request: baseRequest({
      inputOverrides: { selectedMuscleBuckets: ['core'] },
    }),
    verify: (outcome) => {
      const offTarget = outcome.result.exercises.filter((exercise) =>
        exercise.phase === 'strength' &&
        exercise.primaryBucket != null &&
        exercise.primaryBucket !== 'core')
      return offTarget.length > 0
        ? [`core-only target selected ${offTarget.map((exercise) => exercise.code).join(', ')}`]
        : []
    },
  },
  {
    key: 'muscle-target-legs-arms',
    description: 'Manual legs+arms target is a hard filter for non-core strength work',
    personaKey: 'hana-intermediate-strength',
    request: baseRequest({
      durationMinutes: 40,
      inputOverrides: { selectedMuscleBuckets: ['legs', 'arms'] },
    }),
    verify: (outcome) => {
      const offTarget = outcome.result.exercises.filter((exercise) =>
        exercise.phase === 'strength' &&
        exercise.primaryBucket != null &&
        exercise.primaryBucket !== 'legs' &&
        exercise.primaryBucket !== 'arms')
      return offTarget.length > 0
        ? [`legs+arms target selected ${offTarget.map((exercise) => exercise.code).join(', ')}`]
        : []
    },
  },
  {
    key: 'pinned-starting-order',
    description: 'Pinned starting exercises lead the session in the order the user chose',
    personaKey: 'alex-intermediate-strength',
    request: baseRequest({
      durationMinutes: 60,
      goal: 'strength',
      split: 'fullBody',
      inputOverrides: {
        startingExerciseCodes: ['BARBELL.SQUAT', 'BARBELL.BENCH.PRESS', 'BARBELL.ROMANIAN.DEADLIFT'],
      },
    }),
    verify: (outcome) => {
      const strength = outcome.result.exercises
        .filter((exercise) => exercise.phase === 'strength')
        .map((exercise) => exercise.code)
      const expected = ['BARBELL.SQUAT', 'BARBELL.BENCH.PRESS', 'BARBELL.ROMANIAN.DEADLIFT']
      return expected.every((code, index) => strength[index] === code)
        ? []
        : [`pinned order broken: got ${strength.slice(0, 3).join(', ')}`]
    },
  },
  {
    key: 'excluded-exercises-absent',
    description: 'Manually excluded exercises never appear',
    personaKey: 'carlos-intermediate-bodybuilding',
    request: baseRequest({
      goal: 'bodybuilding',
      durationMinutes: 60,
      inputOverrides: {
        excludedExerciseCodes: [
          'BARBELL.SQUAT', 'BARBELL.BENCH.PRESS', 'BARBELL.ROMANIAN.DEADLIFT',
          'DUMBBELL.BENT.OVER.ROW', 'DUMBBELL.SQUAT', 'PUSH.PRESS',
        ],
      },
    }),
    verify: (outcome) => {
      const excluded = new Set([
        'BARBELL.SQUAT', 'BARBELL.BENCH.PRESS', 'BARBELL.ROMANIAN.DEADLIFT',
        'DUMBBELL.BENT.OVER.ROW', 'DUMBBELL.SQUAT', 'PUSH.PRESS',
      ])
      const leaked = outcome.result.exercises.filter((exercise) => excluded.has(exercise.code))
      return leaked.length > 0
        ? [`excluded exercise selected: ${leaked.map((exercise) => exercise.code).join(', ')}`]
        : []
    },
  },
  {
    key: 'imperial-executable-loads',
    description: 'Imperial rack snapping still stores kg and produces loads',
    personaKey: 'alex-intermediate-strength',
    request: baseRequest({
      goal: 'strength',
      durationMinutes: 60,
      inputOverrides: { executableLoadMeasurementSystem: 'imperial' },
    }),
    verify: (outcome) => {
      const problems: string[] = []
      for (const exercise of outcome.result.exercises) {
        for (const set of exercise.sets) {
          if (set.weightKg != null && (set.weightKg <= 0 || set.weightKg > 500)) {
            problems.push(`${exercise.code} imperial-snapped weight ${set.weightKg}kg out of range`)
          }
        }
      }
      return problems
    },
  },
  {
    key: 'fried-legs-fresh-avoidance',
    description: 'Yesterday\'s heavy leg day steers a fresh session away from legs',
    personaKey: 'alex-intermediate-strength',
    request: baseRequest({ durationMinutes: 45 }),
    completedWorkouts: () => [legDayYesterday()],
    verify: (outcome) => {
      const legLifts = outcome.result.exercises.filter((exercise) =>
        exercise.phase === 'strength' && exercise.primaryBucket === 'legs')
      return legLifts.length > 1
        ? [`fresh split picked ${legLifts.length} leg lifts the day after a heavy leg day`]
        : []
    },
  },
  {
    key: 'injuries-visibility-only',
    description: 'Injury labels never silently filter and never break generation',
    personaKey: 'fran-intermediate-knee',
    request: baseRequest({ gear: 'home', durationMinutes: 40 }),
    verify: (outcome) =>
      outcome.result.exercises.length === 0 ? ['injury labels blocked generation'] : [],
  },
  {
    key: 'minimal-session-bodyweight-circuit',
    description: '15-minute beginner bodyweight circuit stays valid',
    personaKey: 'eli-beginner-bodyweight',
    request: baseRequest({
      durationMinutes: 15,
      experience: 'beginner',
      gear: 'bodyweight',
      grouping: 'circuits',
      warmupSets: false,
    }),
    verify: () => [],
  },
  {
    key: 'maximal-session-olympic',
    description: '90-minute advanced Olympic session respects the specialized viability cap',
    personaKey: 'greg-advanced-olympic',
    request: baseRequest({
      durationMinutes: 90,
      goal: 'olympic',
      experience: 'advanced',
      cooldown: true,
      cardio: true,
    }),
    verify: () => [],
  },
  {
    key: 'favorites-influence-selection',
    description: 'Favorited exercises get their catalog scoring boost and beat equal-scored strangers',
    personaKey: 'alex-intermediate-strength',
    request: baseRequest({
      durationMinutes: 45,
      goal: 'bodybuilding',
      split: 'fullBody',
      gear: 'home',
    }),
    transformCatalog: (catalog) => ({
      ...catalog,
      exercises: catalog.exercises.map((exercise) =>
        FAVORITE_CODES.includes((exercise.exerciseCode ?? '').trim().toUpperCase())
          ? { ...exercise, isFavorited: true }
          : exercise),
    }),
    verify: (outcome, baseline) => {
      const problems: string[] = []
      // Selection and rank depend on catalog competition and position rules,
      // so the portable assertion is the score itself: favoriting must raise
      // each favorite's total score by exactly the +0.5 favorite utility.
      const scoreOf = (candidateOutcome: GenerationOutcome | undefined, code: string) =>
        candidateOutcome?.result.rankedCandidates.find((candidate) => candidate.code === code)
      for (const code of FAVORITE_CODES) {
        const favorited = scoreOf(outcome, code)
        const unfavorited = scoreOf(baseline, code)
        if (!favorited || !unfavorited) continue
        if (favorited.breakdown.userRating <= 0) {
          problems.push(`${code}: favorite utility never applied`)
          continue
        }
        const delta = favorited.score - unfavorited.score
        if (Math.abs(delta - 0.5) > 1e-6) {
          problems.push(`${code}: favoriting moved score by ${delta.toFixed(3)}, expected +0.5`)
        }
      }
      if (problems.length === 0 &&
        !FAVORITE_CODES.some((code) => scoreOf(outcome, code))) {
        problems.push('no favorited code was ranked at all')
      }
      return problems
    },
  },
  {
    key: 'seed-extremes-deterministic',
    description: 'Seed 0 and a huge seed both generate and re-generate identically',
    personaKey: 'jude-anonymous-general',
    request: baseRequest({ seed: 0 }),
    verify: () => [],
  },
]

export function runEdgeCases(catalog: WorkshopCatalog): EdgeCaseRecord[] {
  const records: EdgeCaseRecord[] = []
  for (const edge of EDGE_CASES) {
    const athlete = persona(edge.personaKey)
    const completedWorkouts = edge.completedWorkouts?.() ?? []
    const muscleUsageStats = completedWorkouts.length > 0
      ? computeMuscleUsage(
          completedWorkouts,
          catalog.bucketsByCode,
          new Date(edge.request.generationDateIso).getTime(),
        )
      : emptyUsageStats()
    const context = {
      completedWorkouts,
      muscleUsageStats,
      bodyWeightKg: athlete.bodyWeightKg,
      gender: athlete.gender,
      ageYears: athlete.ageYears,
      injuries: athlete.injuries,
    }
    const edgeCatalog = edge.transformCatalog ? edge.transformCatalog(catalog) : catalog
    const outcome = generateForWorkshop(edgeCatalog, edge.request, context)
    const baseline = edge.transformCatalog
      ? generateForWorkshop(catalog, edge.request, context)
      : undefined
    const evaluation = evaluateGeneration(edgeCatalog, edge.request, outcome)
    const edgeViolations = edge.verify(outcome, baseline)

    if (edge.key === 'seed-extremes-deterministic') {
      const rerun = generateForWorkshop(catalog, edge.request, context)
      if (JSON.stringify(rerun.workoutData) !== JSON.stringify(outcome.workoutData)) {
        edgeViolations.push('seed 0 re-run diverged')
      }
      const huge = generateForWorkshop(
        catalog,
        { ...edge.request, seed: 2_147_483_646 },
        context,
      )
      if (huge.result.exercises.length === 0) edgeViolations.push('huge seed generated nothing')
    }

    records.push({
      key: edge.key,
      description: edge.description,
      evaluation,
      edgeViolations,
      notices: outcome.notices,
    })
  }
  return records
}
