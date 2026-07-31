import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'
import type { Workout } from '@justgains/shared/src/api/types/Workout'
import { convertKgToGymLbs } from '@justgains/shared/src/utils/measurementUtils'
import { describe, expect, it } from 'vitest'

import { calculatePlatesForWeight, WEIGHT_CONFIGS } from '../utils/WeightConfig'
import { emptyMuscleUsageCounts, type MuscleUsageStats } from '../utils/muscleUsage'

import {
  buildOptimDemoHistory,
  calculateOptimExerciseCounts,
  defaultOptimDemoInputs,
  estimatedExerciseSeconds,
  generateOptimDemo,
  getOptimNameImpliedEquipmentCode,
  type OptimDemoInputs,
  type OptimDemoUserContext,
} from './optimDemoEngine'
import { getOptimExerciseBodyweightMetadata } from './optimExerciseBodyweightMetadata'

const DATE = '2026-07-15T12:00:00.000Z'
const EMPTY_USAGE: MuscleUsageStats = {
  '7d': emptyMuscleUsageCounts(),
  '30d': emptyMuscleUsageCounts(),
  '6m': emptyMuscleUsageCounts(),
}

describe('Optim duration subtotal source of truth', () => {
  it('prices work plus between-set rest while excluding only the trailing rest', () => {
    // Why: product fill/trim imports this exact helper. These edge cases keep
    // the recovered engine subtotal and product ceiling policy from drifting.
    const estimate = (sets: any[]) => estimatedExerciseSeconds({ sets } as any)

    expect(estimate([])).toBe(0)
    expect(estimate([
      { setType: 'normal', reps: 10, restSeconds: 300 },
    ])).toBe(30)
    expect(estimate([
      { setType: 'normal', reps: 100, durationSeconds: 45, restSeconds: 0 },
    ])).toBe(45)
    expect(estimate([
      { setType: 'warmup', reps: 5, restSeconds: 45 },
      { setType: 'normal', reps: 999, durationSeconds: 30, restSeconds: 300 },
    ])).toBe(90)
  })
})

function exercise(
  code: string,
  muscleCode: string,
  options: {
    name?: string
    equipment?: string
    tags?: string[]
    type?: string
    measurements?: string[]
    popularity?: number
    secondaryMuscleCodes?: string[]
    isWeightPerSide?: boolean
  } = {},
): ExerciseListItem {
  return {
    exerciseCode: code,
    exerciseName: options.name ?? code,
    popularityRating: options.popularity ?? 8,
    exerciseTags: options.tags ?? ['COMPOUND'],
    exerciseTypeCode: options.type ?? 'WEIGHT_REPS',
    exerciseMeasurements: options.measurements ?? ['WEIGHT', 'REPS'],
    isWeightPerSide: options.isWeightPerSide,
    exerciseEquipment: options.equipment ? { required: [[options.equipment]] } : undefined,
    exerciseMuscles: [
      { muscleCode, isPrimary: true, targetPercentage: 80 },
      ...(options.secondaryMuscleCodes ?? []).map((secondaryMuscleCode) => ({
        muscleCode: secondaryMuscleCode,
        isPrimary: false,
        targetPercentage: 20,
      })),
    ],
  }
}

function completedWorkout(code: string, daysAgo = 1, weightMeasurementCode = 'WEIGHT'): Workout {
  const endedAt = new Date(new Date(DATE).getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return {
    workoutType: 'Log',
    workoutLogEndedAt: endedAt.toISOString(),
    workoutData: [{
      exerciseCode: code,
      exerciseData: [1, 2, 3].map((setNumber) => ({
        setNumber,
        setType: 'normal' as const,
        setCompleted: true,
        setMeasurements: [
          { measurementCode: weightMeasurementCode, measurementValue: 80 },
          { measurementCode: 'REPS', measurementValue: 8 },
        ],
      })),
    }],
  } as Workout
}

function completedWorkoutWithLoad(
  code: string,
  daysAgo: number,
  weightKg: number,
  targetWeightKg?: number,
): Workout {
  const endedAt = new Date(new Date(DATE).getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return {
    workoutType: 'Log',
    workoutLogEndedAt: endedAt.toISOString(),
    workoutData: [{
      exerciseCode: code,
      exerciseData: [1, 2, 3].map((setNumber) => ({
        setNumber,
        setType: 'normal' as const,
        setCompleted: true,
        setMeasurements: [
          { measurementCode: 'WEIGHT', measurementValue: weightKg, measurementPlaceholder: targetWeightKg },
          { measurementCode: 'REPS', measurementValue: 5, measurementPlaceholder: targetWeightKg == null ? undefined : 5 },
        ],
      })),
    }],
  } as Workout
}

function completedBodyweightWorkout(
  code: string,
  daysAgo: number,
  reps: number,
  targetReps?: number,
): Workout {
  const endedAt = new Date(new Date(DATE).getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return {
    workoutType: 'Log',
    workoutLogEndedAt: endedAt.toISOString(),
    workoutData: [{
      exerciseCode: code,
      exerciseData: [{
        setNumber: 1,
        setType: 'normal',
        setCompleted: true,
        setMeasurements: [{
          measurementCode: 'REPS',
          measurementValue: reps,
          measurementPlaceholder: targetReps,
        }],
      }],
    }],
  } as Workout
}

function completedBodyweightLoadWorkout(
  code: string,
  daysAgo: number,
  measurementCode: 'BODYWEIGHT_PLUS_WEIGHT' | 'BODYWEIGHT_MINUS_ASSISTANCE',
  externalLoadKg: number,
  reps = 5,
  targetExternalLoadKg?: number,
  targetReps?: number,
): Workout {
  const endedAt = new Date(new Date(DATE).getTime() - daysAgo * 24 * 60 * 60 * 1000)
  return {
    workoutType: 'Log',
    workoutLogEndedAt: endedAt.toISOString(),
    workoutData: [{
      exerciseCode: code,
      exerciseData: [1, 2, 3].map((setNumber) => ({
        setNumber,
        setType: 'normal' as const,
        setCompleted: true,
        setMeasurements: [
          {
            measurementCode,
            measurementValue: externalLoadKg,
            measurementPlaceholder: targetExternalLoadKg,
          },
          {
            measurementCode: 'REPS',
            measurementValue: reps,
            measurementPlaceholder: targetReps,
          },
        ],
      })),
    }],
  } as Workout
}

function baseInputs(overrides: Partial<OptimDemoInputs> = {}): OptimDemoInputs {
  return {
    ...defaultOptimDemoInputs({ equipmentCodes: ['BARBELL'], generationDate: new Date(DATE) }),
    goal: 'general',
    nonCoreCountOverride: 1,
    coreCountOverride: 0,
    ...overrides,
  }
}

function context(
  exercises: ExerciseListItem[],
  completedWorkouts: Workout[] = [],
  overrides: Partial<OptimDemoUserContext> = {},
): OptimDemoUserContext {
  return {
    exercises,
    completedWorkouts,
    muscleUsageStats: EMPTY_USAGE,
    bodyWeightKg: 80,
    ...overrides,
  }
}

function estimatedResultSeconds(result: ReturnType<typeof generateOptimDemo>): number {
  return result.exercises.reduce((total, item) => {
    const exerciseSeconds = item.sets.reduce(
      (sum, set) => sum + (set.durationSeconds ?? (set.reps ?? 0) * 3) + set.restSeconds,
      0,
    )
    return total + exerciseSeconds - (item.sets.at(-1)?.restSeconds ?? 0)
  }, 0)
}

describe('calculateOptimExerciseCounts', () => {
  it('encodes the recovered duration tiers and muscle-tone bonus', () => {
    expect(calculateOptimExerciseCounts(30, 'general')).toEqual({ nonCore: 3, core: 1 })
    expect(calculateOptimExerciseCounts(45, 'general')).toEqual({ nonCore: 4, core: 2 })
    expect(calculateOptimExerciseCounts(46, 'general')).toEqual({ nonCore: 4, core: 1 })
    expect(calculateOptimExerciseCounts(50, 'general')).toEqual({ nonCore: 4, core: 2 })
    expect(calculateOptimExerciseCounts(60, 'general')).toEqual({ nonCore: 4, core: 2 })
    expect(calculateOptimExerciseCounts(60, 'muscleTone')).toEqual({ nonCore: 6, core: 3 })
  })
})

describe('defaultOptimDemoInputs', () => {
  it('keeps the production profile mapping on ordinary goals', () => {
    // Why: specialized powerlifting and Olympic sessions intentionally cap
    // heavy lift count. If profile mapping ever enables those goals, the
    // user-facing 15-90 minute contract must be reviewed alongside that cap.
    const profileGoalSamples = [
      [],
      ['Build Muscle'],
      ['Increase Strength'],
      ['Lose Fat'],
      ['Tone Up'],
      ['Powerlifting'],
      ['Olympic lifting'],
    ]
    const ordinaryGoals = new Set(['strength', 'bodybuilding', 'muscleTone', 'general'])

    for (const fitnessGoals of profileGoalSamples) {
      expect(ordinaryGoals.has(defaultOptimDemoInputs({ fitnessGoals }).goal)).toBe(true)
    }
  })
})

describe('buildOptimDemoHistory', () => {
  it('keeps legacy completed sets with missing measurement arrays from crashing generation', () => {
    // Why: completed logs predate the current generated contract and can also
    // come from importers. A malformed set may still establish recency, but it
    // must not crash every future workout generation or invent load history.
    const legacyWorkout = {
      workoutType: 'Log',
      workoutLogEndedAt: DATE,
      workoutData: [{
        exerciseCode: 'LEGACY_PRESS',
        exerciseData: [{
          setNumber: 1,
          setType: 'normal',
          setCompleted: true,
          setMeasurements: undefined,
        }],
      }],
    } as unknown as Workout

    const history = buildOptimDemoHistory([legacyWorkout]).get('LEGACY_PRESS')

    expect(history).toEqual(expect.objectContaining({
      workoutCount: 1,
      completedSets: 1,
      observations: [],
      repObservations: [],
      observedWeightsKg: [],
    }))
  })

  it('ignores invalid, zero, warm-up, and incomplete history without inventing observations', () => {
    const hostileWorkout = {
      workoutType: 'Log',
      workoutLogEndedAt: DATE,
      workoutData: [{
        exerciseCode: 'HOSTILE_HISTORY',
        exerciseData: [
          { setNumber: 1, setType: 'normal', setCompleted: true },
          {
            setNumber: 2,
            setType: 'normal',
            setCompleted: true,
            setMeasurements: [
              { measurementCode: 'WEIGHT', measurementValue: Number.NaN },
              { measurementCode: 'REPS', measurementValue: 'not-a-number' },
            ],
          },
          {
            setNumber: 3,
            setType: 'normal',
            setCompleted: true,
            setMeasurements: [
              { measurementCode: 'WEIGHT', measurementValue: 0 },
              { measurementCode: 'REPS', measurementValue: 0 },
            ],
          },
          {
            setNumber: 4,
            setType: 'warmup',
            setCompleted: true,
            setMeasurements: [
              { measurementCode: 'WEIGHT', measurementValue: 100 },
              { measurementCode: 'REPS', measurementValue: 8 },
            ],
          },
          {
            setNumber: 5,
            setType: 'normal',
            setCompleted: false,
            setMeasurements: [
              { measurementCode: 'WEIGHT', measurementValue: 100 },
              { measurementCode: 'REPS', measurementValue: 8 },
            ],
          },
        ],
      }],
    } as unknown as Workout

    const history = buildOptimDemoHistory([hostileWorkout]).get('HOSTILE_HISTORY')
    expect(history).toEqual(expect.objectContaining({
      completedSets: 3,
      observations: [],
      repObservations: [],
      observedWeightsKg: [],
    }))
  })

  it('uses explicit RPE symmetrically only through the opt-in history seam', () => {
    // Why: an Optim circuit deliberately lowers load for two reps in reserve.
    // Persisted RPE 8 must recover the straight-set capacity instead of
    // teaching the next workout that the athlete lost strength; legacy
    // callers and invalid effort values must retain recovered behavior.
    const workoutAtRpe = (
      actualRpe: number,
      targetRpe: number,
    ) => ({
      workoutType: 'Log',
      workoutLogEndedAt: DATE,
      workoutData: [{
        exerciseCode: 'RPE_CIRCUIT_PRESS',
        exerciseData: [1, 2, 3].map((setNumber) => ({
          setNumber,
          setType: 'normal' as const,
          setCompleted: true,
          setMeasurements: [
            { measurementCode: 'WEIGHT', measurementValue: 60, measurementPlaceholder: 60 },
            { measurementCode: 'REPS', measurementValue: 8, measurementPlaceholder: 8 },
            { measurementCode: 'RPE', measurementValue: actualRpe, measurementPlaceholder: targetRpe },
          ],
        })),
      }],
    }) as Workout
    const observation = (workout: Workout, rpeAwareEffort?: boolean) =>
      buildOptimDemoHistory(
        [workout],
        Number.POSITIVE_INFINITY,
        rpeAwareEffort == null ? {} : { rpeAwareEffort },
      ).get('RPE_CIRCUIT_PRESS')?.observations[0]
    const expectedMax = (reps: number) =>
      ((1 + 3 * 0.018) * 60) / (1.0278 - reps * 0.0278)

    expect(observation(workoutAtRpe(8, 8))).toEqual(
      observation(workoutAtRpe(8, 8), false),
    )
    const exact = observation(workoutAtRpe(8, 8), true)
    expect(exact?.theoreticalMaxKg).toBeCloseTo(expectedMax(10), 10)
    expect(exact?.recommendedTheoreticalMaxKg).toBeCloseTo(expectedMax(10), 10)
    expect(exact?.actualRpeMeasured).toBe(true)

    const harderThanPlanned = observation(workoutAtRpe(9, 8), true)
    expect(harderThanPlanned?.theoreticalMaxKg).toBeCloseTo(expectedMax(9), 10)
    expect(harderThanPlanned?.recommendedTheoreticalMaxKg).toBeCloseTo(expectedMax(10), 10)
    expect(observation(workoutAtRpe(5, 5), true)).toEqual(
      observation(workoutAtRpe(5, 5), false),
    )
  })

  it('keeps added and assisted effective-load history monotonic', () => {
    // Why: at fixed body mass/reps, more added load must mean more capacity,
    // while more assistance must mean less. Reversing either silently teaches
    // the generator the opposite progression.
    const addedExercise = exercise('WEIGHTED.PULL.UP', 'LATISSIMUS_DORSI', {
      name: 'Weighted Pull-Up',
    })
    const assistedExercise = exercise('ASSISTED.PULL.UP', 'LATISSIMUS_DORSI', {
      name: 'Machine Assisted Pull-Up',
    })
    const addedMetadata = getOptimExerciseBodyweightMetadata(addedExercise)
    const assistedMetadata = getOptimExerciseBodyweightMetadata(assistedExercise)
    const maxFor = (
      code: string,
      measurementCode: 'BODYWEIGHT_PLUS_WEIGHT' | 'BODYWEIGHT_MINUS_ASSISTANCE',
      externalLoadKg: number,
      metadata: NonNullable<typeof addedMetadata>,
    ) => buildOptimDemoHistory(
      [completedBodyweightLoadWorkout(code, 1, measurementCode, externalLoadKg)],
      Number.POSITIVE_INFINITY,
      { bodyWeightKg: 80, bodyweightMetadataByCode: new Map([[code, metadata]]) },
    ).get(code)?.observations[0]?.theoreticalMaxKg ?? 0

    expect(addedMetadata).not.toBeNull()
    expect(assistedMetadata).not.toBeNull()
    expect(maxFor('WEIGHTED.PULL.UP', 'BODYWEIGHT_PLUS_WEIGHT', 20, addedMetadata!))
      .toBeGreaterThan(maxFor('WEIGHTED.PULL.UP', 'BODYWEIGHT_PLUS_WEIGHT', 10, addedMetadata!))
    expect(maxFor('ASSISTED.PULL.UP', 'BODYWEIGHT_MINUS_ASSISTANCE', 20, assistedMetadata!))
      .toBeLessThan(maxFor('ASSISTED.PULL.UP', 'BODYWEIGHT_MINUS_ASSISTANCE', 10, assistedMetadata!))
  })

  it('separates resolvable added-load work from unloaded rep capacity', () => {
    // Why: +20 kg pull-up reps already contribute through effective load and
    // would understate unloaded capacity. Assisted and unresolved added work
    // still need reps because the generator cannot safely prescribe that load.
    const weighted = exercise('WEIGHTED.PULL.UP', 'LATISSIMUS_DORSI', { name: 'Weighted Pull-Up' })
    const assisted = exercise('ASSISTED.PULL.UP', 'LATISSIMUS_DORSI', { name: 'Machine Assisted Pull-Up' })
    const weightedMetadata = getOptimExerciseBodyweightMetadata(weighted)!
    const assistedMetadata = getOptimExerciseBodyweightMetadata(assisted)!
    const historyFor = (
      code: string,
      measurementCode: 'BODYWEIGHT_PLUS_WEIGHT' | 'BODYWEIGHT_MINUS_ASSISTANCE',
      externalLoadKg: number,
      bodyWeightKg: number | null,
      metadata: typeof weightedMetadata,
    ) => buildOptimDemoHistory(
      [completedBodyweightLoadWorkout(code, 1, measurementCode, externalLoadKg)],
      Number.POSITIVE_INFINITY,
      { bodyWeightKg, bodyweightMetadataByCode: new Map([[code, metadata]]) },
    ).get(code)

    const resolvedAdded = historyFor(
      'WEIGHTED.PULL.UP',
      'BODYWEIGHT_PLUS_WEIGHT',
      20,
      80,
      weightedMetadata,
    )
    expect(resolvedAdded?.observations).toHaveLength(1)
    expect(resolvedAdded?.repObservations).toEqual([])
    expect(historyFor(
      'WEIGHTED.PULL.UP',
      'BODYWEIGHT_PLUS_WEIGHT',
      0,
      80,
      weightedMetadata,
    )?.repObservations).toHaveLength(1)
    expect(historyFor(
      'WEIGHTED.PULL.UP',
      'BODYWEIGHT_PLUS_WEIGHT',
      20,
      null,
      weightedMetadata,
    )?.repObservations).toHaveLength(1)
    expect(historyFor(
      'ASSISTED.PULL.UP',
      'BODYWEIGHT_MINUS_ASSISTANCE',
      20,
      80,
      assistedMetadata,
    )?.repObservations).toHaveLength(1)
  })

  it('drops impossible assistance and compares targets in body-inclusive effective space', () => {
    // Why: assistance at or above contributed body mass is not a physical
    // positive load, and capability ratios must compare 100 kg vs 99 kg here,
    // never the misleading standalone 20 kg vs 19 kg.
    const weighted = exercise('WEIGHTED.PULL.UP', 'LATISSIMUS_DORSI', { name: 'Weighted Pull-Up' })
    const assisted = exercise('ASSISTED.PULL.UP', 'LATISSIMUS_DORSI', { name: 'Machine Assisted Pull-Up' })
    const weightedMetadata = getOptimExerciseBodyweightMetadata(weighted)!
    const assistedMetadata = getOptimExerciseBodyweightMetadata(assisted)!
    const weightedHistory = buildOptimDemoHistory(
      [completedBodyweightLoadWorkout(
        'WEIGHTED.PULL.UP',
        1,
        'BODYWEIGHT_PLUS_WEIGHT',
        20,
        5,
        19,
        5,
      )],
      Number.POSITIVE_INFINITY,
      {
        bodyWeightKg: 80,
        bodyweightMetadataByCode: new Map([['WEIGHTED.PULL.UP', weightedMetadata]]),
      },
    ).get('WEIGHTED.PULL.UP')
    const observation = weightedHistory?.observations[0]
    const impossibleAssistance = buildOptimDemoHistory(
      [completedBodyweightLoadWorkout(
        'ASSISTED.PULL.UP',
        1,
        'BODYWEIGHT_MINUS_ASSISTANCE',
        80,
      )],
      Number.POSITIVE_INFINITY,
      {
        bodyWeightKg: 80,
        bodyweightMetadataByCode: new Map([['ASSISTED.PULL.UP', assistedMetadata]]),
      },
    ).get('ASSISTED.PULL.UP')

    expect(observation?.theoreticalMaxKg).toBeGreaterThan(0)
    expect(observation?.recommendedTheoreticalMaxKg).toBeGreaterThan(0)
    expect((observation?.theoreticalMaxKg ?? 0) / (observation?.recommendedTheoreticalMaxKg ?? 1))
      .toBeCloseTo(100 / 99, 5)
    expect(impossibleAssistance?.observations).toEqual([])
  })
})

describe('generateOptimDemo', () => {
  const chest = exercise('BENCH_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL' })
  const legs = exercise('BACK_SQUAT', 'QUADRICEPS', { equipment: 'BARBELL' })

  it('is deterministic for an identical input and source snapshot', () => {
    const inputs = baseInputs({ seed: 42 })
    const source = context([chest, legs])

    expect(generateOptimDemo(inputs, source)).toEqual(generateOptimDemo(inputs, source))
  })

  it('keeps legacy generic load output when executable-load mode is absent', () => {
    const source = context([chest], [completedWorkoutWithLoad('BENCH_PRESS', 1, 83)])
    const explicitLegacy = baseInputs({ executableLoadsEnabled: false })
    const absent = { ...explicitLegacy }
    delete absent.executableLoadsEnabled

    expect(generateOptimDemo(absent, source)).toEqual(generateOptimDemo(explicitLegacy, source))
  })

  it('keeps omitted executable rack units byte-compatible with metric', () => {
    // Why: measurement-aware snapping is a user-facing opt-in. Existing lab,
    // serialized, and programmatic callers must retain metric output exactly.
    const source = context([chest], [completedWorkoutWithLoad('BENCH_PRESS', 1, 83)])
    const explicitMetric = baseInputs({
      executableLoadsEnabled: true,
      executableLoadMeasurementSystem: 'metric',
    })
    const absent = { ...explicitMetric }
    delete absent.executableLoadMeasurementSystem

    expect(generateOptimDemo(absent, source)).toEqual(generateOptimDemo(explicitMetric, source))
  })

  it('does not turn a sub-bar plate-loaded target into an unsafe empty-bar prescription', () => {
    const lightBarbell = {
      ...exercise('LIGHT_BARBELL_CURL', 'BICEPS_BRACHII', {
        equipment: 'BARBELL',
        tags: ['COMPOUND', 'PLATE_LOADED'],
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const result = generateOptimDemo(
      baseInputs({ executableLoadsEnabled: true, experience: 'beginner', warmupSetsEnabled: true }),
      context([lightBarbell], [completedWorkoutWithLoad('LIGHT_BARBELL_CURL', 1, 5)]),
    )

    expect(result.exercises[0].theoreticalMaxKg).toBeGreaterThan(0)
    expect(result.exercises[0].sets.every(set => set.weightKg == null)).toBe(true)
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining('below the 20 kg default bar'))
  })

  it('omits a generic load that rounds to zero instead of prescribing 0 kg', () => {
    // Why: zero is not an executable resistance target. Reps-only output is
    // honest; a visible "0 kg" column looks like a broken recommendation.
    const tinyLoad = exercise('TINY_LOAD', 'BICEPS_BRACHII', { equipment: 'BARBELL' })
    const result = generateOptimDemo(
      baseInputs({ executableLoadsEnabled: false }),
      context([tinyLoad], [completedWorkoutWithLoad('TINY_LOAD', 1, 0.1)]),
    )

    expect(result.exercises[0].theoreticalMaxKg).toBeGreaterThan(0)
    expect(result.exercises[0].sets.every((set) => set.weightKg == null)).toBe(true)
  })

  it('omits a sub-plate single-point target instead of prescribing 0 kg', () => {
    // Why: single-point mode has no bar minimum, but an empty plate list is
    // still not an executable resistance target. New held-plate metadata must
    // not turn tiny recovered values into a visible 0 kg prescription.
    const tinyHeldPlate = {
      ...exercise('WEIGHTED.SVEND.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Svend-Press',
        equipment: 'WEIGHT_PLATES',
        tags: ['PLATE_LOADED', 'PUSH_SPLIT', 'COMPOUND'],
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['WEIGHT_PLATES'],
        executableLoadsEnabled: true,
      }),
      context([tinyHeldPlate], [completedWorkoutWithLoad('WEIGHTED.SVEND.PRESS', 1, 0.1)]),
    )

    expect(result.exercises[0].sets.every((set) => set.weightKg == null)).toBe(true)
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining('no positive load is supported'))
  })

  it('keeps a sub-bar held-plate load through the Optim-only metadata seam', () => {
    // Why: a held plate has no 20 kg bar. The sidecar must recover an
    // executable placeholder without changing the shared production keyboard
    // classifier used by ordinary workout components.
    const heldPlate = {
      ...exercise('WEIGHTED.SVEND.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Svend-Press',
        equipment: 'WEIGHT_PLATES',
        tags: ['PLATE_LOADED', 'PUSH_SPLIT', 'COMPOUND'],
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['WEIGHT_PLATES'],
        executableLoadsEnabled: true,
      }),
      context([heldPlate], [completedWorkoutWithLoad('WEIGHTED.SVEND.PRESS', 1, 5)]),
    )
    const workingWeights = result.exercises[0].sets
      .filter((set) => set.setType === 'normal')
      .map((set) => set.weightKg)

    expect(workingWeights.every((weight) => typeof weight === 'number' && weight > 0 && weight < 20)).toBe(true)
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining(
      'Optim load-mode metadata reclassified stale barbell mechanics to single-point plate loading',
    ))
  })

  it('keeps a first-use held-plate warm start executable', () => {
    // Why: load feasibility runs before prescription. The metadata override
    // must prevent a valid Svend-press warm start from being rejected or
    // emitted without weight merely because it is lighter than an empty bar.
    const heldPlate = {
      ...exercise('WEIGHTED.SVEND.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Svend-Press',
        equipment: 'WEIGHT_PLATES',
        tags: ['PLATE_LOADED', 'PUSH_SPLIT', 'COMPOUND'],
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['WEIGHT_PLATES'],
        executableLoadsEnabled: true,
        experience: 'intermediate',
      }),
      context([heldPlate], [], { gender: 'male', ageYears: 30 }),
    )
    const workingWeight = result.exercises[0].sets
      .find((set) => set.setType === 'normal')?.weightKg

    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining('demographic warm-start max'))
    expect(workingWeight).toBeGreaterThan(0)
    expect(workingWeight).toBeLessThan(20)
  })

  it('uses loadable plate increments and removes warm-up duplicates after snapping', () => {
    const plateLoaded = {
      ...chest,
      exerciseTags: ['COMPOUND', 'PLATE_LOADED'],
      isPlateLoaded: true,
    } as ExerciseListItem
    const result = generateOptimDemo(
      baseInputs({ executableLoadsEnabled: true, experience: 'beginner', warmupSetsEnabled: true }),
      context([plateLoaded], [completedWorkoutWithLoad('BENCH_PRESS', 1, 83)]),
    )
    const weightedSets = result.exercises[0].sets.filter(set => set.weightKg != null)
    const warmups = weightedSets.filter(set => set.setType === 'warmup').map(set => set.weightKg as number)
    const workingWeight = weightedSets.find(set => set.setType === 'normal')?.weightKg as number

    expect(weightedSets.every(set => (set.weightKg as number) >= 20 && Number.isInteger((set.weightKg as number) - 20))).toBe(true)
    expect(new Set(warmups).size).toBe(warmups.length)
    expect(warmups.every((weight, index) => weight < workingWeight && (index === 0 || weight > warmups[index - 1]))).toBe(true)
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining('two-sided barbell'))
  })

  it('stores imperial-rack prescriptions in kg while every displayed pound total is loadable', () => {
    // Why: an imperial user must see totals achievable with the real 45 lb bar
    // and lb plate inventory, even though API and offline workout values stay kg.
    const plateLoaded = {
      ...chest,
      exerciseTags: ['COMPOUND', 'PLATE_LOADED'],
      isPlateLoaded: true,
    } as ExerciseListItem
    const result = generateOptimDemo(
      baseInputs({
        executableLoadsEnabled: true,
        executableLoadMeasurementSystem: 'imperial',
        experience: 'beginner',
        warmupSetsEnabled: true,
      }),
      context([plateLoaded], [completedWorkoutWithLoad('BENCH_PRESS', 1, 83)]),
    )
    const weightedSets = result.exercises[0].sets.filter((set) => set.weightKg != null)

    expect(weightedSets.length).toBeGreaterThan(0)
    for (const set of weightedSets) {
      const pounds = convertKgToGymLbs(set.weightKg as number)
      const targetPerSide = (pounds - WEIGHT_CONFIGS.imperial.defaultBarWeight) / 2
      const plates = calculatePlatesForWeight(targetPerSide, WEIGHT_CONFIGS.imperial.plates, [])
      expect(pounds).toBeGreaterThanOrEqual(WEIGHT_CONFIGS.imperial.defaultBarWeight)
      expect(plates.reduce((sum, plate) => sum + plate, 0)).toBeCloseTo(targetPerSide, 4)
    }
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining(
      'JustGains imperial plate configuration',
    ))
  })

  it('uses the imperial plate inventory for single-point loads without adding a bar', () => {
    // Why: held plates share the plate picker but not barbell mechanics. Their
    // displayed lb value must decompose directly into plates, with no 45 lb
    // bar subtracted, while storage remains kg.
    const heldPlate = {
      ...exercise('WEIGHTED.SVEND.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Svend-Press',
        equipment: 'WEIGHT_PLATES',
        tags: ['PLATE_LOADED', 'PUSH_SPLIT', 'COMPOUND'],
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['WEIGHT_PLATES'],
        executableLoadsEnabled: true,
        executableLoadMeasurementSystem: 'imperial',
      }),
      context([heldPlate], [completedWorkoutWithLoad('WEIGHTED.SVEND.PRESS', 1, 40)]),
    )
    const weightedSets = result.exercises[0].sets.filter((set) => set.weightKg != null)

    expect(weightedSets.length).toBeGreaterThan(0)
    for (const set of weightedSets) {
      const pounds = convertKgToGymLbs(set.weightKg as number)
      const plates = calculatePlatesForWeight(pounds, WEIGHT_CONFIGS.imperial.plates, [])
      expect(plates.reduce((sum, plate) => sum + plate, 0)).toBeCloseTo(pounds, 4)
    }
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining(
      'single-point load supported by the existing JustGains imperial plate configuration',
    ))
  })

  it('uses the real imperial bar minimum for sub-bar prescriptions', () => {
    // Why: a 45 lb rack must not inherit the legacy 20 kg cutoff or emit an
    // empty-bar load for a target below what that user can physically load.
    const plateLoaded = {
      ...exercise('IMPERIAL_LIGHT_BAR', 'BICEPS_BRACHII', {
        equipment: 'BARBELL',
        tags: ['COMPOUND', 'PLATE_LOADED'],
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const result = generateOptimDemo(
      baseInputs({
        executableLoadsEnabled: true,
        executableLoadMeasurementSystem: 'imperial',
      }),
      context([plateLoaded], [completedWorkoutWithLoad('IMPERIAL_LIGHT_BAR', 1, 5)]),
    )

    expect(result.exercises[0].sets.every((set) => set.weightKg == null)).toBe(true)
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining(
      'below the 45 lbs default bar',
    ))
  })

  it('does not reinterpret per-side history as rack totals when imperial snapping is enabled', () => {
    // Why: dumbbell values are stored per side and the app converts them only
    // for display. Rack units must not double or otherwise rewrite that
    // exercise-local logging contract.
    const dumbbell = exercise('IMPERIAL_PER_SIDE_CURL', 'BICEPS_BRACHII', {
      equipment: 'DUMBBELLS',
      isWeightPerSide: true,
    })
    const source = context([dumbbell], [completedWorkoutWithLoad('IMPERIAL_PER_SIDE_CURL', 1, 17)])
    const metric = generateOptimDemo(baseInputs({
      availableEquipmentCodes: ['DUMBBELLS'],
      executableLoadsEnabled: true,
    }), source)
    const imperial = generateOptimDemo(baseInputs({
      availableEquipmentCodes: ['DUMBBELLS'],
      executableLoadsEnabled: true,
      executableLoadMeasurementSystem: 'imperial',
    }), source)

    expect(imperial.exercises[0].sets).toEqual(metric.exercises[0].sets)
    expect(imperial.exercises[0].isWeightPerSide).toBe(true)
  })

  it('round-trips executable low-rep prescriptions without inventing capacity', () => {
    // Why: POWERLIFTING-tagged strength work intentionally scales table reps
    // below four. Snapping the load must not force those reps back to four,
    // or exact completion ratchets the next inferred max upward forever.
    const lowRepBench = {
      ...exercise('BARBELL.BENCH.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        equipment: 'BARBELL',
        tags: ['POWERLIFTING', 'PLATE_LOADED', 'COMPOUND', 'PUSH_SPLIT'],
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const result = generateOptimDemo(
      baseInputs({
        goal: 'strength',
        experience: 'advanced',
        executableLoadsEnabled: true,
        generationDateIso: '2026-01-05T12:00:00.000Z',
      }),
      context([lowRepBench], [], { gender: 'male', ageYears: 30 }),
    )
    const generated = result.exercises[0]
    const workingSets = generated.sets.filter(set => set.setType === 'normal')
    const working = workingSets[0]
    const inferredMax = ((1 + workingSets.length * 0.018) * (working.weightKg ?? 0))
      / (1.0278 - Math.min(working.reps ?? 0, 20) * 0.0278)

    expect(working.reps).toBeLessThan(4)
    expect(generated.theoreticalMaxKg).toBeGreaterThan(0)
    expect(Math.abs(inferredMax / (generated.theoreticalMaxKg ?? 1) - 1)).toBeLessThan(0.03)
  })

  it.each(['DUMBBELLS', 'KETTLEBELLS'])('keeps fixed %s loads out of loose-plate math even with stale plate flags', (equipmentCode) => {
    const code = `${equipmentCode}_PRESS`
    const fixedImplement = {
      ...exercise(code, 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        equipment: equipmentCode,
        tags: ['COMPOUND', 'PLATE_LOADED', 'WEIGHT_PER_SIDE'],
      }),
      isPlateLoaded: true,
      isSingleStack: true,
    } as ExerciseListItem
    const history = [
      completedWorkoutWithLoad(code, 3, 10),
      completedWorkoutWithLoad(code, 2, 20),
      completedWorkoutWithLoad(code, 1, 25),
    ]
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: [equipmentCode],
        executableLoadsEnabled: true,
        experience: 'beginner',
        warmupSetsEnabled: false,
      }),
      context([fixedImplement], history),
    )
    const workingWeights = result.exercises[0].sets.map(set => set.weightKg).filter((weight): weight is number => weight != null)

    expect(workingWeights.length).toBeGreaterThan(0)
    expect(workingWeights.every(weight => [10, 20, 25].includes(weight))).toBe(true)
    expect(result.exercises[0].isWeightPerSide).toBe(true)
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining('per-side-aware load history'))
    expect(result.exercises[0].trace).toContain(
      'Catalog weight-per-side flag; every weight value is per side and remains numerically unchanged.',
    )
    expect(result.exercises[0].trace).not.toContainEqual(expect.stringContaining('plate configuration'))
  })

  it('updates from logged load history when ES2023 toSorted is unavailable', () => {
    // Quick Edit runs in Hermes, where toSorted may be absent. Logged history
    // must still guide the regenerated prescription instead of crashing.
    const originalToSorted = Array.prototype.toSorted
    Object.defineProperty(Array.prototype, 'toSorted', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    try {
      const dumbbellPress = exercise('DUMBBELL_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        equipment: 'DUMBBELLS',
        tags: ['COMPOUND', 'WEIGHT_PER_SIDE'],
      })
      const history = [
        completedWorkoutWithLoad('DUMBBELL_PRESS', 3, 10),
        completedWorkoutWithLoad('DUMBBELL_PRESS', 2, 20),
        completedWorkoutWithLoad('DUMBBELL_PRESS', 1, 25),
      ]

      const result = generateOptimDemo(
        baseInputs({
          availableEquipmentCodes: ['DUMBBELLS'],
          executableLoadsEnabled: true,
          experience: 'beginner',
          warmupSetsEnabled: false,
        }),
        context([dumbbellPress], history),
      )

      expect(result.exercises[0].trace).toContainEqual(
        expect.stringContaining('per-side-aware load history'),
      )
    } finally {
      Object.defineProperty(Array.prototype, 'toSorted', {
        configurable: true,
        writable: true,
        value: originalToSorted,
      })
    }
  })

  it('preserves plate math when fixed implements are authored alongside actual plates', () => {
    const mixedEquipment = {
      ...exercise('MIXED_PLATE_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        tags: ['COMPOUND', 'PLATE_LOADED'],
      }),
      exerciseEquipment: { required: [['DUMBBELLS'], ['WEIGHT_PLATES']] },
      isPlateLoaded: true,
    } as ExerciseListItem
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['DUMBBELLS', 'WEIGHT_PLATES'],
        executableLoadsEnabled: true,
        experience: 'beginner',
      }),
      context([mixedEquipment], [completedWorkoutWithLoad('MIXED_PLATE_PRESS', 1, 5)]),
    )

    expect(result.exercises[0].sets.every(set => set.weightKg == null)).toBe(true)
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining('below the 20 kg default bar'))
  })

  it('replaces an unpinned sub-bar choice when an equally eligible exercise can express its load', () => {
    const lightBarbell = {
      ...exercise('LIGHT_BAR_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Barbell Bench Press',
        equipment: 'BARBELL',
        tags: ['COMPOUND', 'PLATE_LOADED'],
        popularity: 10,
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const alternative = exercise('DUMBBELL_PRESS_ALTERNATIVE', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Dumbbell Bench Press',
      equipment: 'DUMBBELLS',
      tags: ['COMPOUND', 'WEIGHT_PER_SIDE'],
      popularity: 1,
    })
    const source = context(
      [lightBarbell, alternative],
      [
        completedWorkoutWithLoad('LIGHT_BAR_PRESS', 1, 5),
        completedWorkoutWithLoad('DUMBBELL_PRESS_ALTERNATIVE', 2, 10),
      ],
    )
    const legacy = generateOptimDemo(
      baseInputs({ availableEquipmentCodes: ['BARBELL', 'DUMBBELLS'], experience: 'beginner' }),
      source,
    )
    const executable = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL', 'DUMBBELLS'],
        executableLoadsEnabled: true,
        experience: 'beginner',
      }),
      source,
    )

    expect(legacy.exercises[0].code).toBe('LIGHT_BAR_PRESS')
    expect(executable.exercises[0].code).toBe('DUMBBELL_PRESS_ALTERNATIVE')
  })

  it('does not let a max-effort cadence day bypass executable-load replacement', () => {
    // Why: max-effort changes sets/reps, not the physical minimum bar weight.
    // A sub-bar choice still cannot express its prescription and should yield
    // to the same movement on an implement that can, even on the 1-in-4 cadence.
    const lightBarbell = {
      ...exercise('CADENCE_LIGHT_BAR_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Barbell Bench Press',
        equipment: 'BARBELL',
        tags: ['COMPOUND', 'PLATE_LOADED'],
        popularity: 10,
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const alternative = exercise('CADENCE_DUMBBELL_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Dumbbell Bench Press',
      equipment: 'DUMBBELLS',
      tags: ['COMPOUND', 'WEIGHT_PER_SIDE'],
      popularity: 1,
    })
    const workouts = [1, 7, 14].flatMap(daysAgo => [
      completedWorkoutWithLoad('CADENCE_LIGHT_BAR_PRESS', daysAgo, 5),
      completedWorkoutWithLoad('CADENCE_DUMBBELL_PRESS', daysAgo, 10),
    ])
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL', 'DUMBBELLS'],
        executableLoadsEnabled: true,
        experience: 'intermediate',
        seed: 0,
      }),
      context([lightBarbell, alternative], workouts),
    )

    expect(result.exercises[0].code).toBe('CADENCE_DUMBBELL_PRESS')
    expect(result.exercises[0].sets.some(set => set.weightKg != null)).toBe(true)
  })

  it('does not replace a known sub-bar lift with an alternative whose load is merely unknown', () => {
    const lightBarbell = {
      ...exercise('KNOWN_LIGHT_BAR', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Barbell Bench Press',
        equipment: 'BARBELL',
        tags: ['COMPOUND', 'PLATE_LOADED'],
        popularity: 10,
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const unknownAlternative = exercise('UNKNOWN_DUMBBELL_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Dumbbell Chest Press',
      equipment: 'DUMBBELLS',
      tags: ['COMPOUND', 'WEIGHT_PER_SIDE'],
      popularity: 1,
    })
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL', 'DUMBBELLS'],
        executableLoadsEnabled: true,
        experience: 'beginner',
      }),
      context([lightBarbell, unknownAlternative], [completedWorkoutWithLoad('KNOWN_LIGHT_BAR', 1, 5)]),
    )

    expect(result.exercises[0].code).toBe('KNOWN_LIGHT_BAR')
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining('sparse-catalog fallback'))
  })

  it('does not trade movement intent for a mechanically feasible but unrelated exercise', () => {
    const lightBench = {
      ...exercise('LIGHT_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Barbell Bench Press',
        equipment: 'BARBELL',
        tags: ['COMPOUND', 'PLATE_LOADED'],
        popularity: 10,
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const knownRow = exercise('KNOWN_ROW', 'LATISSIMUS_DORSI', {
      name: 'Machine High Row',
      equipment: 'ROW_MACHINE',
      tags: ['COMPOUND'],
      popularity: 1,
    })
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL', 'ROW_MACHINE'],
        executableLoadsEnabled: true,
        experience: 'beginner',
      }),
      context([
        lightBench,
        knownRow,
      ], [
        completedWorkoutWithLoad('LIGHT_BENCH', 1, 5),
        completedWorkoutWithLoad('KNOWN_ROW', 2, 40),
      ]),
    )

    expect(result.exercises[0].code).toBe('LIGHT_BENCH')
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining('sparse-catalog fallback'))
  })

  it('does not call an unloaded band variant a feasible replacement for weighted work', () => {
    const lightBench = {
      ...exercise('LIGHT_WEIGHTED_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Barbell Bench Press',
        equipment: 'BARBELL',
        tags: ['COMPOUND', 'PLATE_LOADED'],
        popularity: 10,
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const bandedBench = exercise('BANDED_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Barbell Bench Press',
      equipment: 'RESISTANCE_BANDS',
      tags: ['COMPOUND'],
      popularity: 1,
    })
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL', 'RESISTANCE_BANDS'],
        executableLoadsEnabled: true,
        experience: 'beginner',
      }),
      context([lightBench, bandedBench], [completedWorkoutWithLoad('LIGHT_WEIGHTED_BENCH', 1, 5)]),
    )

    expect(result.exercises[0].code).toBe('LIGHT_WEIGHTED_BENCH')
    expect(result.exercises[0].trace).toContainEqual(expect.stringContaining('sparse-catalog fallback'))
  })

  it('does not demote the best workout choice merely because a lower-ranked exercise has load data', () => {
    const bestUnknown = exercise('BEST_UNKNOWN_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'DUMBBELLS',
      tags: ['COMPOUND', 'WEIGHT_PER_SIDE'],
      popularity: 10,
    })
    const knownLowerRank = exercise('KNOWN_LOWER_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'DUMBBELLS',
      tags: ['COMPOUND', 'WEIGHT_PER_SIDE'],
      popularity: 1,
    })
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['DUMBBELLS'],
        executableLoadsEnabled: true,
        experience: 'beginner',
      }),
      context([bestUnknown, knownLowerRank], [completedWorkoutWithLoad('KNOWN_LOWER_PRESS', 1, 20)]),
    )

    expect(result.exercises[0].code).toBe('BEST_UNKNOWN_PRESS')
  })

  it('preserves pinned and sparse-catalog sub-bar choices with explicit traces', () => {
    const lightBarbell = {
      ...exercise('PINNED_LIGHT_BAR', 'BICEPS_BRACHII', {
        equipment: 'BARBELL',
        tags: ['COMPOUND', 'PLATE_LOADED'],
      }),
      isPlateLoaded: true,
    } as ExerciseListItem
    const source = context([lightBarbell], [completedWorkoutWithLoad('PINNED_LIGHT_BAR', 1, 5)])
    const sparse = generateOptimDemo(
      baseInputs({ executableLoadsEnabled: true, experience: 'beginner' }),
      source,
    )
    const pinned = generateOptimDemo(
      baseInputs({
        executableLoadsEnabled: true,
        experience: 'beginner',
        startingExerciseCodes: ['PINNED_LIGHT_BAR'],
      }),
      source,
    )

    expect(sparse.exercises[0].code).toBe('PINNED_LIGHT_BAR')
    expect(sparse.exercises[0].trace).toContainEqual(expect.stringContaining('sparse-catalog fallback'))
    expect(pinned.exercises[0].code).toBe('PINNED_LIGHT_BAR')
    expect(pinned.exercises[0].trace).toContain('Pinned by starting-exercise input')
    expect(pinned.exercises[0].trace).not.toContainEqual(expect.stringContaining('sparse-catalog fallback'))
  })

  it('caps default long specialized sessions while preserving manual count overrides', () => {
    const powerLifts = Array.from({ length: 9 }, (_, index) =>
      exercise(`POWER_SQUAT_${index}`, 'QUADRICEPS', { equipment: 'BARBELL', tags: ['POWERLIFTING'] }))
    const olympicLifts = Array.from({ length: 9 }, (_, index) =>
      exercise(`OLYMPIC_CLEAN_${index}`, 'QUADRICEPS', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'] }))
    const powerlifting = generateOptimDemo(
      baseInputs({ durationMinutes: 90, goal: 'powerlifting', split: 'fullBody', nonCoreCountOverride: null }),
      context(powerLifts),
    )
    const olympic = generateOptimDemo(
      baseInputs({ durationMinutes: 90, goal: 'olympic', split: 'fullBody', nonCoreCountOverride: null }),
      context(olympicLifts),
    )
    const manual = generateOptimDemo(
      baseInputs({ durationMinutes: 90, goal: 'powerlifting', split: 'fullBody', nonCoreCountOverride: 6 }),
      context(powerLifts),
    )

    expect(powerlifting.counts.computedNonCore).toBe(4)
    expect(olympic.counts.computedNonCore).toBe(4)
    expect(manual.counts.generatedStrength).toBe(6)
    expect(powerlifting.durationEstimate?.utilization).toBeLessThan(0.75)
    expect(powerlifting.events).toContainEqual(expect.stringContaining('Emitted set/rest subtotal'))
    expect(powerlifting.events).toContainEqual(expect.stringContaining('does not prove the real session is underfilled'))
    expect(manual.durationEstimate?.projectedMinutes).toBeGreaterThan(powerlifting.durationEstimate?.projectedMinutes ?? 0)
    expect(powerlifting.events).toContainEqual(expect.stringMatching(
      /Specialized-goal viability cap.+Strength count override/,
    ))
  })

  it('reserves lower, push, and pull roles for full-body workouts when each is available', () => {
    const source = context([
      exercise('BENCH_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', popularity: 10 }),
      exercise('SHOULDER_PRESS', 'ANTERIOR_DELTOID', { equipment: 'BARBELL', popularity: 9 }),
      exercise('BACK_SQUAT', 'QUADRICEPS', { equipment: 'BARBELL', popularity: 8 }),
      exercise('BARBELL_ROW', 'LATISSIMUS_DORSI', { equipment: 'BARBELL', popularity: 1 }),
    ])
    const result = generateOptimDemo(
      baseInputs({ split: 'fullBody', nonCoreCountOverride: 3 }),
      source,
    )
    const buckets = new Set(result.exercises.map((item) => item.primaryBucket))

    expect(buckets.has('legs')).toBe(true)
    expect(buckets.has('back')).toBe(true)
    expect([...buckets].some((bucket) => bucket === 'chest' || bucket === 'shoulders')).toBe(true)
    expect(result.events).toContain('Full-body role coverage satisfied.')
  })

  it('fills full-body workouts when the eligible catalog cannot supply every role', () => {
    const source = context([
      exercise('BENCH_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL' }),
      exercise('SHOULDER_PRESS', 'ANTERIOR_DELTOID', { equipment: 'BARBELL' }),
      exercise('BACK_SQUAT', 'QUADRICEPS', { equipment: 'BARBELL' }),
    ])
    const result = generateOptimDemo(
      baseInputs({ split: 'fullBody', nonCoreCountOverride: 3 }),
      source,
    )

    expect(result.counts.generatedStrength).toBe(3)
    expect(result.events).toContain('Full-body role coverage satisfied.')
  })

  it('uses a nonzero seed to vary near-tied exercises without losing determinism', () => {
    const source = context([
      exercise('CHEST_PRESS_A', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL' }),
      exercise('CHEST_PRESS_B', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL' }),
      exercise('CHEST_PRESS_C', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL' }),
    ])
    const defaultResult = generateOptimDemo(baseInputs({ seed: 0 }), source)
    const variedInputs = baseInputs({ seed: 1 })
    const variedResult = generateOptimDemo(variedInputs, source)

    expect(variedResult.exercises[0].code).not.toBe(defaultResult.exercises[0].code)
    expect(variedResult).toEqual(generateOptimDemo(variedInputs, source))
  })

  it('includes an exact 0.05 score gap in seeded variation without admitting the next thousandth', () => {
    const top = exercise('CHEST_PRESS_TOP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL',
      popularity: 6,
    })
    const exactBoundary = exercise('CHEST_PRESS_EXACT_BOUNDARY', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL',
      popularity: 5.5,
    })
    const outsideBoundary = exercise('CHEST_PRESS_OUTSIDE_BOUNDARY', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL',
      popularity: 5.49,
    })
    const inputs = baseInputs({ seed: 1 })

    expect(generateOptimDemo(inputs, context([top, exactBoundary])).exercises[0].code)
      .toBe('CHEST_PRESS_EXACT_BOUNDARY')
    expect(generateOptimDemo(inputs, context([top, outsideBoundary])).exercises[0].code)
      .toBe('CHEST_PRESS_TOP')
  })

  it('uses completed local history to favor the fresher muscle group', () => {
    const result = generateOptimDemo(baseInputs(), context([chest, legs], [completedWorkout('BENCH_PRESS')]))

    expect(result.exercises[0].code).toBe('BACK_SQUAT')
    expect(result.muscleUsage.chest).toBeGreaterThan(result.muscleUsage.legs)
    expect(result.rankedCandidates.find((candidate) => candidate.code === 'BACK_SQUAT')?.breakdown.muscleFreshness)
      .toBeGreaterThan(result.rankedCandidates.find((candidate) => candidate.code === 'BENCH_PRESS')?.breakdown.muscleFreshness ?? 0)
  })

  it('rotates recently used accessories while preserving a deterministic sparse-catalog fallback', () => {
    const first = exercise('LATERAL_RAISE_A', 'LATERAL_DELTOID', { equipment: 'BARBELL' })
    const second = exercise('LATERAL_RAISE_B', 'LATERAL_DELTOID', { equipment: 'BARBELL' })
    const inputs = baseInputs({ goal: 'muscleTone', split: 'fullBody' })
    const rotated = generateOptimDemo(
      inputs,
      context([first, second], [completedWorkout('LATERAL_RAISE_A', 2)]),
    )
    const saturatedContext = context(
      [first, second],
      [completedWorkout('LATERAL_RAISE_A', 2), completedWorkout('LATERAL_RAISE_B', 1)],
    )
    const saturated = generateOptimDemo(inputs, saturatedContext)

    expect(rotated.exercises[0].code).toBe('LATERAL_RAISE_B')
    expect(saturated.counts.generatedStrength).toBe(1)
    expect(saturated).toEqual(generateOptimDemo(inputs, saturatedContext))
  })

  it('keeps recently used primary lifts eligible for progression continuity', () => {
    const first = exercise('BENCH_PRESS_A', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Bench Press A',
      equipment: 'BARBELL',
    })
    const second = exercise('BENCH_PRESS_B', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Bench Press B',
      equipment: 'BARBELL',
    })
    const result = generateOptimDemo(
      baseInputs({ split: 'fullBody' }),
      context([first, second], [completedWorkout('BENCH_PRESS_A', 2)]),
    )

    expect(result.exercises[0].code).toBe('BENCH_PRESS_A')
  })

  it('rotates recent core work when an equivalent unused option exists', () => {
    const first = exercise('CORE_A', 'RECTUS_ABDOMINIS')
    const second = exercise('CORE_B', 'RECTUS_ABDOMINIS')
    const result = generateOptimDemo(
      baseInputs({ nonCoreCountOverride: 0, coreCountOverride: 1 }),
      context([first, second], [completedWorkout('CORE_A', 2)]),
    )

    expect(result.exercises[0].code).toBe('CORE_B')
  })

  it('counts secondary-muscle fatigue so pressing history also recovers the arms', () => {
    const compoundPress = exercise('BENCH_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL',
      secondaryMuscleCodes: ['TRICEPS_BRACHII'],
    })
    const result = generateOptimDemo(
      baseInputs(),
      context([compoundPress, legs], [completedWorkout('BENCH_PRESS')]),
    )

    expect(result.muscleUsage.chest).toBeGreaterThan(0)
    expect(result.muscleUsage.arms).toBeGreaterThan(0)
  })

  it('does not let skipped prep entries demote the first completed lift recovery impact', () => {
    const mobility = exercise('CHEST_STRETCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['STRETCHING'],
      type: 'STATIC_STRETCHES',
      measurements: ['DURATION'],
    })
    const endedAt = new Date(new Date(DATE).getTime() - 24 * 60 * 60 * 1000).toISOString()
    const set = (completed: boolean) => ({
      setNumber: 1,
      setType: 'normal' as const,
      setCompleted: completed,
      setMeasurements: [{ measurementCode: 'REPS', measurementValue: 8 }],
    })
    const prefixed = {
      workoutType: 'Log',
      workoutLogEndedAt: endedAt,
      workoutData: [
        { exerciseCode: 'CHEST_STRETCH', exerciseData: [set(true)] },
        { exerciseCode: 'UNKNOWN_EXERCISE', exerciseData: [set(true)] },
        { exerciseCode: 'BENCH_PRESS', exerciseData: [set(false)] },
        { exerciseCode: 'BENCH_PRESS', exerciseData: [set(true)] },
      ],
    } as Workout
    const direct = generateOptimDemo(
      baseInputs(),
      context([chest, mobility], [completedWorkout('BENCH_PRESS')]),
    )
    const withSkippedPrep = generateOptimDemo(
      baseInputs(),
      context([chest, mobility], [prefixed]),
    )

    expect(withSkippedPrep.muscleUsage.chest).toBe(direct.muscleUsage.chest)
  })

  it('reports every hard-filter reason instead of silently dropping exercises', () => {
    const bodyweight = exercise('PUSH_UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['BODYWEIGHT'],
      measurements: ['REPS'],
    })
    const result = generateOptimDemo(
      baseInputs({ bodyweightOnly: true, availableEquipmentCodes: [], excludedExerciseCodes: ['PUSH_UP'] }),
      context([chest, bodyweight]),
    )

    expect(result.rejectedCandidates.find((candidate) => candidate.code === 'BENCH_PRESS')?.reasons)
      .toEqual(expect.arrayContaining(['bodyweight-only mode', 'missing required equipment']))
    expect(result.rejectedCandidates.find((candidate) => candidate.code === 'PUSH_UP')?.reasons)
      .toContain('manually excluded')
  })

  it('requires every authored equipment code even when legacy data groups the setup together', () => {
    const declineSitUp = {
      ...exercise('WEIGHTED_DECLINE_SIT_UP', 'RECTUS_ABDOMINIS'),
      exerciseEquipment: { required: [['DUMBBELLS', 'DECLINE_BENCH']] },
    }
    const incompleteSetup = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['DUMBBELLS'],
        nonCoreCountOverride: 0,
        coreCountOverride: 1,
      }),
      context([declineSitUp]),
    )
    const completeSetup = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['DUMBBELLS', 'DECLINE_BENCH'],
        nonCoreCountOverride: 0,
        coreCountOverride: 1,
      }),
      context([declineSitUp]),
    )

    expect(incompleteSetup.counts.generatedCore).toBe(0)
    expect(incompleteSetup.rejectedCandidates[0].reasons).toContain('missing required equipment')
    expect(completeSetup.exercises[0].code).toBe('WEIGHTED_DECLINE_SIT_UP')
  })

  it('requires a leading-name implement only when optional catalog equipment corroborates it', () => {
    const arnoldPress = {
      ...exercise('DUMBBELL.KNEELING.ARNOLD.PRESS', 'ANTERIOR_DELTOID', {
        name: 'Dumbbell Kneeling Arnold Press',
        tags: ['BODYWEIGHT_WITH_EQUIPMENT'],
      }),
      exerciseEquipment: { required: [], optional: [['DUMBBELLS', 'YOGA_MAT']] },
    }
    const missingImplement = generateOptimDemo(
      baseInputs({ bodyweightOnly: true, availableEquipmentCodes: [] }),
      context([arnoldPress]),
    )
    const withImplement = generateOptimDemo(
      baseInputs({ bodyweightOnly: true, availableEquipmentCodes: ['DUMBBELLS'] }),
      context([arnoldPress]),
    )

    expect(missingImplement.counts.generatedStrength).toBe(0)
    expect(missingImplement.rejectedCandidates[0].reasons).toContain('missing required equipment')
    expect(withImplement.exercises[0].equipmentCodes).toEqual(['DUMBBELLS'])
  })

  it('does not limit the optional-implement guard to bodyweight-only sessions', () => {
    const kickback = {
      ...exercise('DUMBBELL-KNEELING-TRICEPS-KICKBACK', 'TRICEPS_BRACHII', {
        name: 'Dumbbell Kneeling Triceps Kickback',
      }),
      exerciseEquipment: { required: [], optional: [['DUMBBELLS', 'YOGA_MAT']] },
    }
    const result = generateOptimDemo(
      baseInputs({ availableEquipmentCodes: ['BARBELL'] }),
      context([kickback]),
    )

    expect(result.counts.generatedStrength).toBe(0)
    expect(result.rejectedCandidates[0].reasons).toContain('missing required equipment')
  })

  it('requires a non-leading implement only when its code, name token, and exact optional equipment agree', () => {
    const shoulderPress = {
      ...exercise('DUMBBELL-KNEELING-OPPOSITE-SHOULDER-PRESS', 'ANTERIOR_DELTOID', {
        name: 'Alternating Dumbbell Kneeling Shoulder Press',
      }),
      exerciseEquipment: { required: [], optional: [['YOGA_MAT', 'DUMBBELLS']] },
    }
    const missingImplement = generateOptimDemo(
      baseInputs({ availableEquipmentCodes: ['BARBELL'] }),
      context([shoulderPress]),
    )
    const withImplement = generateOptimDemo(
      baseInputs({ availableEquipmentCodes: ['DUMBBELLS'] }),
      context([shoulderPress]),
    )

    expect(missingImplement.counts.generatedStrength).toBe(0)
    expect(missingImplement.rejectedCandidates[0].reasons).toContain('missing required equipment')
    expect(withImplement.exercises[0].equipmentCodes).toEqual(['DUMBBELLS'])
  })

  it('keeps corroborated optional setup pieces optional when promoting the essential implement', () => {
    const landminePress = {
      ...exercise('LANDMINE.KNEELING.SQUEEZE.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Kneeling Landmine Squeeze Press',
      }),
      exerciseEquipment: {
        required: [],
        optional: [['BARBELL', 'YOGA_MAT', 'WEIGHT_PLATES', 'LANDMINE_ATTACHMENT']],
      },
    }
    const result = generateOptimDemo(
      baseInputs({ availableEquipmentCodes: ['LANDMINE_ATTACHMENT'] }),
      context([landminePress]),
    )

    expect(result.exercises[0].equipmentCodes).toEqual(['LANDMINE_ATTACHMENT'])
  })

  it('does not let a non-leading name token or code prefix imply equipment alone', () => {
    expect(getOptimNameImpliedEquipmentCode('Incline Dumbbell Press', 'MACHINE.INCLINE.PRESS')).toBeNull()
    expect(getOptimNameImpliedEquipmentCode('Alternating Kneeling Shoulder Press', 'DUMBBELL-KNEELING-PRESS')).toBeNull()
  })

  it('preserves exact required equipment when implement-like rows lack exact optional corroboration', () => {
    const kelsoShrug = {
      ...exercise('CABLE-SEATED-KELSO-SHRUG', 'LATISSIMUS_DORSI', { name: 'Cable Seated Kelso Shrug' }),
      exerciseEquipment: { required: [['PLATE_LOADED_ROW_MACHINE']], optional: [] },
    }
    const miniLoopBand = {
      ...exercise('RESISTANCE-BAND-REVERSE-HYPEREXTENSION', 'GLUTEUS_MAXIMUS', {
        name: 'Resistance Band Reverse Hyperextension',
      }),
      exerciseEquipment: { required: [], optional: [['MINI-LOOP_BANDS', 'EXERCISE_BALL']] },
    }

    expect(generateOptimDemo(
      baseInputs({ availableEquipmentCodes: ['PLATE_LOADED_ROW_MACHINE'] }),
      context([kelsoShrug]),
    ).exercises[0].equipmentCodes).toEqual(['PLATE_LOADED_ROW_MACHINE'])
    expect(generateOptimDemo(baseInputs(), context([miniLoopBand])).exercises[0].equipmentCodes).toEqual([])
  })

  it('rejects undeclared dedicated machines only when the catalog equipment whitelist is restricted', () => {
    const shoulderPress = {
      ...exercise('LEVER.SHOULDER.PRESS', 'ANTERIOR_DELTOID', {
        name: 'Plate-Loaded Machine Shoulder Press',
        tags: ['MACHINE', 'COMPOUND', 'PUSH_SPLIT'],
      }),
      exerciseEquipment: { required: [], optional: [] },
    }
    const catalogSentinel = exercise('CATALOG_DUMBBELL_CORE', 'RECTUS_ABDOMINIS', {
      equipment: 'DUMBBELLS',
      tags: ['ABS_CORE'],
    })
    const restricted = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL'],
        startingExerciseCodes: ['LEVER.SHOULDER.PRESS'],
      }),
      context([shoulderPress, catalogSentinel]),
    )
    const selectAll = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['DUMBBELLS'],
        startingExerciseCodes: ['LEVER.SHOULDER.PRESS'],
      }),
      context([shoulderPress, catalogSentinel]),
    )

    expect(restricted.counts.generatedStrength).toBe(0)
    expect(restricted.rejectedCandidates.find(item => item.code === 'LEVER.SHOULDER.PRESS')?.reasons)
      .toContain('machine exercise has no canonical equipment mapping')
    expect(restricted.events).toContain('Starting exercise LEVER.SHOULDER.PRESS was unavailable or filtered.')
    expect(selectAll.exercises[0].code).toBe('LEVER.SHOULDER.PRESS')
  })

  it('does not infer a dedicated machine from a stale MACHINE tag on bodyweight work', () => {
    const kneeExtension = exercise('KNEE.EXTENSION', 'QUADRICEPS', {
      name: 'Knee Extension',
      equipment: 'CHAIR',
      tags: ['MACHINE', 'BODYWEIGHT_ONLY', 'HOME_EXERCISE', 'LEGS_SPLIT'],
    })
    const catalogSentinel = exercise('CATALOG_DUMBBELL_CORE', 'RECTUS_ABDOMINIS', {
      equipment: 'DUMBBELLS',
      tags: ['ABS_CORE'],
    })
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['CHAIR'],
        bodyweightOnly: true,
        startingExerciseCodes: ['KNEE.EXTENSION'],
      }),
      context([kneeExtension, catalogSentinel]),
    )

    expect(result.exercises[0].code).toBe('KNEE.EXTENSION')
  })

  it('keeps authored equipment authoritative for structurally machine-like rows', () => {
    const authored = exercise('LEVER.SHOULDER.PRESS', 'ANTERIOR_DELTOID', {
      name: 'Plate-Loaded Machine Shoulder Press',
      equipment: 'BARBELL',
      tags: ['MACHINE', 'COMPOUND', 'PUSH_SPLIT'],
    })
    const catalogSentinel = exercise('CATALOG_DUMBBELL_CORE', 'RECTUS_ABDOMINIS', {
      equipment: 'DUMBBELLS',
      tags: ['ABS_CORE'],
    })
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL'],
        startingExerciseCodes: ['LEVER.SHOULDER.PRESS'],
      }),
      context([authored, catalogSentinel]),
    )

    expect(result.exercises[0].code).toBe('LEVER.SHOULDER.PRESS')
    expect(result.exercises[0].equipmentCodes).toEqual(['BARBELL'])
  })

  it('keeps a forced SkiErg cardio stage out of profiles without its exact machine', () => {
    const skiErg = {
      ...exercise('SKI.ERGOMETER', 'LATISSIMUS_DORSI', {
        name: 'Machine Cardio Ski',
        tags: ['MACHINE', 'CARDIO', 'ENDURANCE'],
        type: 'DISTANCE_DURATION',
        measurements: ['DISTANCE', 'DURATION'],
      }),
      exerciseEquipment: { required: [], optional: [['CARDIO_SKI_MACHINE']] },
    }
    const restricted = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['DUMBBELLS'],
        cardioEnabled: true,
        selectedCardioExerciseCodes: ['SKI.ERGOMETER'],
      }),
      context([skiErg]),
    )
    const withMachine = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['CARDIO_SKI_MACHINE'],
        cardioEnabled: true,
        selectedCardioExerciseCodes: ['SKI.ERGOMETER'],
      }),
      context([skiErg]),
    )

    expect(restricted.exercises.some(item => item.code === 'SKI.ERGOMETER')).toBe(false)
    expect(withMachine.exercises.find(item => item.code === 'SKI.ERGOMETER')?.equipmentCodes)
      .toEqual(['CARDIO_SKI_MACHINE'])
  })

  it('limits SkiErg inference to corroborated ergometer codes, not generic ski or optional-prop rows', () => {
    expect(getOptimNameImpliedEquipmentCode('Machine Cardio Ski', 'SKI.ERGOMETER')).toBe('CARDIO_SKI_MACHINE')
    expect(getOptimNameImpliedEquipmentCode('Ski Jumps', 'SKI-JUMPS')).toBeNull()
    expect(getOptimNameImpliedEquipmentCode('Alternating Forward Toe-Tap', 'ALTERNATING-FORWARD-TOE-TAP')).toBeNull()
  })

  it('preserves uncorroborated names and explicit name-equipment contradictions', () => {
    const uncorroborated = exercise('DUMBBELL_FRONT_RAISE', 'ANTERIOR_DELTOID', {
      name: 'Dumbbell Front Raise',
    })
    const contradictory = {
      ...exercise('BARBELL.PRONE.INCLINE.CURL', 'BICEPS_BRACHII', {
        name: 'EZ-Bar Incline Curl',
        equipment: 'BARBELL',
      }),
      exerciseEquipment: { required: [['BARBELL']], optional: [] },
    }

    expect(generateOptimDemo(baseInputs(), context([uncorroborated])).exercises[0].equipmentCodes).toEqual([])
    expect(generateOptimDemo(baseInputs(), context([contradictory])).exercises[0].equipmentCodes).toEqual(['BARBELL'])
    expect(getOptimNameImpliedEquipmentCode('Incline Dumbbell Press')).toBeNull()
  })

  it('uses the band scheme when optional catalog evidence promotes a leading band implement', () => {
    const bandBridge = {
      ...exercise('RESISTANCE-BAND.GLUTE-BRIDGE.SIDE-TAP', 'GLUTEUS_MAXIMUS', {
        name: 'Resistance Band Glute Bridge Side Tap',
      }),
      exerciseEquipment: { required: [], optional: [['RESISTANCE_BANDS', 'YOGA_MAT']] },
    }
    const result = generateOptimDemo(
      baseInputs({ availableEquipmentCodes: ['RESISTANCE_BANDS'] }),
      context([bandBridge]),
    ).exercises[0]

    expect(result.equipmentCodes).toEqual(['RESISTANCE_BANDS'])
    expect(result.schemeSource).toBe('band 3x8')
  })

  it('reports injury labels without covertly changing workout selection', () => {
    const source = context([chest, legs])
    const baseline = generateOptimDemo(baseInputs(), source)
    const withInjuries = generateOptimDemo(baseInputs(), {
      ...source,
      injuries: ['ACL Tear', 'Custom limitation'],
    })

    expect(withInjuries.exercises).toEqual(baseline.exercises)
    expect(withInjuries.rankedCandidates).toEqual(baseline.rankedCandidates)
    expect(withInjuries.rejectedCandidates).toEqual(baseline.rejectedCandidates)
    expect(withInjuries.events).toContain(
      'Profile injuries/limitations are visible (ACL Tear, Custom limitation) but are not auto-mapped; use manual exercise exclusions or muscle selection when appropriate.',
    )
    expect(baseline.dataNotes).toContain('No profile injury/limitation labels are available.')
  })

  it('uses recovered metadata for experience and Olympic-suitability filters', () => {
    const chinUp = exercise('CHIN-UP', 'LATISSIMUS_DORSI', {
      name: 'Chin Up',
      tags: ['BODYWEIGHT'],
      measurements: ['REPS'],
    })
    const curl = exercise('DUMBBELL.ALTERNATE.BICEPS.CURL', 'BICEPS_BRACHII', {
      name: 'Dumbbell Bicep Curl',
      equipment: 'BARBELL',
    })
    const powerClean = exercise('BARBELL.POWER.CLEAN', 'QUADRICEPS', {
      name: 'Power Clean',
      equipment: 'BARBELL',
      tags: ['OLYMPIC_LIFTING'],
    })
    const beginner = generateOptimDemo(baseInputs({ experience: 'beginner' }), context([chinUp]))
    const olympic = generateOptimDemo(baseInputs({ goal: 'olympic' }), context([powerClean, curl]))

    expect(beginner.rejectedCandidates[0].reasons).toContain('experience level')
    expect(olympic.rejectedCandidates.find((candidate) => candidate.code === 'DUMBBELL.ALTERNATE.BICEPS.CURL')?.reasons)
      .toContain('low Olympic suitability')
    expect(olympic.exercises[0].code).toBe('BARBELL.POWER.CLEAN')
  })

  it('marks recovered unilateral prescriptions per side without mutating their numeric reps', () => {
    const kickback = exercise('DUMBBELL.KICKBACK', 'TRICEPS_BRACHII', {
      name: 'Tricep Kickback',
      equipment: 'DUMBBELLS',
    })
    const result = generateOptimDemo(
      baseInputs({ availableEquipmentCodes: ['DUMBBELLS'] }),
      context([kickback]),
    )
    const generated = result.exercises[0]

    expect(generated.isUnilateral).toBe(true)
    expect(generated.sets.filter((set) => set.setType === 'normal').map((set) => set.reps))
      .toEqual([10, 10, 10])
    expect(generated.trace).toContain(
      'Recovered unilateral flag; rep-based prescriptions and loads are displayed per side without changing their stored values.',
    )
  })

  it('uses a strict demographic warm start when no direct or reference history exists', () => {
    const deadlift = exercise('BARBELL.DEADLIFT', 'HAMSTRINGS', {
      name: 'Barbell Deadlift',
      equipment: 'BARBELL',
    })
    const result = generateOptimDemo(
      baseInputs({ startingExerciseCodes: ['BARBELL.DEADLIFT'] }),
      context([deadlift], [], { gender: 'Male', ageYears: 40 }),
    ).exercises[0]

    expect(result.theoreticalMaxKg).toBe(61.1)
    expect(result.sets.some((set) => set.setType === 'normal' && set.weightKg != null)).toBe(true)
    const workingWeight = result.sets.find((set) => set.setType === 'normal')?.weightKg ?? 0
    expect(result.sets.filter((set) => set.setType === 'warmup')
      .every((set) => (set.weightKg ?? 0) < workingWeight)).toBe(true)
    expect(result.trace).toContain(
      'Recovered demographic warm-start max 61.1 kg for male/general/intermediate/age 40; used only after direct and relationship history were unavailable',
    )
  })

  it('gates reviewed exact-source product warm starts without changing omitted inputs', () => {
    // Why: product-only source review may improve first-use guidance, but the
    // debug engine remains a backwards-compatible comparison baseline.
    const hangSnatch = exercise('BARBELL.HANG.SNATCH', 'HAMSTRINGS', {
      name: 'Hang Snatch',
      equipment: 'BARBELL',
      tags: ['OLYMPIC_LIFTING'],
    })
    const inputs = baseInputs({
      startingExerciseCodes: ['BARBELL.HANG.SNATCH'],
      nonCoreCountOverride: 1,
      coreCountOverride: 0,
    })
    const profileContext = context([hangSnatch], [], { gender: 'Male', ageYears: 40 })
    const omitted = generateOptimDemo(inputs, profileContext)
    const disabled = generateOptimDemo({ ...inputs, productWarmStartOverlayEnabled: false }, profileContext)
    const enabled = generateOptimDemo({ ...inputs, productWarmStartOverlayEnabled: true }, profileContext)

    expect(disabled).toEqual(omitted)
    expect(omitted.exercises[0].theoreticalMaxKg).toBeNull()
    expect(enabled.exercises[0].theoreticalMaxKg).toBe(17)
    expect(enabled.exercises[0].trace).toContainEqual(expect.stringContaining(
      'Reviewed product demographic warm-start max 17 kg',
    ))
  })

  it('uses the identity-pinned generic barbell Hip Thrust source only in the product seam', () => {
    // Why: recovered bodyweight Hip Thrust rows conflict with the live loaded
    // exercise, while row 188 is exact weighted evidence for the generic lift.
    const hipThrust = exercise('HIP.THRUSTS', 'GLUTEUS_MAXIMUS', {
      name: 'Hip Thrust',
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'PLATE_LOADED', 'LEGS_SPLIT'],
    })
    const inputs = baseInputs({
      availableEquipmentCodes: ['BARBELL'],
      startingExerciseCodes: ['HIP.THRUSTS'],
      nonCoreCountOverride: 1,
      coreCountOverride: 0,
    })
    const profileContext = context([hipThrust], [], { gender: 'Male', ageYears: 40 })
    const omitted = generateOptimDemo(inputs, profileContext)
    const enabled = generateOptimDemo({ ...inputs, productWarmStartOverlayEnabled: true }, profileContext)

    expect(omitted.exercises[0].theoreticalMaxKg).toBeNull()
    expect(enabled.exercises[0].theoreticalMaxKg).toBe(29.2)
    expect(enabled.exercises[0].sets.some(set => set.setType === 'normal' && set.weightKg != null)).toBe(true)
    expect(enabled.exercises[0].trace).toContainEqual(expect.stringContaining(
      'Reviewed product demographic warm-start max 29.2 kg',
    ))
  })

  it('does not apply generic Hip Thrust loads to the staggered-stance product exercise', () => {
    // Why: the recovered mapping remains available to legacy comparisons, but
    // product users must not receive generic bilateral loads for a distinct variant.
    const staggeredHipThrust = exercise('BARBELL-STAGGERED-STANCE-HIP-THRUST', 'GLUTEUS_MAXIMUS', {
      name: 'Barbell Staggered-Stance Hip Thrust',
      equipment: 'BARBELL',
    })
    const inputs = baseInputs({
      startingExerciseCodes: ['BARBELL-STAGGERED-STANCE-HIP-THRUST'],
      nonCoreCountOverride: 1,
      coreCountOverride: 0,
    })
    const profileContext = context([staggeredHipThrust], [], { gender: 'Male', ageYears: 40 })
    const omitted = generateOptimDemo(inputs, profileContext)
    const enabled = generateOptimDemo({ ...inputs, productWarmStartOverlayEnabled: true }, profileContext)

    expect(omitted.exercises[0].theoreticalMaxKg).toBe(29.2)
    expect(enabled.exercises[0].theoreticalMaxKg).toBeNull()
  })

  it('gates mismatched legacy implement exclusions to the product seam', () => {
    // Why: the recovered mapping remains available for fidelity comparisons,
    // but a Smith-machine source cannot safely seed a free-barbell user plan.
    const stiffLegDeadlift = exercise('BARBELL.STIFF-LEGGED-DEADLIFT', 'HAMSTRINGS', {
      name: 'Barbell Stiff Legged Deadlift',
      equipment: 'BARBELL',
    })
    const inputs = baseInputs({
      startingExerciseCodes: ['BARBELL.STIFF-LEGGED-DEADLIFT'],
      nonCoreCountOverride: 1,
      coreCountOverride: 0,
    })
    const profileContext = context([stiffLegDeadlift], [], { gender: 'Male', ageYears: 40 })
    const omitted = generateOptimDemo(inputs, profileContext)
    const disabled = generateOptimDemo({ ...inputs, productWarmStartOverlayEnabled: false }, profileContext)
    const enabled = generateOptimDemo({ ...inputs, productWarmStartOverlayEnabled: true }, profileContext)

    expect(disabled).toEqual(omitted)
    expect(omitted.exercises[0].theoreticalMaxKg).toBe(41.9)
    expect(enabled.exercises[0].theoreticalMaxKg).toBeNull()
  })

  it('derives a product-only cold start from one reviewed relationship hop', () => {
    // Why: a reviewed target ratio and reviewed reference demographic cell are
    // already sufficient evidence; requiring a logged reference workout leaves
    // safe first-use guidance unused. The new path must remain opt-in.
    const target = exercise('DUMBBELL-SUMO-DEADLIFT', 'HAMSTRINGS', {
      name: 'Dumbbell Sumo Deadlift',
      equipment: 'DUMBBELLS',
    })
    const reference = exercise('BARBELL.HIGH.BAR.SQUAT', 'QUADRICEPS', {
      name: 'Barbell High Bar Squat',
      equipment: 'BARBELL',
    })
    const profile = { gender: 'Male', ageYears: 40 }
    const inputs = baseInputs({
      availableEquipmentCodes: ['DUMBBELLS'],
      executableLoadsEnabled: true,
      startingExerciseCodes: [target.exerciseCode!],
    })
    const omitted = generateOptimDemo(inputs, context([target], [], profile))
    const disabled = generateOptimDemo(
      { ...inputs, relationshipWarmStartEnabled: false },
      context([target], [], profile),
    )
    const enabled = generateOptimDemo(
      { ...inputs, relationshipWarmStartEnabled: true },
      context([target], [], profile),
    ).exercises[0]
    const referenceMax = generateOptimDemo(
      baseInputs({ startingExerciseCodes: [reference.exerciseCode!] }),
      context([reference], [], profile),
    ).exercises[0].theoreticalMaxKg ?? 0

    expect(disabled).toEqual(omitted)
    expect(omitted.exercises[0].theoreticalMaxKg).toBeNull()
    expect(enabled.theoreticalMaxKg).toBeCloseTo(referenceMax * 0.252376097, 0)
    expect(enabled.sets.some((set) => set.setType === 'normal' && set.weightKg != null)).toBe(true)
    expect(enabled.trace).toContainEqual(expect.stringContaining(
      'Derived demographic warm-start max',
    ))
  })

  it('keeps demographic differences explicit instead of averaging first-use loads', () => {
    const deadlift = exercise('BARBELL.DEADLIFT', 'HAMSTRINGS', { equipment: 'BARBELL' })
    const inputs = baseInputs({ startingExerciseCodes: ['BARBELL.DEADLIFT'] })
    const female = generateOptimDemo(
      inputs,
      context([deadlift], [], { gender: 'Female', ageYears: 40 }),
    ).exercises[0]
    const olderMale = generateOptimDemo(
      inputs,
      context([deadlift], [], { gender: 'Male', ageYears: 60 }),
    ).exercises[0]

    expect(female.theoreticalMaxKg).toBe(26.5)
    expect(olderMale.theoreticalMaxKg).toBe(47.6)
  })

  it('leaves demographic warm starts unset for circuit and band prescriptions', () => {
    const bandDeadlift = exercise('BARBELL.DEADLIFT', 'HAMSTRINGS', { equipment: 'RESISTANCE_BAND' })
    const barbellDeadlift = exercise('BARBELL.DEADLIFT', 'HAMSTRINGS', { equipment: 'BARBELL' })
    const profile = { gender: 'Male', ageYears: 40 }
    const band = generateOptimDemo(
      baseInputs({ availableEquipmentCodes: ['RESISTANCE_BAND'], startingExerciseCodes: ['BARBELL.DEADLIFT'] }),
      context([bandDeadlift], [], profile),
    ).exercises[0]
    const circuit = generateOptimDemo(
      baseInputs({ circuitsEnabled: true, startingExerciseCodes: ['BARBELL.DEADLIFT'] }),
      context([barbellDeadlift], [], profile),
    ).exercises[0]

    expect(band.theoreticalMaxKg).toBeNull()
    expect(circuit.theoreticalMaxKg).toBeNull()
    expect(band.sets.every((set) => set.weightKg == null)).toBe(true)
    expect(circuit.sets.every((set) => set.weightKg == null)).toBe(true)
  })

  it('uses warm-start feasibility for circuit selection without exposing the warm-start load', () => {
    // Why: circuit mode may intentionally hide a first-use load, but that must
    // not make an unloadable plate exercise look safer than its fixed-weight
    // alternative when the generated workout contains no actual circuit.
    const dumbbellSkullcrusher = exercise(
      'DUMBBELL.LYING.FLOOR.SKULLCRUSHER',
      'TRICEPS_BRACHII',
      {
        name: 'Dumbbell Skullcrusher',
        equipment: 'DUMBBELLS',
        tags: ['BODYWEIGHT_WITH_EQUIPMENT', 'HOME_EXERCISE', 'ISOMETRIC', 'PUSH_SPLIT'],
        popularity: 7,
      },
    )
    const plateLoadedSkullcrusher = {
      ...exercise(
        'EZ-BARBELL.LYING-TRICEPS-EXTENSION',
        'TRICEPS_BRACHII',
        {
          name: 'EZ-Bar Skullcrusher',
          equipment: 'EZ_CURL_BAR',
          tags: ['COMPOUND', 'GOOD_WARMUP', 'PLATE_LOADED', 'PUSH_SPLIT'],
          popularity: 7,
        },
      ),
      exerciseEquipment: { required: [['EXERCISE_BENCH'], ['EZ_CURL_BAR']] },
      isPlateLoaded: true,
    } as ExerciseListItem
    const source = context(
      [dumbbellSkullcrusher, plateLoadedSkullcrusher],
      [],
      { gender: 'Male', ageYears: 30 },
    )
    const inputs = baseInputs({
      availableEquipmentCodes: ['DUMBBELLS', 'EXERCISE_BENCH', 'EZ_CURL_BAR'],
      executableLoadsEnabled: true,
      experience: 'beginner',
      goal: 'strength',
      split: 'push',
      nonCoreCountOverride: 1,
      seed: 0,
    })
    const ungrouped = generateOptimDemo(inputs, source)
    const circuit = generateOptimDemo({ ...inputs, circuitsEnabled: true }, source)

    expect(ungrouped.exercises[0].code).toBe('DUMBBELL.LYING.FLOOR.SKULLCRUSHER')
    expect(circuit.exercises.map((item) => item.code)).toEqual(ungrouped.exercises.map((item) => item.code))
    expect(circuit.exercises[0].groupId).toBeNull()
    expect(circuit.exercises[0].theoreticalMaxKg).toBeNull()
    expect(circuit.exercises[0].sets.every((set) => set.weightKg == null)).toBe(true)
  })

  it('warm-starts an untried lift from one hop of recovered reference history', () => {
    const romanianDeadlift = exercise('BARBELL.ROMANIAN.DEADLIFT', 'HAMSTRINGS', {
      name: 'Romanian Deadlift',
      equipment: 'BARBELL',
    })
    const deadlift = exercise('BARBELL.DEADLIFT', 'HAMSTRINGS', {
      name: 'Barbell Deadlift',
      equipment: 'BARBELL',
    })
    const workouts = [1, 7, 14].map((daysAgo) =>
      completedWorkoutWithLoad('BARBELL.DEADLIFT', daysAgo, 100))
    const reference = generateOptimDemo(
      baseInputs({ seed: 1, startingExerciseCodes: ['BARBELL.DEADLIFT'] }),
      context([deadlift], workouts),
    ).exercises[0]
    const derived = generateOptimDemo(
      baseInputs({ seed: 1, startingExerciseCodes: ['BARBELL.ROMANIAN.DEADLIFT'] }),
      context([romanianDeadlift, deadlift], workouts, { gender: 'Male', ageYears: 40 }),
    ).exercises[0]

    expect(derived.theoreticalMaxKg)
      .toBeCloseTo((reference.theoreticalMaxKg ?? 0) * 0.837877465, 0)
    expect(derived.sets.some((set) => set.weightKg != null)).toBe(true)
    const workingWeight = derived.sets.find((set) => set.setType === 'normal')?.weightKg ?? 0
    const warmups = derived.sets.filter((set) => set.setType === 'warmup')
    expect(warmups.length).toBeGreaterThan(0)
    expect(warmups.every((set) => (set.weightKg ?? 0) < workingWeight)).toBe(true)
    expect(derived.trace.some((line) =>
      line.includes('from smoothed BARBELL.DEADLIFT max') &&
      line.includes('recovered relative weight 0.838'))).toBe(true)
  })

  it('keeps recovered relationship loads in the target per-side logging unit', () => {
    const dumbbellBench = exercise('DUMBBELL.BENCH.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Dumbbell Bench Press',
      equipment: 'DUMBBELLS',
      isWeightPerSide: true,
    })
    const wideBench = exercise('BARBELL.WIDE.BENCH.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Barbell Wide Bench Press',
      equipment: 'BARBELL',
    })
    const workouts = [1, 7, 14].map((daysAgo) =>
      completedWorkoutWithLoad('BARBELL.WIDE.BENCH.PRESS', daysAgo, 100))
    const reference = generateOptimDemo(
      baseInputs({ seed: 1, startingExerciseCodes: ['BARBELL.WIDE.BENCH.PRESS'] }),
      context([wideBench], workouts),
    ).exercises[0]
    const derived = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL', 'DUMBBELLS'],
        seed: 1,
        startingExerciseCodes: ['DUMBBELL.BENCH.PRESS'],
      }),
      context([dumbbellBench, wideBench], workouts),
    ).exercises[0]

    expect(derived.isWeightPerSide).toBe(true)
    expect(derived.theoreticalMaxKg)
      .toBeCloseTo((reference.theoreticalMaxKg ?? 0) * 0.374420466, 0)
    expect(derived.theoreticalMaxKg)
      .not.toBeCloseTo((reference.theoreticalMaxKg ?? 0) * 0.374420466 * 2, 0)
    expect(derived.trace).toContain(
      'Catalog weight-per-side flag; every weight value is per side and remains numerically unchanged.',
    )
  })

  it('keeps direct load history authoritative over a recovered relationship', () => {
    const romanianDeadlift = exercise('BARBELL.ROMANIAN.DEADLIFT', 'HAMSTRINGS', {
      name: 'Romanian Deadlift',
      equipment: 'BARBELL',
    })
    const deadlift = exercise('BARBELL.DEADLIFT', 'HAMSTRINGS', {
      name: 'Barbell Deadlift',
      equipment: 'BARBELL',
    })
    const result = generateOptimDemo(
      baseInputs({ seed: 1, startingExerciseCodes: ['BARBELL.ROMANIAN.DEADLIFT'] }),
      context([romanianDeadlift, deadlift], [
        ...[1, 7, 14].map((daysAgo) =>
          completedWorkoutWithLoad('BARBELL.ROMANIAN.DEADLIFT', daysAgo, 50)),
        ...[1, 7, 14].map((daysAgo) =>
          completedWorkoutWithLoad('BARBELL.DEADLIFT', daysAgo, 200)),
      ], { gender: 'Male', ageYears: 40 }),
    ).exercises[0]

    expect(result.theoreticalMaxKg).toBeLessThan(100)
    expect(result.trace.some((line) => line.startsWith('Derived historical max'))).toBe(false)
    expect(result.trace.some((line) => line.startsWith('Smoothed historical max'))).toBe(true)
  })

  it('does not recursively chain recovered relationships', () => {
    const reverseCurl = exercise('BARBELL.REVERSE.CURL', 'BICEPS_BRACHII', {
      equipment: 'BARBELL',
    })
    const curl = exercise('BARBELL.CURL', 'BICEPS_BRACHII', {
      equipment: 'BARBELL',
    })
    const pulldown = exercise('CABLE.PULLDOWN', 'LATISSIMUS_DORSI', {
      equipment: 'BARBELL',
    })
    const result = generateOptimDemo(
      baseInputs({ seed: 1, startingExerciseCodes: ['BARBELL.REVERSE.CURL'] }),
      context([reverseCurl, curl, pulldown], [1, 7, 14].map((daysAgo) =>
        completedWorkoutWithLoad('CABLE.PULLDOWN', daysAgo, 100))),
    ).exercises[0]

    expect(result.theoreticalMaxKg).toBeNull()
    expect(result.sets.every((set) => set.weightKg == null)).toBe(true)
  })

  it('never turns rep-only depth into max effort at a relationship-derived load', () => {
    const romanianDeadlift = exercise('BARBELL.ROMANIAN.DEADLIFT', 'HAMSTRINGS', {
      name: 'Romanian Deadlift',
      equipment: 'BARBELL',
    })
    const deadlift = exercise('BARBELL.DEADLIFT', 'HAMSTRINGS', {
      name: 'Barbell Deadlift',
      equipment: 'BARBELL',
    })
    const result = generateOptimDemo(
      baseInputs({ seed: 0, startingExerciseCodes: ['BARBELL.ROMANIAN.DEADLIFT'] }),
      context([romanianDeadlift, deadlift], [
        ...[1, 7, 14].map((daysAgo) =>
          completedBodyweightWorkout('BARBELL.ROMANIAN.DEADLIFT', daysAgo, 8)),
        ...[1, 7, 14].map((daysAgo) =>
          completedWorkoutWithLoad('BARBELL.DEADLIFT', daysAgo, 100)),
      ], { gender: 'Male', ageYears: 40 }),
    ).exercises[0]

    expect(result.maxEffort).toBe(true)
    expect(result.theoreticalMaxKg).toBeNull()
    expect(result.sets.every((set) => set.weightKg == null)).toBe(true)
    expect(result.trace.some((line) => line.startsWith('Derived historical max'))).toBe(false)
  })

  it('does not derive loads for bodyweight or assisted relationship sources', () => {
    const kneelingPushUp = exercise('KNEELING.PUSH-UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['BODYWEIGHT_ONLY'],
      measurements: ['REPS'],
    })
    const pushUp = exercise('PUSH-UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['BODYWEIGHT_ONLY'],
      measurements: ['REPS'],
    })
    const assistedPullUp = exercise(
      'ASSISTED.PARALLEL.CLOSE.GRIP.PULL.UP',
      'LATISSIMUS_DORSI',
      { equipment: 'BARBELL' },
    )
    const bench = exercise('BARBELL.WIDE.BENCH.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL',
    })
    const bodyweight = generateOptimDemo(
      baseInputs({ seed: 1, startingExerciseCodes: ['KNEELING.PUSH-UP'] }),
      context([kneelingPushUp, pushUp], [1, 7, 14].map((daysAgo) =>
        completedWorkoutWithLoad('PUSH-UP', daysAgo, 100))),
    ).exercises[0]
    const assisted = generateOptimDemo(
      baseInputs({ seed: 1, startingExerciseCodes: ['ASSISTED.PARALLEL.CLOSE.GRIP.PULL.UP'] }),
      context([assistedPullUp, bench], [1, 7, 14].map((daysAgo) =>
        completedWorkoutWithLoad('BARBELL.WIDE.BENCH.PRESS', daysAgo, 100))),
    ).exercises[0]

    expect(bodyweight.theoreticalMaxKg).toBeNull()
    expect(bodyweight.sets.every((set) => set.weightKg == null)).toBe(true)
    expect(assisted.theoreticalMaxKg).toBeNull()
    expect(assisted.sets.every((set) => set.weightKg == null)).toBe(true)
  })

  it('does not derive from reference history after the requested generation date', () => {
    const romanianDeadlift = exercise('BARBELL.ROMANIAN.DEADLIFT', 'HAMSTRINGS', {
      equipment: 'BARBELL',
    })
    const deadlift = exercise('BARBELL.DEADLIFT', 'HAMSTRINGS', {
      equipment: 'BARBELL',
    })
    const result = generateOptimDemo(
      baseInputs({ seed: 1, startingExerciseCodes: ['BARBELL.ROMANIAN.DEADLIFT'] }),
      context([romanianDeadlift, deadlift], [
        completedWorkoutWithLoad('BARBELL.DEADLIFT', -1, 100),
      ]),
    ).exercises[0]

    expect(result.theoreticalMaxKg).toBeNull()
    expect(result.sets.every((set) => set.weightKg == null)).toBe(true)
  })

  it('keeps unmapped inverted-skill exercises out of beginner workouts', () => {
    const handstand = exercise('HANDSTAND.HOLD.ON.WALL', 'ANTERIOR_DELTOID', {
      name: 'Handstand Hold Wall',
      tags: ['BODYWEIGHT_ONLY', 'CALISTHENICS', 'BALANCE'],
      type: 'DURATION',
      measurements: ['DURATION'],
    })
    const beginner = generateOptimDemo(
      baseInputs({ experience: 'beginner', bodyweightOnly: true, availableEquipmentCodes: [] }),
      context([handstand]),
    )
    const intermediate = generateOptimDemo(
      baseInputs({ experience: 'intermediate', bodyweightOnly: true, availableEquipmentCodes: [] }),
      context([handstand]),
    )

    expect(beginner.exercises).toHaveLength(0)
    expect(beginner.rejectedCandidates[0].reasons).toContain('experience level')
    expect(intermediate.exercises[0].code).toBe('HANDSTAND.HOLD.ON.WALL')
  })

  it('does not infer an unmapped authored Olympic lift is beginner-safe', () => {
    const powerClean = exercise('POWER.CLEAN', 'QUADRICEPS', {
      name: 'Power-Clean',
      equipment: 'BARBELL',
      tags: ['OLYMPIC_LIFTING', 'COMPOUND'],
    })
    const beginner = generateOptimDemo(
      baseInputs({ experience: 'beginner', goal: 'olympic' }),
      context([powerClean]),
    )
    const intermediate = generateOptimDemo(
      baseInputs({ experience: 'intermediate', goal: 'olympic' }),
      context([powerClean]),
    )

    expect(beginner.exercises).toHaveLength(0)
    expect(beginner.foundationFallback).toBe(true)
    expect(beginner.rejectedCandidates[0].reasons).toContain('experience level')
    expect(beginner.events).toContainEqual(expect.stringContaining('strength-foundation session'))
    expect(intermediate.foundationFallback).toBe(false)
    expect(intermediate.exercises[0].code).toBe('POWER.CLEAN')
  })

  it('builds a strength foundation when beginner safety leaves the strict Olympic pool empty', () => {
    const powerClean = exercise('POWER.CLEAN', 'QUADRICEPS', {
      name: 'Power-Clean',
      equipment: 'BARBELL',
      tags: ['OLYMPIC_LIFTING', 'COMPOUND'],
    })
    const row = exercise('BARBELL_ROW', 'LATISSIMUS_DORSI', {
      name: 'Barbell Row',
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'PULL_SPLIT'],
    })
    const result = generateOptimDemo(
      baseInputs({ goal: 'olympic', experience: 'beginner', split: 'fullBody', nonCoreCountOverride: 2 }),
      context([powerClean, legs, row]),
    )

    expect(result.foundationFallback).toBe(true)
    expect(result.exercises.filter(item => item.phase === 'strength')).toHaveLength(2)
    expect(result.exercises.some(item => item.code === 'POWER.CLEAN')).toBe(false)
    expect(result.rejectedCandidates.find(item => item.code === 'POWER.CLEAN')?.reasons)
      .toContain('experience level')
    expect(result.exercises.filter(item => item.phase === 'strength').every(item =>
      item.schemeSource.startsWith('strengthTier'))).toBe(true)
    expect(result.exercises.filter(item => item.phase === 'strength').every(item =>
      item.trace.some(line => line.includes('Beginner Olympic foundation')))).toBe(true)
  })

  it('keeps split and manual exclusions active inside the beginner Olympic foundation', () => {
    const powerClean = exercise('POWER.CLEAN', 'QUADRICEPS', {
      name: 'Power-Clean',
      equipment: 'BARBELL',
      tags: ['OLYMPIC_LIFTING', 'COMPOUND'],
    })
    const row = exercise('BARBELL_ROW', 'LATISSIMUS_DORSI', {
      name: 'Barbell Row',
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'PULL_SPLIT'],
    })
    const curl = exercise('BARBELL_CURL', 'BICEPS_BRACHII', { equipment: 'BARBELL' })
    const result = generateOptimDemo(
      baseInputs({
        goal: 'olympic',
        experience: 'beginner',
        split: 'pull',
        excludedExerciseCodes: ['BARBELL_ROW'],
      }),
      context([powerClean, row, curl, chest]),
    )

    expect(result.foundationFallback).toBe(true)
    expect(result.exercises[0].code).toBe('BARBELL_CURL')
    expect(result.rejectedCandidates.find(item => item.code === 'BARBELL_ROW')?.reasons)
      .toContain('manually excluded')
    expect(result.rejectedCandidates.find(item => item.code === 'BENCH_PRESS')?.reasons)
      .toContain('outside selected split')
  })

  it('distinguishes biceps from triceps for push and pull splits', () => {
    const curl = exercise('BARBELL_CURL', 'BICEPS_BRACHII', { equipment: 'BARBELL' })
    const pushdown = exercise('TRICEPS_PUSHDOWN', 'TRICEPS_BRACHII', { equipment: 'BARBELL' })
    const pushResult = generateOptimDemo(
      baseInputs({ split: 'push' }),
      context([curl, pushdown]),
    )
    const pullResult = generateOptimDemo(
      baseInputs({ split: 'pull' }),
      context([curl, pushdown]),
    )

    expect(pushResult.exercises[0].code).toBe('TRICEPS_PUSHDOWN')
    expect(pushResult.rejectedCandidates.find((candidate) => candidate.code === 'BARBELL_CURL')?.reasons)
      .toContain('outside selected split')
    expect(pullResult.exercises[0].code).toBe('BARBELL_CURL')
    expect(pullResult.rejectedCandidates.find((candidate) => candidate.code === 'TRICEPS_PUSHDOWN')?.reasons)
      .toContain('outside selected split')
  })

  it('does not let a bad authored split tag override the primary muscle bucket', () => {
    const mislabeled = exercise('FORWARD_PUNCH_LUNGE', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL',
      tags: ['LEGS_SPLIT', 'COMPOUND'],
      popularity: 10,
    })
    const result = generateOptimDemo(
      baseInputs({ split: 'lower' }),
      context([mislabeled, legs]),
    )

    expect(result.exercises[0].code).toBe('BACK_SQUAT')
    expect(result.rejectedCandidates.find((item) => item.code === 'FORWARD_PUNCH_LUNGE')?.reasons)
      .toContain('outside selected split')
  })

  it('lets an authored pull tag place rear-delt shoulder work on pull day', () => {
    const rearDelt = exercise('REAR_DELT_RAISE', 'POSTERIOR_DELTOID', {
      equipment: 'BARBELL',
      tags: ['PULL_SPLIT'],
    })
    const result = generateOptimDemo(
      baseInputs({ split: 'pull' }),
      context([rearDelt]),
    )

    expect(result.exercises[0].code).toBe('REAR_DELT_RAISE')
    expect(result.exercises[0].primaryBucket).toBe('shoulders')
  })

  it.each([
    { goal: 'powerlifting' as const, split: 'pull' as const, code: 'TEST.DEADLIFT', name: 'Test Deadlift', tag: 'POWERLIFTING', authoredSplit: 'PULL_SPLIT' },
    { goal: 'olympic' as const, split: 'push' as const, code: 'TEST.JERK', name: 'Test Jerk', tag: 'OLYMPIC_LIFTING', authoredSplit: 'PUSH_SPLIT' },
  ])('trusts authored full-body split tags inside the $goal goal pool', ({ goal, split, code, name, tag, authoredSplit }) => {
    const fullBodyLift = exercise(code, 'QUADRICEPS', {
      name,
      equipment: 'BARBELL',
      tags: [tag, authoredSplit, 'COMPOUND'],
    })
    const result = generateOptimDemo(
      baseInputs({ goal, split, experience: 'intermediate' }),
      context([fullBodyLift]),
    )

    expect(result.exercises[0].code).toBe(code)
    expect(result.rejectedCandidates.find(item => item.code === code)).toBeUndefined()
  })

  it('keeps authored full-body pull tags bucket-gated outside specialized goals', () => {
    const deadlift = exercise('TEST.DEADLIFT', 'QUADRICEPS', {
      name: 'Test Deadlift',
      equipment: 'BARBELL',
      tags: ['POWERLIFTING', 'PULL_SPLIT', 'COMPOUND'],
    })
    const result = generateOptimDemo(
      baseInputs({ goal: 'general', split: 'pull' }),
      context([deadlift]),
    )

    expect(result.exercises).toHaveLength(0)
    expect(result.rejectedCandidates[0].reasons).toContain('outside selected split')
  })

  it('uses the date to select an exact recovered scheme-table index', () => {
    const first = generateOptimDemo(baseInputs({ generationDateIso: DATE }), context([chest]))
    const next = generateOptimDemo(
      baseInputs({ generationDateIso: '2026-07-16T12:00:00.000Z' }),
      context([chest]),
    )

    expect(first.exercises[0].schemeSource).toMatch(/^generalFitnessEarlyTierSetsReps\[\d+\]$/)
    expect(next.exercises[0].schemeSource).not.toBe(first.exercises[0].schemeSource)
  })

  it('bounds target-beating capability anticipation to seven percent above the prescribed max', () => {
    // Why: the observed max already includes the user's overperformance. The
    // capability multiplier may anticipate a little more, but must not turn a
    // single target beat into an unbounded closed-loop escalation.
    const result = generateOptimDemo(
      baseInputs({ seed: 1 }),
      context([chest], [1, 7, 14].map((daysAgo) =>
        completedWorkoutWithLoad('BENCH_PRESS', daysAgo, 84, 80))),
    )
    const prescribedMax = ((1 + 3 * 0.018) * 80) / (1.0278 - 5 * 0.0278)

    expect(result.exercises[0].theoreticalMaxKg).toBeCloseTo(prescribedMax * 1.07, 1)
    expect(result.exercises[0].trace).toContain('Capability-adjusted historical max 101.5 kg')
  })

  it('does not price the same measured RPE response into capability twice through the product seam', () => {
    // Why: actual reps plus actual RPE already encode the athlete's demonstrated
    // capacity. Reapplying the target gap creates a closed-loop drift after both
    // harder and easier sessions, while target-only logs must retain legacy behavior.
    const workoutAtEffort = (actualRpe?: number, targetRpe?: number): Workout => ({
      workoutType: 'Log',
      workoutLogEndedAt: new Date(new Date(DATE).getTime() - 24 * 60 * 60 * 1000).toISOString(),
      workoutData: [{
        exerciseCode: 'BENCH_PRESS',
        exerciseData: [1, 2, 3].map((setNumber) => ({
          setNumber,
          setType: 'normal' as const,
          setCompleted: true,
          setMeasurements: [
            { measurementCode: 'WEIGHT', measurementValue: 12, measurementPlaceholder: 12 },
            { measurementCode: 'REPS', measurementValue: 7, measurementPlaceholder: 7 },
            ...(targetRpe == null
              ? []
              : [{ measurementCode: 'RPE', measurementValue: actualRpe, measurementPlaceholder: targetRpe }]),
          ],
        })),
      }],
    }) as Workout
    const generate = (workout: Workout, hold?: boolean) => generateOptimDemo(
      baseInputs({
        seed: 1,
        rpeAwareHistoryEnabled: true,
        ...(hold == null ? {} : { measuredEffortCapabilityHoldEnabled: hold }),
      }),
      context([chest], [workout]),
    )

    const under = workoutAtEffort(9, 8)
    const legacyUnder = generate(under)
    expect(generate(under, false)).toEqual(legacyUnder)
    expect(generate(under, true).exercises[0].theoreticalMaxKg)
      .toBeGreaterThan(legacyUnder.exercises[0].theoreticalMaxKg ?? 0)

    const over = workoutAtEffort(7.5, 8)
    expect(generate(over, true).exercises[0].theoreticalMaxKg)
      .toBeLessThan(generate(over, false).exercises[0].theoreticalMaxKg ?? Number.POSITIVE_INFINITY)

    const targetOnlyRpe = workoutAtEffort(undefined, 8)
    expect(generate(targetOnlyRpe, true)).toEqual(generate(targetOnlyRpe, false))
  })

  it('raises the anticipation cap only for measured easy sessions through the catch-up seam', () => {
    // Why: a compliant athlete who lifts exactly what was prescribed produces
    // observed == recommended, so the recovered 107% cap kept them underloaded
    // for months even when their logged RPE proved the session was far too
    // easy. The catch-up may follow that measured evidence to at most 118% of
    // the target and never past the observation's own arithmetic.
    const effortWorkout = (actualRpe: number | undefined, targetRpe: number, reps = 7): Workout => ({
      workoutType: 'Log',
      workoutLogEndedAt: new Date(new Date(DATE).getTime() - 24 * 60 * 60 * 1000).toISOString(),
      workoutData: [{
        exerciseCode: 'BENCH_PRESS',
        exerciseData: [1, 2, 3].map((setNumber) => ({
          setNumber,
          setType: 'normal' as const,
          setCompleted: true,
          setMeasurements: [
            { measurementCode: 'WEIGHT', measurementValue: 12, measurementPlaceholder: 12 },
            { measurementCode: 'REPS', measurementValue: reps, measurementPlaceholder: reps },
            { measurementCode: 'RPE', measurementValue: actualRpe, measurementPlaceholder: targetRpe },
          ],
        })),
      }],
    }) as Workout
    const generate = (workout: Workout, catchUp?: boolean) => generateOptimDemo(
      baseInputs({
        seed: 1,
        rpeAwareHistoryEnabled: true,
        measuredEffortCapabilityHoldEnabled: true,
        ...(catchUp == null ? {} : { loggedEffortCatchUpEnabled: catchUp }),
      }),
      context([chest], [workout]),
    )
    const maxAt = (reps: number) => ((1 + 3 * 0.018) * 12) / (1.0278 - reps * 0.0278)

    const easy = effortWorkout(6, 9)
    const held = generate(easy)
    expect(generate(easy, false)).toEqual(held)
    // Recovered cap: recommended (reps 7 + one in reserve at target RPE 9) x 1.07.
    expect(held.exercises[0].theoreticalMaxKg).toBeCloseTo(maxAt(8) * 1.07, 1)
    const caught = generate(easy, true)
    // Evidence bound: observed reps 7 + four in reserve at logged RPE 6.
    expect(caught.exercises[0].theoreticalMaxKg).toBeCloseTo(maxAt(11), 1)
    expect(caught.exercises[0].trace.some((item) => item.includes('logged-RPE catch-up'))).toBe(true)

    // When the measured gap exceeds 118% of the target, the ratio bound wins.
    const veryEasy = effortWorkout(6, 10, 12)
    const recommendedMax = ((1 + 3 * 0.018) * 12) / (1.0278 - 12 * 0.0278)
    expect(generate(veryEasy, true).exercises[0].theoreticalMaxKg)
      .toBeCloseTo(recommendedMax * 1.18, 1)

    // A target-only RPE is not measured effort: the recovered cap stands.
    const targetOnly = effortWorkout(undefined, 8)
    expect(generate(targetOnly, true)).toEqual(generate(targetOnly, false))
  })

  it('applies inactivity decay after the target-beating capability bound', () => {
    // Why: moving the cap after inactivity would let a large pre-cap estimate
    // absorb the loss and prescribe an active-user load after six months off.
    const result = generateOptimDemo(
      baseInputs({ seed: 1 }),
      context([chest], [completedWorkoutWithLoad('BENCH_PRESS', 180, 84, 80)]),
    )
    const prescribedMax = ((1 + 3 * 0.018) * 80) / (1.0278 - 5 * 0.0278)

    expect(result.exercises[0].theoreticalMaxKg).toBeCloseTo(prescribedMax * 1.07 * (2 / 3), 1)
  })

  it('does not label history capability-adjusted when only an older log has a target', () => {
    const result = generateOptimDemo(
      baseInputs({ seed: 1 }),
      context([chest], [
        completedWorkoutWithLoad('BENCH_PRESS', 2, 84, 80),
        completedWorkoutWithLoad('BENCH_PRESS', 1, 84),
      ]),
    )

    expect(result.exercises[0].trace.some((item) => item.startsWith('Capability-adjusted historical max')))
      .toBe(false)
    expect(result.exercises[0].trace.some((item) => item.startsWith('Smoothed historical max'))).toBe(true)
  })

  it('smooths targetless history without inventing a capability adjustment', () => {
    const result = generateOptimDemo(
      baseInputs({ seed: 1 }),
      context([chest], [
        completedWorkoutWithLoad('BENCH_PRESS', 3, 70),
        completedWorkoutWithLoad('BENCH_PRESS', 2, 75),
        completedWorkoutWithLoad('BENCH_PRESS', 1, 80),
      ]),
    )

    expect(result.exercises[0].theoreticalMaxKg).toBe(90.4)
    expect(result.exercises[0].trace).toContain('Smoothed historical max 90.4 kg')
  })

  it('does not let workouts after the generation date influence recommendations', () => {
    const result = generateOptimDemo(
      baseInputs(),
      context([chest], [completedWorkoutWithLoad('BENCH_PRESS', -1, 100)]),
    )

    expect(result.exercises[0].theoreticalMaxKg).toBeNull()
  })

  it('decays stale capability instead of prescribing a long-inactive peak', () => {
    const recent = generateOptimDemo(
      baseInputs({ seed: 1 }),
      context([chest], [1, 2, 3].map((daysAgo) =>
        completedWorkoutWithLoad('BENCH_PRESS', daysAgo, 80))),
    ).exercises[0].theoreticalMaxKg ?? 0
    const inactive = generateOptimDemo(
      baseInputs({ seed: 1 }),
      context([chest], [178, 179, 180].map((daysAgo) =>
        completedWorkoutWithLoad('BENCH_PRESS', daysAgo, 80))),
    ).exercises[0].theoreticalMaxKg ?? 0

    expect(inactive).toBeLessThan(recent * 0.7)
    expect(inactive).toBeGreaterThan(recent * 0.6)
  })

  it('rejects a single extreme load-entry outlier once history is deep enough', () => {
    const workouts = Array.from({ length: 15 }, (_, index) =>
      completedWorkoutWithLoad('BENCH_PRESS', index + 1, index === 7 ? 800 : 80))
    const result = generateOptimDemo(
      baseInputs({ seed: 1 }),
      context([chest], workouts),
    )

    expect(result.exercises[0].theoreticalMaxKg).toBeLessThan(110)
  })

  it.each([
    {
      label: 'latest',
      workouts: [
        completedWorkoutWithLoad('BENCH_PRESS', 3, 80),
        completedWorkoutWithLoad('BENCH_PRESS', 2, 80),
        completedWorkoutWithLoad('BENCH_PRESS', 1, 80),
        completedWorkoutWithLoad('BENCH_PRESS', 0, 800),
      ],
      expectedMaxKg: 118.6,
    },
    {
      label: 'oldest',
      workouts: [
        completedWorkoutWithLoad('BENCH_PRESS', 4, 800),
        completedWorkoutWithLoad('BENCH_PRESS', 3, 80),
        completedWorkoutWithLoad('BENCH_PRESS', 2, 80),
        completedWorkoutWithLoad('BENCH_PRESS', 1, 80),
      ],
      expectedMaxKg: 100.8,
    },
  ])('bounds a $label targetless typo before deep-history statistics are available', ({ workouts, expectedMaxKg }) => {
    // Why: a fat-fingered legacy/manual load must cost at most one plausible
    // PR-sized step, regardless of where it appears in a short history. It
    // must never become a 5x prescription while waiting for 15 observations.
    const result = generateOptimDemo(
      baseInputs({ seed: 1 }),
      context([chest], workouts),
    )

    expect(result.exercises[0].theoreticalMaxKg).toBeCloseTo(expectedMaxKg, 1)
    expect(result.exercises[0].sets.find((set) => set.setType === 'normal')?.weightKg)
      .toBeLessThanOrEqual(100)
    expect(result.exercises[0].trace).toContain(
      'Small-sample high-load outlier bounded to 150% of the lower-median history before smoothing.',
    )
  })

  it('uses the lower observation as the short-history anchor without clipping an ordinary PR', () => {
    // Why: averaging the middle pair lets a two-entry typo determine its own
    // ceiling, while an ordinary 80 -> 90 kg PR must remain byte-for-byte raw.
    const typo = generateOptimDemo(
      baseInputs({ seed: 1 }),
      context([chest], [
        completedWorkoutWithLoad('BENCH_PRESS', 2, 80),
        completedWorkoutWithLoad('BENCH_PRESS', 1, 800),
      ]),
    ).exercises[0]
    const legitimatePr = generateOptimDemo(
      baseInputs({ seed: 1 }),
      context([chest], [
        completedWorkoutWithLoad('BENCH_PRESS', 2, 80),
        completedWorkoutWithLoad('BENCH_PRESS', 1, 90),
      ]),
    ).exercises[0]

    expect(typo.theoreticalMaxKg).toBeCloseTo(118.6, 1)
    expect(legitimatePr.theoreticalMaxKg).toBeCloseTo(100.8, 1)
    expect(legitimatePr.trace).not.toContainEqual(expect.stringContaining('Small-sample high-load outlier'))
  })

  it('round-trips exact multi-set bodyweight adherence without lowering the next target', () => {
    // Why: a repeated-set prescription is not an all-out single-set max. The
    // history estimate and prescription derating must be inverse operations,
    // or completing every prescribed rep makes the next workout easier.
    const pushUp = exercise('PUSH_UP_ROUND_TRIP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['BODYWEIGHT_ONLY', 'COMPOUND'],
      measurements: ['REPS'],
    })
    const inputs = baseInputs({
      availableEquipmentCodes: [],
      generationDateIso: DATE,
      seed: 0,
      split: 'push',
    })
    const first = generateOptimDemo(inputs, context([pushUp])).exercises[0]
    const firstWorkingSets = first.sets.filter((set) => set.setType === 'normal')
    const completed = {
      workoutType: 'Log',
      workoutLogEndedAt: '2026-07-14T12:00:00.000Z',
      workoutData: [{
        exerciseCode: pushUp.exerciseCode,
        exerciseData: firstWorkingSets.map((set, index) => ({
          setNumber: index + 1,
          setType: 'normal' as const,
          setCompleted: true,
          setMeasurements: [{
            measurementCode: 'REPS',
            measurementValue: set.reps,
            measurementPlaceholder: set.reps,
          }],
        })),
      }],
    } as Workout
    const next = generateOptimDemo(inputs, context([pushUp], [completed])).exercises[0]

    expect(firstWorkingSets.length).toBeGreaterThan(1)
    expect(next.sets.filter((set) => set.setType === 'normal').map((set) => set.reps))
      .toEqual(firstWorkingSets.map((set) => set.reps))
  })

  it('does not manufacture bodyweight progression when set schemes rotate', () => {
    // Why: 3/4/5-set rotations change the capacity factor by less than one
    // rep. Exact target completion must confirm the prior estimate instead of
    // banking that rounding residue until it becomes a fake extra rep.
    const pushUp = exercise('PUSH_UP_ROTATION', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['BODYWEIGHT_ONLY', 'COMPOUND'],
      measurements: ['REPS'],
    })
    const runTrack = (repOffset: number) => {
      const completedWorkouts: Workout[] = []
      const repsBySetCount = new Map<number, number[]>()
      const startMs = Date.parse('2026-01-05T12:00:00.000Z')
      for (let session = 0; session < 12; session += 1) {
        const generatedAt = new Date(startMs + session * 24 * 60 * 60 * 1000)
        const generated = generateOptimDemo(
          baseInputs({
            availableEquipmentCodes: [],
            bodyweightOnly: true,
            generationDateIso: generatedAt.toISOString(),
            seed: 0,
            split: 'push',
            warmupSetsEnabled: false,
          }),
          context([pushUp], completedWorkouts, { bodyWeightKg: null }),
        ).exercises[0]
        const workingSets = generated.sets.filter((set) => set.setType === 'normal')
        const reps = workingSets[0].reps ?? 0
        const series = repsBySetCount.get(workingSets.length) ?? []
        series.push(reps)
        repsBySetCount.set(workingSets.length, series)
        completedWorkouts.push({
          workoutType: 'Log',
          workoutLogEndedAt: generatedAt.toISOString(),
          workoutData: [{
            exerciseCode: pushUp.exerciseCode,
            exerciseData: workingSets.map((set, index) => ({
              setNumber: index + 1,
              setType: 'normal' as const,
              setCompleted: true,
              setMeasurements: [{
                measurementCode: 'REPS',
                measurementValue: (set.reps ?? 0) + repOffset,
                measurementPlaceholder: set.reps,
              }],
            })),
          }],
        } as Workout)
      }
      return repsBySetCount
    }

    const exact = runTrack(0)
    expect(exact.size).toBeGreaterThan(1)
    for (const reps of exact.values()) {
      expect(new Set(reps.slice(1)).size).toBe(1)
    }

    const over = runTrack(1)
    expect([...over.values()].some((reps) => reps.length >= 3 && reps.at(-1)! > reps[1])).toBe(true)

    const extreme = runTrack(3)
    const extremeReps = [...extreme.values()].flat()
    expect(Math.max(...extremeReps)).toBe(20)
    expect(extremeReps.every((reps) => reps <= 20)).toBe(true)
  })

  it('smooths and decays bodyweight reps instead of prescribing an all-time typo or stale peak', () => {
    const pullUp = exercise('PULL_UP', 'LATISSIMUS_DORSI', {
      tags: ['BODYWEIGHT_ONLY'],
      measurements: ['REPS'],
    })
    const result = generateOptimDemo(
      baseInputs({ split: 'pull', seed: 0 }),
      context([pullUp], [
        completedBodyweightWorkout('PULL_UP', 300, 25),
        completedBodyweightWorkout('PULL_UP', 2, 5),
        completedBodyweightWorkout('PULL_UP', 1, 5),
      ]),
    )
    const reps = result.exercises[0].sets
      .filter((set) => set.setType === 'normal')
      .map((set) => set.reps ?? 0)

    expect(Math.max(...reps)).toBeLessThanOrEqual(8)
    expect(result.exercises[0].maxEffort).toBe(true)
  })

  it.each([
    {
      label: 'targetless',
      workouts: [
        completedBodyweightWorkout('PUSH_UP', 3, 8),
        completedBodyweightWorkout('PUSH_UP', 2, 8),
        completedBodyweightWorkout('PUSH_UP', 1, 80),
      ],
    },
    {
      label: 'target-bearing',
      workouts: [
        completedBodyweightWorkout('PUSH_UP', 3, 8, 8),
        completedBodyweightWorkout('PUSH_UP', 2, 8, 8),
        completedBodyweightWorkout('PUSH_UP', 1, 80, 8),
      ],
    },
  ])('bounds a $label upward rep typo without suppressing downward correction', ({ workouts }) => {
    // Why: the 20-rep output ceiling alone is insufficient if a bad 80-rep
    // capacity remains behind it forever. Bound only upward evidence so a
    // later under-target workout can still correct the estimate immediately.
    const pushUp = exercise('PUSH_UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['BODYWEIGHT_ONLY', 'COMPOUND'],
      measurements: ['REPS'],
    })
    const result = generateOptimDemo(
      baseInputs({ availableEquipmentCodes: [], split: 'push', seed: 0 }),
      context([pushUp], workouts),
    )
    const workingReps = result.exercises[0].sets
      .filter((set) => set.setType === 'normal')
      .map((set) => set.reps ?? 0)

    expect(Math.max(...workingReps)).toBeLessThan(12)
    expect(result.exercises[0].trace).toContain(
      'Large upward rep-capacity step bounded; downward corrections remain unrestricted.',
    )
  })

  it('counts duplicate exercise entries in one log as one workout for max-effort depth', () => {
    const workout = completedWorkout('BENCH_PRESS')
    const duplicateEntryWorkout = {
      ...workout,
      workoutData: [...(workout.workoutData ?? []), ...(workout.workoutData ?? [])],
    } as Workout

    expect(buildOptimDemoHistory([duplicateEntryWorkout]).get('BENCH_PRESS')?.workoutCount).toBe(1)
  })

  it('does not treat assistance or added bodyweight as a standalone strength max', () => {
    const assisted = exercise('ASSISTED_PULL_UP', 'LATISSIMUS_DORSI', {
      tags: ['BODYWEIGHT_WITH_EQUIPMENT'],
      measurements: ['BODYWEIGHT_MINUS_ASSISTANCE', 'REPS'],
    })
    const weighted = exercise('WEIGHTED_DIP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['BODYWEIGHT_WITH_EQUIPMENT'],
      measurements: ['BODYWEIGHT_PLUS_WEIGHT', 'REPS'],
    })
    const result = generateOptimDemo(
      baseInputs({ nonCoreCountOverride: 2, seed: 2 }),
      context([assisted, weighted], [
        completedWorkout('ASSISTED_PULL_UP', 1, 'BODYWEIGHT_MINUS_ASSISTANCE'),
        completedWorkout('WEIGHTED_DIP', 1, 'BODYWEIGHT_PLUS_WEIGHT'),
      ]),
    )

    expect(result.exercises.every((item) => item.theoreticalMaxKg == null)).toBe(true)
    expect(result.exercises.find((item) => item.code === 'ASSISTED_PULL_UP')?.weightedBodyweight).toBe(false)
  })

  it('uses curated fully suspended metadata to prescribe added-only weighted pull-up load', () => {
    // Why: a weighted pull-up's logged value is external load, but progression
    // must compare total effective load without changing the stored measurement.
    const weightedPullUp = exercise('WEIGHTED.PULL.UP', 'LATISSIMUS_DORSI', {
      name: 'Weighted Pull-Up',
      tags: ['BODYWEIGHT_WITH_EQUIPMENT'],
      type: 'WEIGHTED_BODYWEIGHT',
      measurements: ['BODYWEIGHT_PLUS_WEIGHT', 'REPS'],
    })
    const workouts = [1, 2, 3].map((daysAgo) =>
      completedBodyweightLoadWorkout('WEIGHTED.PULL.UP', daysAgo, 'BODYWEIGHT_PLUS_WEIGHT', 20))
    const generated = generateOptimDemo(
      baseInputs({ split: 'pull', seed: 1 }),
      context([weightedPullUp], workouts, { bodyWeightKg: 80 }),
    ).exercises[0]
    const workingLoads = generated.sets
      .filter((set) => set.setType === 'normal')
      .map((set) => set.weightKg ?? 0)

    expect(generated.theoreticalMaxKg).toBeGreaterThan(100)
    expect(Math.min(...workingLoads)).toBeGreaterThan(0)
    expect(Math.max(...workingLoads)).toBeLessThan(80)
    expect(generated.weightedBodyweight).toBe(true)
    expect(generated.trace.join(' ')).toContain('stored BODYWEIGHT_PLUS_WEIGHT semantics remain added-only')

    const bodyweightOnly = generateOptimDemo(
      baseInputs({
        split: 'pull',
        seed: 1,
        bodyweightOnly: true,
        bodyweightOnlyLoadExclusionEnabled: true,
        availableEquipmentCodes: [],
      }),
      context([weightedPullUp], workouts, { bodyWeightKg: 80 }),
    ).exercises[0]
    expect(bodyweightOnly.weightedBodyweight).toBe(false)
    expect(bodyweightOnly.sets.every((set) => set.weightKg == null)).toBe(true)
    expect(bodyweightOnly.sets.every((set) => (set.reps ?? 0) <= 20)).toBe(true)
    expect(bodyweightOnly.trace).toContain(
      'Bodyweight-only product policy kept external load off; progression stays in reps or a harder movement variation',
    )
  })

  it('keeps effective added load and prescribed reps on the same strength curve', () => {
    // Why: mixed high-rep and weighted history must not emit a load calculated
    // for scheme reps while silently replacing those reps with another model.
    const weightedPullUp = exercise('WEIGHTED.PULL.UP', 'LATISSIMUS_DORSI', {
      name: 'Weighted Pull-Up',
      tags: ['BODYWEIGHT_WITH_EQUIPMENT'],
      type: 'WEIGHTED_BODYWEIGHT',
      measurements: ['BODYWEIGHT_PLUS_WEIGHT', 'REPS'],
    })
    const generated = generateOptimDemo(
      baseInputs({ split: 'pull', seed: 1 }),
      context([weightedPullUp], [
        completedBodyweightLoadWorkout('WEIGHTED.PULL.UP', 1, 'BODYWEIGHT_PLUS_WEIGHT', 0, 14),
        completedBodyweightLoadWorkout('WEIGHTED.PULL.UP', 2, 'BODYWEIGHT_PLUS_WEIGHT', 0, 14),
        completedBodyweightLoadWorkout('WEIGHTED.PULL.UP', 3, 'BODYWEIGHT_PLUS_WEIGHT', 20, 5),
      ], { bodyWeightKg: 80 }),
    ).exercises[0]
    const workingSets = generated.sets.filter((set) => set.setType === 'normal')
    const first = workingSets[0]
    const effectiveLoad = 80 + (first.weightKg ?? 0)
    const prescribedMax = ((1 + workingSets.length * 0.018) * effectiveLoad)
      / (1.0278 - Math.min(first.reps ?? 0, 20) * 0.0278)

    expect(first.weightKg).toBeGreaterThan(0)
    expect(Math.abs(prescribedMax - (generated.theoreticalMaxKg ?? 0)) / prescribedMax)
      .toBeLessThan(0.08)
  })

  it('does not turn curated effective-load work into an easier bodyweight max-effort day', () => {
    // Why: v1 does not prescribe assistance or body-inclusive max attempts;
    // keeping this exercise on its normal effective-load scheme is safer than
    // labeling a strictly easier bodyweight-only session as max effort.
    const weightedPullUp = exercise('WEIGHTED.PULL.UP', 'LATISSIMUS_DORSI', {
      name: 'Weighted Pull-Up',
      tags: ['BODYWEIGHT_WITH_EQUIPMENT'],
      type: 'WEIGHTED_BODYWEIGHT',
      measurements: ['BODYWEIGHT_PLUS_WEIGHT', 'REPS'],
    })
    const generated = generateOptimDemo(
      baseInputs({ split: 'pull', seed: 0 }),
      context(
        [weightedPullUp],
        [1, 2, 3].map((daysAgo) =>
          completedBodyweightLoadWorkout('WEIGHTED.PULL.UP', daysAgo, 'BODYWEIGHT_PLUS_WEIGHT', 20)),
        { bodyWeightKg: 80 },
      ),
    ).exercises[0]

    expect(generated.maxEffort).toBe(false)
    expect(generated.weightedBodyweight).toBe(true)
  })

  it('keeps curated weighted-bodyweight history rep-only when profile bodyweight is unavailable', () => {
    // Why: interpreting an added plate as total system load would dangerously
    // understate history; body mass is required before the sidecar can apply.
    const weightedPullUp = exercise('WEIGHTED.PULL.UP', 'LATISSIMUS_DORSI', {
      name: 'Weighted Pull-Up',
      tags: ['BODYWEIGHT_WITH_EQUIPMENT'],
      type: 'WEIGHTED_BODYWEIGHT',
      measurements: ['BODYWEIGHT_PLUS_WEIGHT', 'REPS'],
    })
    const generated = generateOptimDemo(
      baseInputs({ split: 'pull', seed: 1 }),
      context(
        [weightedPullUp],
        [completedBodyweightLoadWorkout('WEIGHTED.PULL.UP', 1, 'BODYWEIGHT_PLUS_WEIGHT', 20)],
        { bodyWeightKg: null },
      ),
    ).exercises[0]

    expect(generated.theoreticalMaxKg).toBeNull()
    expect(generated.weightedBodyweight).toBe(false)
    expect(generated.sets.every((set) => set.weightKg == null)).toBe(true)
  })

  it('learns assisted pull-up effective capacity without prescribing assistance as weight', () => {
    // Why: assistance reduces effective load and is not a positive weight the
    // generator can safely write into a future set.
    const assistedPullUp = exercise('ASSISTED.PULL.UP', 'LATISSIMUS_DORSI', {
      name: 'Machine Assisted Pull-Up',
      tags: ['BODYWEIGHT_WITH_EQUIPMENT'],
      type: 'ASSISTED_BODYWEIGHT',
      measurements: ['BODYWEIGHT_MINUS_ASSISTANCE', 'REPS'],
    })
    const generated = generateOptimDemo(
      baseInputs({ split: 'pull', seed: 1 }),
      context(
        [assistedPullUp],
        [completedBodyweightLoadWorkout('ASSISTED.PULL.UP', 1, 'BODYWEIGHT_MINUS_ASSISTANCE', 20)],
        { bodyWeightKg: 80 },
      ),
    ).exercises[0]

    expect(generated.theoreticalMaxKg).toBeGreaterThan(0)
    expect(generated.weightedBodyweight).toBe(false)
    expect(generated.sets.every((set) => set.weightKg == null)).toBe(true)
  })

  it('does not claim weighted bodyweight when profile bodyweight is unavailable', () => {
    const pushUp = exercise('WEIGHTED_PUSH_UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['BODYWEIGHT_ONLY'],
      measurements: ['REPS'],
    })
    const source = context([pushUp], [completedBodyweightWorkout('WEIGHTED_PUSH_UP', 1, 10)])
    const result = generateOptimDemo(
      baseInputs({ seed: 2 }),
      { ...source, bodyWeightKg: null },
    )

    expect(result.exercises[0].weightedBodyweight).toBe(false)
    expect(result.exercises[0].sets.every((set) => set.weightKg == null)).toBe(true)
  })

  it('keeps the product Bodyweight preset free of cadence loads, including timed holds', () => {
    // Why: the user-facing preset declares no equipment. The recovered
    // every-third-day fallback must remain available to legacy callers but
    // cannot ask that user to add plates to a push-up or timed plank.
    const pushUp = exercise('STRICT_BODYWEIGHT_PUSH_UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Strict Bodyweight Push-Up',
      tags: ['BODYWEIGHT_ONLY', 'COMPOUND'],
      type: 'BODYWEIGHT_REPS',
      measurements: ['REPS'],
    })
    const plank = exercise('STRICT_BODYWEIGHT_PLANK', 'RECTUS_ABDOMINIS', {
      name: 'Strict Bodyweight Plank',
      tags: ['BODYWEIGHT_ONLY', 'ABS_CORE'],
      type: 'BODYWEIGHT_DURATION',
      measurements: ['DURATION'],
    })
    const inputs = baseInputs({
      experience: 'beginner',
      bodyweightOnly: true,
      availableEquipmentCodes: [],
      generationDateIso: '2026-07-17T12:00:00.000Z',
      startingExerciseCodes: [pushUp.exerciseCode ?? ''],
      nonCoreCountOverride: 1,
      coreCountOverride: 1,
    })
    const source = context(
      [pushUp, plank],
      [
        completedBodyweightWorkout(pushUp.exerciseCode ?? '', 1, 10),
        completedBodyweightWorkout(plank.exerciseCode ?? '', 1, 10),
      ],
      { bodyWeightKg: 80 },
    )
    const omitted = { ...inputs }
    delete omitted.bodyweightOnlyLoadExclusionEnabled
    const disabled = generateOptimDemo({
      ...inputs,
      bodyweightOnlyLoadExclusionEnabled: false,
    }, source)
    const strict = generateOptimDemo({
      ...inputs,
      bodyweightOnlyLoadExclusionEnabled: true,
    }, source)

    expect(generateOptimDemo(omitted, source)).toEqual(disabled)
    expect(disabled.exercises.every((item) => item.weightedBodyweight)).toBe(true)
    expect(disabled.exercises.every((item) =>
      item.sets.some((set) => set.weightKg != null),
    )).toBe(true)
    expect(strict.exercises.every((item) => !item.weightedBodyweight)).toBe(true)
    expect(strict.exercises.every((item) =>
      item.sets.every((set) => set.weightKg == null),
    )).toBe(true)
    expect(strict.exercises.every((item) =>
      item.trace.includes('Bodyweight-only product policy kept external load off; progression stays in reps or a harder movement variation'),
    )).toBe(true)
  })

  it('returns full debug evidence for ranking, selection, and adapter limits', () => {
    const result = generateOptimDemo(baseInputs({ focusExerciseCodes: ['BENCH_PRESS'] }), context([chest, legs]))

    expect(result.events.some((event) => event.includes('hard-filter survivors'))).toBe(true)
    expect(result.rankedCandidates).toHaveLength(2)
    expect(result.rankedCandidates[0].breakdown).toEqual(expect.objectContaining({
      catalogRating: expect.any(Number),
      muscleFreshness: expect.any(Number),
      historyRecency: expect.any(Number),
      primaryMuscleUtility: expect.any(Number),
      focusUtility: 0.6,
      userRating: expect.any(Number),
    }))
    expect(result.rankedCandidates[0].breakdown).not.toHaveProperty('sportFoundationUtility')
    expect(result.exercises[0].trace.length).toBeGreaterThan(0)
    expect(result.dataNotes.some((note) => note.includes('never writes a workout'))).toBe(true)
  })

  it('keeps requested core work when a non-core muscle filter is active', () => {
    const core = exercise('PLANK', 'RECTUS_ABDOMINIS', {
      tags: ['BODYWEIGHT'],
      measurements: ['DURATION'],
    })
    const result = generateOptimDemo(
      baseInputs({ selectedMuscleBuckets: ['chest'], coreCountOverride: 1 }),
      context([chest, core]),
    )

    expect(result.counts.generatedCore).toBe(1)
    expect(result.exercises.some((item) => item.code === 'PLANK' && item.phase === 'core')).toBe(true)
  })

  it('attributes core-only constrained underfill without reinterpreting recovered counts', () => {
    // Why: core is a separate phase/count, so a core-only hard filter should
    // stay honest about missing non-core work instead of silently inflating it.
    const core = exercise('CORE_ONLY_PLANK', 'RECTUS_ABDOMINIS', {
      tags: ['BODYWEIGHT'],
      measurements: ['DURATION'],
    })
    const inputs = baseInputs({
      selectedMuscleBuckets: ['core'],
      nonCoreCountOverride: 2,
      coreCountOverride: 1,
    })
    const result = generateOptimDemo(inputs, context([chest, core]))

    expect(result.counts.requestedNonCore).toBe(2)
    expect(result.counts.requestedCore).toBe(1)
    expect(result.counts.generatedStrength).toBe(0)
    expect(result.counts.generatedCore).toBe(1)
    expect(result.events).toContainEqual(expect.stringContaining(
      'Manual muscle selection (core) left 0 eligible non-core catalog movements; non-core filled 0/2 and the recovered count was not reinterpreted.',
    ))

    const unrelatedUnderfill = generateOptimDemo({
      ...inputs,
      selectedMuscleBuckets: [],
    }, context([core]))
    expect(unrelatedUnderfill.events.some((event) => event.startsWith('Manual muscle selection'))).toBe(false)
  })

  it('uses the short-hold scheme for the catalog L-Sit spelling', () => {
    const lSit = exercise('L.SIT', 'RECTUS_ABDOMINIS', {
      name: 'L-Sit',
      tags: ['BODYWEIGHT_ONLY'],
      measurements: ['DURATION'],
    })
    const result = generateOptimDemo(
      baseInputs({ nonCoreCountOverride: 0, coreCountOverride: 1 }),
      context([lSit]),
    )

    expect(result.exercises[0].sets.every((set) => set.durationSeconds === 30)).toBe(true)
  })

  it('never emits rep sets for a duration-only catalog contract when recovered metadata says not timed', () => {
    const hold = exercise('ISOMETRIC-HOLD-PUSH-UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Isometric Hold Push-Up',
      type: 'DURATION',
      tags: ['BODYWEIGHT_ONLY', 'COMPOUND', 'ISOMETRIC', 'PUSH_SPLIT'],
      measurements: ['DURATION'],
    })
    const result = generateOptimDemo(baseInputs(), context([hold]))

    expect(result.exercises[0].phase).toBe('strength')
    expect(result.exercises[0].sets.every(set => set.durationSeconds === 60 && set.reps == null)).toBe(true)
  })

  it('preserves recovered rep arbitration and strength staging for mixed rep-duration catalog work', () => {
    const superman = exercise('SUPERMAN', 'ERECTOR_SPINAE', {
      name: 'Superman',
      type: 'STATIC_STRETCHES',
      tags: ['BODYWEIGHT_ONLY', 'GOOD_WARMUP', 'GOOD_COOLDOWN', 'ISOMETRIC'],
      measurements: ['REPS', 'DURATION'],
    })
    const result = generateOptimDemo(baseInputs(), context([superman]))

    expect(result.exercises[0].phase).toBe('strength')
    expect(result.exercises[0].sets.every(set => set.reps != null && set.durationSeconds == null)).toBe(true)
  })

  it('does not emit strength sets for a distance catalog contract hidden by recovered metadata', () => {
    const bearWalk = exercise('BEAR.WALK', 'QUADRICEPS', {
      name: 'High Butt Bear Crawl',
      type: 'DISTANCE_DURATION',
      tags: ['BODYWEIGHT_ONLY', 'COMPOUND', 'GOOD_WARMUP'],
      measurements: ['DISTANCE', 'DURATION'],
    })
    const result = generateOptimDemo(baseInputs(), context([bearWalk]))

    expect(result.counts.generatedStrength).toBe(0)
    expect(result.rejectedCandidates.find(candidate => candidate.code === 'BEAR.WALK')?.reasons)
      .toContain('distance exercise is selected in its own stage')
  })

  it('does not prescribe equipment cardio in bodyweight-only mode', () => {
    const pushUp = exercise('PUSH_UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['BODYWEIGHT'],
      measurements: ['REPS'],
    })
    const treadmill = exercise('TREADMILL_RUN', 'QUADRICEPS', {
      equipment: 'TREADMILL',
      type: 'CARDIO',
      measurements: ['DURATION'],
    })
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['TREADMILL'],
        bodyweightOnly: true,
        cardioEnabled: true,
      }),
      context([pushUp, treadmill]),
    )

    expect(result.counts.generatedCardio).toBe(0)
    expect(result.events).toContain('Cardio enabled, but no available cardio exercise was found.')
  })

  it('uses real cardio types and gives REPS-only cardio a rep scheme', () => {
    const treadmill = exercise('TREADMILL_RUN', 'QUADRICEPS', {
      equipment: 'TREADMILL',
      type: 'TREADMILL',
      tags: [],
      measurements: ['DURATION'],
    })
    const repsOnly = exercise('ARM_FLAP_MARCH', 'ANTERIOR_DELTOID', {
      type: 'REPS_ONLY',
      tags: ['CARDIO'],
      measurements: ['REPS'],
    })
    const treadmillResult = generateOptimDemo(
      baseInputs({ availableEquipmentCodes: ['BARBELL', 'TREADMILL'], cardioEnabled: true, selectedCardioExerciseCodes: ['TREADMILL_RUN'] }),
      context([chest, treadmill, repsOnly]),
    )
    const repsResult = generateOptimDemo(
      baseInputs({ cardioEnabled: true, selectedCardioExerciseCodes: ['ARM_FLAP_MARCH'] }),
      context([chest, treadmill, repsOnly]),
    )

    expect(treadmillResult.exercises.some((item) => item.code === 'TREADMILL_RUN' && item.phase === 'cardio')).toBe(true)
    const repsCardio = repsResult.exercises.find((item) => item.code === 'ARM_FLAP_MARCH' && item.phase === 'cardio')
    expect(repsCardio?.sets.every((set) => set.reps === 20 && set.durationSeconds == null)).toBe(true)
  })

  it('matches cardio reservation to the emitted prescription only through the opt-in policy', () => {
    // Why: long rep/timed allocations otherwise remove time from strength that
    // never appears in the workout, while direct callers must retain recovery.
    const scenarios = [
      {
        cardio: exercise('RESERVE_REP_CARDIO', 'ANTERIOR_DELTOID', {
          type: 'REPS_ONLY',
          tags: ['CARDIO'],
          measurements: ['REPS'],
        }),
        expectedBudgets: [55, 78],
      },
      {
        cardio: exercise('RESERVE_TIMED_CARDIO', 'QUADRICEPS', {
          type: 'CARDIO',
          tags: ['CARDIO'],
          measurements: ['DURATION'],
        }),
        expectedBudgets: [55, 75],
      },
      {
        cardio: exercise('RESERVE_DISTANCE_CARDIO', 'QUADRICEPS', {
          type: 'DISTANCE_DURATION',
          tags: ['CARDIO'],
          measurements: ['DISTANCE', 'DURATION'],
        }),
        expectedBudgets: [55, 55],
      },
    ] as const

    for (const { cardio, expectedBudgets } of scenarios) {
      const inputs = baseInputs({
        durationMinutes: 90,
        goal: 'muscleTone',
        warmupSetsEnabled: false,
        cardioEnabled: true,
        selectedCardioExerciseCodes: [cardio.exerciseCode!],
        nonCoreCountOverride: null,
        coreCountOverride: null,
      })
      const source = context([chest, cardio])
      const legacy = generateOptimDemo(inputs, source)
      const explicitLegacy = generateOptimDemo({
        ...inputs,
        cardioReservationMatchesEmittedEnabled: false,
      }, source)
      const emitted = generateOptimDemo({
        ...inputs,
        cardioReservationMatchesEmittedEnabled: true,
      }, source)
      const cardioSets = (result: ReturnType<typeof generateOptimDemo>) =>
        result.exercises.find((item) => item.phase === 'cardio')?.sets

      expect(explicitLegacy).toEqual(legacy)
      expect([
        legacy.durationEstimate?.strengthBudgetMinutes,
        emitted.durationEstimate?.strengthBudgetMinutes,
      ]).toEqual(expectedBudgets)
      expect(cardioSets(emitted)).toEqual(cardioSets(legacy))
      if (cardio.exerciseCode === 'RESERVE_DISTANCE_CARDIO') {
        expect(emitted).toEqual(legacy)
      }
    }
  })

  it('chooses the strongest catalog cardio candidate instead of catalog order', () => {
    const lowQuality = exercise('LOW_QUALITY_CARDIO', 'QUADRICEPS', {
      type: 'DURATION',
      tags: ['CARDIO'],
      measurements: ['DURATION'],
      popularity: 2,
    })
    const highQuality = exercise('HIGH_QUALITY_CARDIO', 'QUADRICEPS', {
      type: 'DURATION',
      tags: ['CARDIO'],
      measurements: ['DURATION'],
      popularity: 9,
    })
    const result = generateOptimDemo(
      baseInputs({ cardioEnabled: true }),
      context([chest, lowQuality, highQuality]),
    )

    expect(result.exercises.find((item) => item.phase === 'cardio')?.code).toBe('HIGH_QUALITY_CARDIO')
  })

  it('rotates unpinned cardio within one popularity point without admitting a two-point gap', () => {
    const cardio = (code: string, popularity: number) => exercise(code, 'QUADRICEPS', {
      type: 'DISTANCE_DURATION',
      tags: ['CARDIO'],
      measurements: ['DISTANCE', 'DURATION'],
      popularity,
    })
    const source = context([
      chest,
      cardio('TOP_CARDIO_A', 10),
      cardio('TOP_CARDIO_B', 10),
      cardio('NEAR_CARDIO', 9),
      cardio('LOW_CARDIO', 8),
    ])
    const choose = (day: number, selectedCardioExerciseCodes: string[] = []) => generateOptimDemo(
      baseInputs({
        cardioEnabled: true,
        generationDateIso: `2026-01-${String(day).padStart(2, '0')}T12:00:00.000Z`,
        selectedCardioExerciseCodes,
      }),
      source,
    ).exercises.find(item => item.phase === 'cardio')?.code
    const annualSlice = new Set(Array.from({ length: 6 }, (_, index) => choose(index + 1)))

    expect(annualSlice).toEqual(new Set(['TOP_CARDIO_A', 'TOP_CARDIO_B', 'NEAR_CARDIO']))
    expect(choose(3)).toBe(choose(3))
    expect(choose(3, ['LOW_CARDIO'])).toBe('LOW_CARDIO')
  })

  it('includes mathematical score-boundary ties regardless of floating-point addend order', () => {
    const distance = (code: string, popularity: number, favorite = false) => ({
      ...exercise(code, 'QUADRICEPS', {
        type: 'DISTANCE_DURATION',
        tags: ['CARDIO'],
        measurements: ['DISTANCE', 'DURATION'],
        popularity,
      }),
      isFavorited: favorite,
    })
    const timed = exercise('TIMED_POP_10', 'QUADRICEPS', {
      type: 'DURATION',
      tags: ['CARDIO'],
      measurements: ['DURATION'],
      popularity: 10,
    })
    const picksAcrossDays = (items: ExerciseListItem[]) => new Set(Array.from({ length: 6 }, (_, index) =>
      generateOptimDemo(
        baseInputs({
          cardioEnabled: true,
          generationDateIso: `2026-02-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
        }),
        context([chest, ...items]),
      ).exercises.find(item => item.phase === 'cardio')?.code))

    expect(picksAcrossDays([distance('FAVORITE_POP_9', 9, true), distance('DISTANCE_POP_10', 10)]))
      .toEqual(new Set(['FAVORITE_POP_9', 'DISTANCE_POP_10']))
    expect(picksAcrossDays([distance('DISTANCE_POP_10', 10), timed]))
      .toEqual(new Set(['DISTANCE_POP_10', 'TIMED_POP_10']))
  })

  it('keeps a two-point favorite lead authoritative in unpinned cardio ranking', () => {
    const favorite = {
      ...exercise('FAVORITE_POP_10', 'QUADRICEPS', {
        type: 'DISTANCE_DURATION',
        tags: ['CARDIO'],
        measurements: ['DISTANCE', 'DURATION'],
        popularity: 10,
      }),
      isFavorited: true,
    }
    const ordinary = exercise('ORDINARY_POP_10', 'QUADRICEPS', {
      type: 'DISTANCE_DURATION',
      tags: ['CARDIO'],
      measurements: ['DISTANCE', 'DURATION'],
      popularity: 10,
    })
    const picks = new Set(Array.from({ length: 4 }, (_, index) => generateOptimDemo(
      baseInputs({
        cardioEnabled: true,
        generationDateIso: `2026-03-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      }),
      context([chest, favorite, ordinary]),
    ).exercises.find(item => item.phase === 'cardio')?.code))

    expect(picks).toEqual(new Set(['FAVORITE_POP_10']))
  })

  it('does not emit a dual-tagged exercise in both cardio and mobility phases', () => {
    const dualPhase = exercise('DUAL_CARDIO_MOBILITY', 'QUADRICEPS', {
      type: 'DURATION',
      tags: ['CARDIO', 'STRETCHING', 'BODYWEIGHT_ONLY'],
      measurements: ['DURATION'],
      popularity: 10,
    })
    const mobility = exercise('MOBILITY_FALLBACK', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      type: 'STATIC_STRETCHES',
      tags: ['STRETCHING', 'BODYWEIGHT_ONLY'],
      measurements: ['DURATION'],
    })
    const result = generateOptimDemo(
      baseInputs({ durationMinutes: 30, cardioEnabled: true, mobilityWarmupEnabled: true }),
      context([chest, dualPhase, mobility]),
    )
    const codes = result.exercises.map((item) => item.code)

    expect(codes.filter((code) => code === 'DUAL_CARDIO_MOBILITY')).toHaveLength(1)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('does not infer bodyweight from missing equipment on a weighted exercise', () => {
    const missingEquipment = exercise('UNMAPPED_WEIGHTED_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: [],
      type: 'WEIGHT_REPS',
      measurements: ['WEIGHT', 'REPS'],
    })
    const result = generateOptimDemo(
      baseInputs({ bodyweightOnly: true, availableEquipmentCodes: [] }),
      context([missingEquipment]),
    )

    expect(result.rejectedCandidates[0].reasons).toContain('bodyweight-only mode')
  })

  it('does not let recovered bodyweight metadata override an explicit loaded catalog contract', () => {
    // Why: the recovered HIP.THRUSTS overlay says bodyweight, but the live
    // exercise records WEIGHT and requires a barbell. Treating it as bodyweight
    // suppresses history loads and permits incompatible circuit stations.
    const hipThrust = exercise('HIP.THRUSTS', 'GLUTEUS_MAXIMUS', {
      name: 'Hip Thrust',
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'PLATE_LOADED', 'LEGS_SPLIT'],
      measurements: ['WEIGHT', 'REPS'],
    })
    const source = context([hipThrust], [completedWorkout('HIP.THRUSTS')])
    const loaded = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL'],
        startingExerciseCodes: ['HIP.THRUSTS'],
        nonCoreCountOverride: 1,
        coreCountOverride: 0,
      }),
      source,
    )
    const bodyweightOnly = generateOptimDemo(
      baseInputs({
        bodyweightOnly: true,
        availableEquipmentCodes: ['BARBELL'],
        startingExerciseCodes: ['HIP.THRUSTS'],
        nonCoreCountOverride: 1,
        coreCountOverride: 0,
      }),
      source,
    )

    expect(loaded.exercises[0]?.sets.some((set) => set.weightKg != null)).toBe(true)
    expect(bodyweightOnly.exercises).toHaveLength(0)
    expect(bodyweightOnly.rejectedCandidates[0]?.reasons).toContain('bodyweight-only mode')
  })

  it('chooses the dominant primary-muscle bucket independent of source order', () => {
    const first = exercise('MIXED_PRIMARY_A', 'OBLIQUES')
    const second = exercise('MIXED_PRIMARY_B', 'HIP_ADDUCTORS')
    first.exerciseMuscles = [
      { muscleCode: 'OBLIQUES', isPrimary: true, targetPercentage: 85 },
      { muscleCode: 'HIP_ADDUCTORS', isPrimary: true, targetPercentage: 90 },
    ]
    second.exerciseMuscles = [...first.exerciseMuscles].reverse()

    expect(generateOptimDemo(baseInputs(), context([first])).exercises[0].primaryBucket).toBe('legs')
    expect(generateOptimDemo(baseInputs(), context([second])).exercises[0].primaryBucket).toBe('legs')
  })

  it('uses the highest-effort muscle when legacy catalog data marks no primary muscle', () => {
    // Why: authored array order is not a training signal. Optim and the muscle
    // usage radar must attribute the same legacy row to the same dominant
    // bucket or split/recovery decisions change when catalog rows are reordered.
    const legacy = {
      ...exercise('LEGACY_UNMARKED_ROW', 'BICEPS_BRACHII'),
      exerciseMuscles: [
        { muscleCode: 'BICEPS_BRACHII', isPrimary: false, targetPercentage: 30 },
        { muscleCode: 'LATISSIMUS_DORSI', isPrimary: false, targetPercentage: 70 },
      ],
    } as ExerciseListItem

    expect(generateOptimDemo(baseInputs({ split: 'pull' }), context([legacy])).exercises[0].primaryBucket)
      .toBe('back')
  })

  it('resolves equal overhead-press movers to shoulders without losing arm recovery', () => {
    const first = exercise('TIED_PRESS_A', 'TRICEPS_BRACHII', { name: 'Barbell Overhead Press' })
    const second = exercise('TIED_PRESS_B', 'ANTERIOR_DELTOID', { name: 'Barbell Overhead Press' })
    first.exerciseMuscles = [
      { muscleCode: 'TRICEPS_BRACHII', isPrimary: true, targetPercentage: 40 },
      { muscleCode: 'ANTERIOR_DELTOID', isPrimary: true, targetPercentage: 40 },
    ]
    second.exerciseMuscles = [...first.exerciseMuscles].reverse()

    const firstResult = generateOptimDemo(baseInputs(), context([first], [completedWorkout('TIED_PRESS_A')]))
    const secondResult = generateOptimDemo(baseInputs(), context([second]))

    expect(firstResult.exercises[0].primaryBucket).toBe('shoulders')
    expect(secondResult.exercises[0].primaryBucket).toBe('shoulders')
    expect(firstResult.muscleUsage.shoulders).toBeGreaterThan(0)
    expect(firstResult.muscleUsage.arms).toBeGreaterThan(0)
  })

  it('keeps unequal authored overhead-press targets authoritative', () => {
    const press = exercise('TRICEPS_DOMINANT_PRESS', 'TRICEPS_BRACHII', { name: 'Barbell Overhead Press' })
    press.exerciseMuscles = [
      { muscleCode: 'TRICEPS_BRACHII', isPrimary: true, targetPercentage: 50 },
      { muscleCode: 'ANTERIOR_DELTOID', isPrimary: true, targetPercentage: 40 },
    ]

    expect(generateOptimDemo(baseInputs(), context([press])).exercises[0].primaryBucket).toBe('arms')
  })

  it('limits the tied-shoulder preference to overhead presses', () => {
    const lunge = exercise('TIED_FRONT_RAISE_LUNGE', 'LATERAL_DELTOID', { name: 'Front Raise Lunge' })
    lunge.exerciseMuscles = [
      { muscleCode: 'LATERAL_DELTOID', isPrimary: true, targetPercentage: 60 },
      { muscleCode: 'QUADRICEPS', isPrimary: true, targetPercentage: 60 },
    ]
    const noShoulder = exercise('TIED_BEHIND_BACK_PRESS', 'QUADRICEPS', { name: 'Behind-Back Push-Press' })
    noShoulder.exerciseMuscles = [
      { muscleCode: 'QUADRICEPS', isPrimary: true, targetPercentage: 40 },
      { muscleCode: 'TRICEPS_BRACHII', isPrimary: true, targetPercentage: 40 },
    ]
    const pressWithCore = exercise('TIED_PRESS_WITH_CORE', 'RECTUS_ABDOMINIS', {
      name: 'Dumbbell Seated Military-Press with In-Out Leg Raise',
    })
    pressWithCore.exerciseMuscles = [
      { muscleCode: 'RECTUS_ABDOMINIS', isPrimary: true, targetPercentage: 30 },
      { muscleCode: 'ANTERIOR_DELTOID', isPrimary: true, targetPercentage: 30 },
    ]

    expect(generateOptimDemo(baseInputs(), context([lunge])).exercises[0].primaryBucket).toBe('shoulders')
    expect(generateOptimDemo(baseInputs(), context([noShoulder])).exercises[0].primaryBucket).toBe('legs')
    expect(generateOptimDemo(baseInputs(), context([pressWithCore])).exercises[0]).toMatchObject({
      phase: 'strength',
      primaryBucket: 'shoulders',
    })
  })

  it('uses powerlifting tags as the low-rep fallback when recovered metadata is absent', () => {
    const standard = exercise('SYNTHETIC_STANDARD_LIFT', 'QUADRICEPS', {
      equipment: 'BARBELL',
      tags: ['COMPOUND'],
    })
    const lowRep = exercise('SYNTHETIC_POWER_LIFT', 'QUADRICEPS', {
      equipment: 'BARBELL',
      tags: ['POWERLIFTING'],
    })
    const standardReps = generateOptimDemo(
      baseInputs({ goal: 'strength' }),
      context([standard]),
    ).exercises[0].sets.find((set) => set.setType === 'normal')?.reps ?? 0
    const lowReps = generateOptimDemo(
      baseInputs({ goal: 'strength' }),
      context([lowRep]),
    ).exercises[0].sets.find((set) => set.setType === 'normal')?.reps ?? 0

    expect(lowReps).toBeLessThan(standardReps)
  })

  it('never scales a one-rep powerlifting scheme down to zero reps', () => {
    const squat = exercise('BARBELL_SQUAT_ZERO_REP_GUARD', 'QUADRICEPS', {
      equipment: 'BARBELL',
      tags: ['POWERLIFTING'],
    })
    const result = generateOptimDemo(
      baseInputs({ goal: 'powerlifting', generationDateIso: '2026-01-21T12:00:00.000Z' }),
      context([squat]),
    )

    expect(result.exercises[0].sets.filter((set) => set.setType === 'normal').every((set) => set.reps === 1))
      .toBe(true)
  })

  it('reserves enabled cardio and mobility time before sizing the strength workout', () => {
    const treadmill = exercise('TREADMILL_RUN', 'QUADRICEPS', {
      equipment: 'TREADMILL',
      type: 'TREADMILL',
      tags: ['CARDIO'],
      measurements: ['DURATION'],
    })
    const mobility = Array.from({ length: 12 }, (_, index) =>
      exercise(`MOBILITY_${index}`, index % 2 ? 'QUADRICEPS' : 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        type: 'STATIC_STRETCHES',
        tags: ['STRETCHING', 'BODYWEIGHT_ONLY'],
        measurements: ['DURATION'],
      }))
    const source = context([chest, legs, treadmill, ...mobility])
    const withoutStages = generateOptimDemo(baseInputs({ goal: 'muscleTone', nonCoreCountOverride: null }), source)
    const withStages = generateOptimDemo(baseInputs({
      goal: 'muscleTone',
      availableEquipmentCodes: ['BARBELL', 'TREADMILL'],
      nonCoreCountOverride: null,
      cardioEnabled: true,
      mobilityWarmupEnabled: true,
      mobilityCooldownEnabled: true,
    }), source)

    expect(withStages.counts.computedNonCore).toBeLessThan(withoutStages.counts.computedNonCore)
    expect(withStages.events.find((event) => event.includes('Duration formula')))
      .toBe('Duration formula reserved 32 minutes for enabled stages and budgeted 28 minutes for 5 non-core and 0 core exercises.')
    expect(withStages.counts.generatedMobility).toBe(6)
  })

  it('keeps a 15-minute strength session intact and omits optional stages that cannot fit', () => {
    const treadmill = exercise('HARD_CAP_TREADMILL', 'QUADRICEPS', {
      equipment: 'TREADMILL',
      type: 'TREADMILL',
      tags: ['CARDIO'],
      measurements: ['DURATION'],
    })
    const mobility = [0, 1].map(index => exercise(`HARD_CAP_MOBILITY_${index}`, 'QUADRICEPS', {
      type: 'STATIC_STRETCHES',
      tags: ['STRETCHING', 'BODYWEIGHT_ONLY'],
      measurements: ['DURATION'],
    }))
    const strengthPool = [
      chest,
      legs,
      exercise('HARD_CAP_ROW', 'LATISSIMUS_DORSI', { equipment: 'BARBELL' }),
      exercise('HARD_CAP_PRESS', 'ANTERIOR_DELTOID', { equipment: 'BARBELL' }),
      exercise('HARD_CAP_CURL', 'BICEPS_BRACHII', { equipment: 'BARBELL' }),
      exercise('HARD_CAP_CORE', 'RECTUS_ABDOMINIS', { tags: ['BODYWEIGHT_ONLY'] }),
    ]
    const common = baseInputs({
      durationMinutes: 15,
      goal: 'muscleTone',
      availableEquipmentCodes: ['BARBELL', 'TREADMILL'],
      nonCoreCountOverride: null,
      coreCountOverride: null,
    })
    const source = context([...strengthPool, treadmill, ...mobility])
    const strengthOnly = generateOptimDemo(common, source)
    const withStages = generateOptimDemo({
      ...common,
      cardioEnabled: true,
      mobilityWarmupEnabled: true,
      mobilityCooldownEnabled: true,
    }, source)

    expect([
      strengthOnly.events.find(event => event.includes('Duration formula')),
      withStages.events.find(event => event.includes('Duration formula')),
    ]).toEqual([
      'Duration formula reserved 0 minutes for enabled stages and budgeted 15 minutes for 4 non-core and 2 core exercises.',
      'Duration formula reserved 0 minutes for enabled stages and budgeted 15 minutes for 4 non-core and 2 core exercises.',
    ])
    expect(withStages.exercises.filter(item => item.phase === 'strength' || item.phase === 'core'))
      .toEqual(strengthOnly.exercises)
    expect(withStages.counts.generatedCardio).toBe(0)
    expect(withStages.counts.generatedMobility).toBe(0)
    expect(withStages.events).toContainEqual(expect.stringContaining('Hard duration cap: cardio needs 7 minutes'))
    expect(estimatedResultSeconds(withStages)).toBeLessThanOrEqual(15 * 60)
  })

  it('reserves a timed cardio exercise by its seven-minute emitted floor', () => {
    const treadmill = exercise('EXACT_RESERVE_TREADMILL', 'QUADRICEPS', {
      equipment: 'TREADMILL',
      type: 'TREADMILL',
      tags: ['CARDIO'],
      measurements: ['DURATION'],
    })
    const inputs = baseInputs({
      durationMinutes: 22,
      goal: 'strength',
      availableEquipmentCodes: ['BARBELL', 'TREADMILL'],
      cardioEnabled: true,
      selectedCardioExerciseCodes: ['EXACT_RESERVE_TREADMILL'],
    })
    const source = context([chest, treadmill])
    const result = generateOptimDemo(inputs, source)
    const emittedReservation = generateOptimDemo({
      ...inputs,
      cardioReservationMatchesEmittedEnabled: true,
    }, source)

    expect(result.counts.generatedCardio).toBe(1)
    expect(result.events.find(event => event.includes('Duration formula')))
      .toBe('Duration formula reserved 7 minutes for enabled stages and budgeted 15 minutes for 1 non-core and 0 core exercises.')
    expect(estimatedResultSeconds(result)).toBeLessThanOrEqual(22 * 60)
    expect(emittedReservation).toEqual(result)
  })

  it('holds the duration ceiling across short all-stage goal combinations', () => {
    const treadmill = exercise('SWEEP_TREADMILL', 'QUADRICEPS', {
      equipment: 'TREADMILL',
      type: 'TREADMILL',
      tags: ['CARDIO'],
      measurements: ['DURATION'],
    })
    const mobility = Array.from({ length: 8 }, (_, index) =>
      exercise(`SWEEP_MOBILITY_${index}`, index % 2 ? 'QUADRICEPS' : 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        type: 'STATIC_STRETCHES',
        tags: ['STRETCHING', 'BODYWEIGHT_ONLY'],
        measurements: ['DURATION'],
      }))
    const powerLift = exercise('SWEEP_POWER_LIFT', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'POWERLIFTING'],
    })
    const olympicLift = exercise('SWEEP_OLYMPIC_LIFT', 'QUADRICEPS', {
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'OLYMPIC_LIFTING'],
    })
    const source = context([chest, legs, powerLift, olympicLift, treadmill, ...mobility])
    const goals: OptimDemoInputs['goal'][] = [
      'strength',
      'bodybuilding',
      'general',
      'muscleTone',
      'powerlifting',
      'olympic',
    ]

    for (const durationMinutes of [15, 20, 30]) {
      for (const goal of goals) {
        const result = generateOptimDemo(baseInputs({
          durationMinutes,
          goal,
          experience: 'advanced',
          split: 'fullBody',
          availableEquipmentCodes: ['BARBELL', 'TREADMILL'],
          cardioEnabled: true,
          mobilityWarmupEnabled: true,
          mobilityCooldownEnabled: true,
        }), source)

        expect(estimatedResultSeconds(result), `${goal} ${durationMinutes} minutes`)
          .toBeLessThanOrEqual(durationMinutes * 60)
      }
    }
  })

  it('prioritizes session-relevant mobility and rotates equal matches by date', () => {
    const legMobility = exercise('LEG_MOBILITY', 'QUADRICEPS', {
      type: 'STATIC_STRETCHES',
      tags: ['STRETCHING', 'BODYWEIGHT_ONLY'],
      measurements: ['DURATION'],
    })
    const chestMobilityA = exercise('CHEST_MOBILITY_A', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      type: 'STATIC_STRETCHES',
      tags: ['STRETCHING', 'BODYWEIGHT_ONLY'],
      measurements: ['DURATION'],
    })
    const chestMobilityB = exercise('CHEST_MOBILITY_B', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      type: 'STATIC_STRETCHES',
      tags: ['STRETCHING', 'BODYWEIGHT_ONLY'],
      measurements: ['DURATION'],
    })
    const source = context([chest, legMobility, chestMobilityA, chestMobilityB])
    const first = generateOptimDemo(baseInputs({
      durationMinutes: 20,
      mobilityWarmupEnabled: true,
      generationDateIso: DATE,
    }), source)
    const next = generateOptimDemo(baseInputs({
      durationMinutes: 20,
      mobilityWarmupEnabled: true,
      generationDateIso: '2026-07-16T12:00:00.000Z',
    }), source)

    expect(first.exercises[0].primaryBucket).toBe('chest')
    expect(next.exercises[0].primaryBucket).toBe('chest')
    expect(next.exercises[0].code).not.toBe(first.exercises[0].code)
  })

  it('covers available muscle buckets before repeating one in a full-body workout', () => {
    const secondChest = exercise('INCLINE_BENCH', 'PECTORALIS_MAJOR_CLAVICULAR_HEAD', {
      equipment: 'BARBELL',
      popularity: 9,
    })
    const back = exercise('BARBELL_ROW', 'LATISSIMUS_DORSI', { equipment: 'BARBELL', popularity: 8 })
    const result = generateOptimDemo(
      baseInputs({ split: 'fullBody', nonCoreCountOverride: 3 }),
      context([
        exercise('BENCH_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', popularity: 10 }),
        secondChest,
        back,
        exercise('BACK_SQUAT', 'QUADRICEPS', { equipment: 'BARBELL', popularity: 7 }),
      ]),
    )

    expect(new Set(result.exercises.filter((item) => item.phase === 'strength').map((item) => item.primaryBucket)))
      .toEqual(new Set(['chest', 'back', 'legs']))
  })

  it('uses an accessory before selecting a third variation of the same lift family', () => {
    const result = generateOptimDemo(
      baseInputs({ split: 'fullBody', nonCoreCountOverride: 3 }),
      context([
        exercise('BENCH_PRESS_A', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', popularity: 10 }),
        exercise('BENCH_PRESS_B', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', popularity: 9 }),
        exercise('BENCH_PRESS_C', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', popularity: 8 }),
        exercise('CHEST_FLY', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', popularity: 7, tags: ['ISOLATION'] }),
      ]),
    )
    const codes = result.exercises.filter((item) => item.phase === 'strength').map((item) => item.code)

    expect(codes).toContain('CHEST_FLY')
    expect(codes).not.toContain('BENCH_PRESS_C')
  })

  it('does not grant a flat score bonus merely for requiring equipment', () => {
    const equipped = exercise('TEST_BARBELL_ROW', 'LATISSIMUS_DORSI', {
      equipment: 'BARBELL',
      popularity: 7,
    })
    const equipmentFree = exercise('TEST_BODYWEIGHT_ROW', 'LATISSIMUS_DORSI', {
      popularity: 7,
    })
    const result = generateOptimDemo(
      baseInputs({ split: 'pull' }),
      context([equipped, equipmentFree]),
    )
    const scores = Object.fromEntries(result.rankedCandidates.map((candidate) => [
      candidate.code,
      candidate.breakdown.catalogRating,
    ]))

    expect(scores.TEST_BARBELL_ROW).toBe(scores.TEST_BODYWEIGHT_ROW)
  })

  it('prefers equipment continuity when candidate quality is close', () => {
    const dumbbellPress = exercise('TEST_DUMBBELL_CHEST_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'DUMBBELLS',
      popularity: 8,
    })
    const barbellSquat = exercise('TEST_BARBELL_SQUAT', 'QUADRICEPS', {
      equipment: 'BARBELL',
      popularity: 9,
    })
    const dumbbellSquat = exercise('TEST_DUMBBELL_SQUAT', 'QUADRICEPS', {
      equipment: 'DUMBBELLS',
      popularity: 8,
    })
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL', 'DUMBBELLS'],
        split: 'fullBody',
        startingExerciseCodes: ['TEST_DUMBBELL_CHEST_PRESS'],
        nonCoreCountOverride: 2,
      }),
      context([dumbbellPress, barbellSquat, dumbbellSquat]),
    )

    expect(result.exercises.filter((item) => item.phase === 'strength').map((item) => item.code))
      .toEqual(['TEST_DUMBBELL_CHEST_PRESS', 'TEST_DUMBBELL_SQUAT'])
  })

  it('includes an exact 0.15 score gap for equipment continuity without admitting the next thousandth', () => {
    const dumbbellPress = exercise('TEST_DUMBBELL_BOUNDARY_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'DUMBBELLS',
      popularity: 8,
    })
    const barbellSquat = exercise('TEST_BARBELL_BOUNDARY_SQUAT', 'QUADRICEPS', {
      equipment: 'BARBELL',
      popularity: 9,
    })
    const dumbbellSquat = (popularity: number) => exercise('TEST_DUMBBELL_BOUNDARY_SQUAT', 'QUADRICEPS', {
      equipment: 'DUMBBELLS',
      popularity,
    })
    const inputs = baseInputs({
      availableEquipmentCodes: ['BARBELL', 'DUMBBELLS'],
      split: 'fullBody',
      startingExerciseCodes: ['TEST_DUMBBELL_BOUNDARY_PRESS'],
      nonCoreCountOverride: 2,
    })
    const codes = (popularity: number) => generateOptimDemo(
      inputs,
      context([dumbbellPress, barbellSquat, dumbbellSquat(popularity)]),
    ).exercises.filter(item => item.phase === 'strength').map(item => item.code)

    expect(codes(7.5)).toEqual(['TEST_DUMBBELL_BOUNDARY_PRESS', 'TEST_DUMBBELL_BOUNDARY_SQUAT'])
    expect(codes(7.49)).toEqual(['TEST_DUMBBELL_BOUNDARY_PRESS', 'TEST_BARBELL_BOUNDARY_SQUAT'])
  })

  it('uses a competitive new movement pattern before repeating a pinned lift family', () => {
    const pullUp = exercise('PATTERN_PULL_UP', 'LATISSIMUS_DORSI', {
      equipment: 'PULL_UP_BAR', name: 'Pull-Up', popularity: 8,
    })
    const chinUp = exercise('PATTERN_CHIN_UP', 'LATISSIMUS_DORSI', {
      equipment: 'PULL_UP_BAR', name: 'Chin-Up', popularity: 9,
    })
    const row = (popularity: number) => exercise('PATTERN_BARBELL_ROW', 'LATISSIMUS_DORSI', {
      equipment: 'BARBELL', name: 'Barbell Row', popularity,
    })
    const inputs = baseInputs({
      availableEquipmentCodes: ['BARBELL', 'PULL_UP_BAR'],
      split: 'pull',
      startingExerciseCodes: ['PATTERN_PULL_UP'],
      nonCoreCountOverride: 2,
    })
    const codes = (rowPopularity: number) => generateOptimDemo(
      inputs,
      context([pullUp, chinUp, row(rowPopularity)]),
    ).exercises.filter(item => item.phase === 'strength').map(item => item.code)

    expect(codes(7.5)).toEqual(['PATTERN_PULL_UP', 'PATTERN_BARBELL_ROW'])
    expect(codes(7.49)).toEqual(['PATTERN_PULL_UP', 'PATTERN_CHIN_UP'])
  })

  it('does not treat missing movement-pattern metadata as a diversity advantage', () => {
    const result = generateOptimDemo(
      baseInputs({
        availableEquipmentCodes: ['BARBELL', 'PULL_UP_BAR'],
        split: 'pull',
        startingExerciseCodes: ['KNOWN_PULL_UP'],
        nonCoreCountOverride: 2,
      }),
      context([
        exercise('KNOWN_PULL_UP', 'LATISSIMUS_DORSI', {
          equipment: 'PULL_UP_BAR', name: 'Pull-Up', popularity: 8,
        }),
        exercise('KNOWN_CHIN_UP', 'LATISSIMUS_DORSI', {
          equipment: 'PULL_UP_BAR', name: 'Chin-Up', popularity: 9,
        }),
        exercise('UNKNOWN_BACK_MOVEMENT', 'LATISSIMUS_DORSI', {
          equipment: 'BARBELL', name: 'Barbell Pullover', popularity: 7.5,
        }),
      ]),
    )

    expect(result.exercises.filter(item => item.phase === 'strength').map(item => item.code))
      .toEqual(['KNOWN_PULL_UP', 'KNOWN_CHIN_UP'])
  })

  it('reserves strict strength openings for patterns that match an authored primary bucket', () => {
    const hybrid = exercise('HYBRID_PUNCH_LUNGE', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Forward Punch Lunge', popularity: 10, tags: ['TIER_1', 'COMPOUND'],
    })
    const bench = exercise('COMPATIBLE_BENCH_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Barbell Bench Press', equipment: 'BARBELL', popularity: 8, tags: ['TIER_1', 'COMPOUND'],
    })
    const result = generateOptimDemo(
      baseInputs({ goal: 'strength', split: 'push', nonCoreCountOverride: 2 }),
      context([hybrid, bench]),
    )
    const strength = result.exercises.filter(item => item.phase === 'strength')

    expect(strength.map(item => item.code)).toEqual(['COMPATIBLE_BENCH_PRESS', 'HYBRID_PUNCH_LUNGE'])
    expect(strength[0].trace).not.toContain('Strict position rules exhausted; selected through backup path')
    expect(strength[1].trace).toContain('Strict position rules exhausted; selected through backup path')
  })

  it('keeps sparse hybrid-only catalogs full through the visible backup path', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'strength', split: 'push', nonCoreCountOverride: 2 }),
      context([
        exercise('SPARSE_PUNCH_LUNGE', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          name: 'Forward Punch Lunge', tags: ['TIER_1', 'COMPOUND'],
        }),
        exercise('SPARSE_SQUAT_RAISE', 'ANTERIOR_DELTOID', {
          name: 'Front Slight-Squat Raise', tags: ['TIER_1', 'COMPOUND'],
        }),
      ]),
    )
    const strength = result.exercises.filter(item => item.phase === 'strength')

    expect(result.counts.generatedStrength).toBe(2)
    expect(strength.every(item =>
      item.trace.includes('Strict position rules exhausted; selected through backup path'))).toBe(true)
  })

  it('keeps an explicitly pinned hybrid first even when it is not a strict main lift', () => {
    const hybrid = exercise('PINNED_PUNCH_LUNGE', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Forward Punch Lunge', popularity: 10, tags: ['TIER_1', 'COMPOUND'],
    })
    const bench = exercise('PINNED_COMPATIBLE_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Barbell Bench Press', equipment: 'BARBELL', popularity: 8, tags: ['TIER_1', 'COMPOUND'],
    })
    const result = generateOptimDemo(
      baseInputs({
        goal: 'strength',
        split: 'push',
        startingExerciseCodes: ['PINNED_PUNCH_LUNGE'],
        nonCoreCountOverride: 2,
      }),
      context([hybrid, bench]),
    )
    const strength = result.exercises.filter(item => item.phase === 'strength')

    expect(strength.map(item => item.code)).toEqual(['PINNED_PUNCH_LUNGE', 'PINNED_COMPATIBLE_BENCH'])
    expect(strength[0].trace).toContain('Pinned by starting-exercise input')
  })

  it('keeps strict main-lift replacement deterministic for the same source snapshot', () => {
    const inputs = baseInputs({ goal: 'strength', split: 'push', nonCoreCountOverride: 2, seed: 1 })
    const source = context([
      exercise('DETERMINISTIC_PUNCH_LUNGE', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Forward Punch Lunge', popularity: 10, tags: ['TIER_1', 'COMPOUND'],
      }),
      exercise('DETERMINISTIC_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Barbell Bench Press', equipment: 'BARBELL', popularity: 8, tags: ['TIER_1', 'COMPOUND'],
      }),
    ])

    expect(generateOptimDemo(inputs, source)).toEqual(generateOptimDemo(inputs, source))
  })

  it('keeps legitimate arm-dominant bench work primary without promoting shoulder rows', () => {
    const closeGripBench = generateOptimDemo(
      baseInputs({ goal: 'strength' }),
      context([exercise('ARM_BENCH', 'TRICEPS_BRACHII', {
        name: 'Close-Grip Bench Press', tags: ['TIER_1', 'COMPOUND'],
      })]),
    ).exercises[0]
    const uprightRow = generateOptimDemo(
      baseInputs({ goal: 'strength' }),
      context([exercise('SHOULDER_ROW', 'LATERAL_DELTOID', {
        name: 'Barbell Upright Row', tags: ['TIER_1', 'COMPOUND'],
      })]),
    ).exercises[0]

    expect(closeGripBench.trace).not.toContain('Strict position rules exhausted; selected through backup path')
    expect(uprightRow.trace).toContain('Strict position rules exhausted; selected through backup path')
  })

  it('uses every tied top primary bucket when deciding whether a pattern is compatible', () => {
    const first = exercise('TIED_LUNGE_PRIMARY_A', 'LATERAL_DELTOID', { name: 'Front Raise Lunge' })
    first.exerciseMuscles = [
      { muscleCode: 'LATERAL_DELTOID', isPrimary: true, targetPercentage: 60 },
      { muscleCode: 'QUADRICEPS', isPrimary: true, targetPercentage: 60 },
    ]
    const second = exercise('TIED_LUNGE_PRIMARY_B', 'QUADRICEPS', { name: 'Front Raise Lunge' })
    second.exerciseMuscles = [...first.exerciseMuscles].reverse()

    for (const item of [first, second]) {
      const selected = generateOptimDemo(baseInputs({ goal: 'strength' }), context([item])).exercises[0]
      expect(selected.trace).not.toContain('Strict position rules exhausted; selected through backup path')
    }
  })

  it('still counts demoted hybrids toward their real movement-pattern diversity cap', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'muscleTone', split: 'push', nonCoreCountOverride: 3 }),
      context([
        exercise('HYBRID_LUNGE_A', 'PECTORALIS_MAJOR_STERNAL_HEAD', { name: 'Forward Punch Lunge' }),
        exercise('HYBRID_LUNGE_B', 'PECTORALIS_MAJOR_STERNAL_HEAD', { name: 'Side Punch Lunge' }),
        exercise('HYBRID_LUNGE_C', 'PECTORALIS_MAJOR_STERNAL_HEAD', { name: 'Reverse Punch Lunge' }),
        exercise('HYBRID_CHEST_FLY', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          name: 'Chest Fly', tags: ['TIER_2', 'ISOLATION'],
        }),
      ]),
    )
    const codes = result.exercises.filter(item => item.phase === 'strength').map(item => item.code)

    expect(codes.filter(code => code.startsWith('HYBRID_LUNGE_'))).toHaveLength(2)
    expect(codes).toContain('HYBRID_CHEST_FLY')
  })

  it('opens general-fitness workouts with a primary movement when one is available', () => {
    const primary = exercise('BACK_SQUAT', 'QUADRICEPS', {
      equipment: 'BARBELL',
      popularity: 9,
      tags: ['COMPOUND'],
    })
    const isolation = exercise('LATERAL_RAISE', 'LATERAL_DELTOID', {
      equipment: 'BARBELL',
      popularity: 1,
      tags: ['ISOLATION'],
    })
    const result = generateOptimDemo(
      baseInputs(),
      context([primary, isolation], [completedWorkout('BACK_SQUAT')]),
    )

    expect(result.exercises[0].code).toBe('BACK_SQUAT')
  })

  it('opens muscle-tone workouts with primary movements before isolation work', () => {
    const bench = exercise('TONE_BENCH_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL',
      popularity: 8,
      tags: ['COMPOUND'],
    })
    const isolation = exercise('TONE_TRICEP_KICKBACK', 'TRICEPS_BRACHII', {
      equipment: 'BARBELL',
      popularity: 10,
      tags: ['ISOLATION'],
    })
    const result = generateOptimDemo(
      baseInputs({ goal: 'muscleTone', split: 'upper', nonCoreCountOverride: 2 }),
      context([bench, isolation]),
    )

    expect(result.exercises.filter((item) => item.phase === 'strength')[0].code).toBe('TONE_BENCH_PRESS')
  })

  it('keeps generic bench and squat on catalog fallback until sibling levels are trustworthy', () => {
    const bench = exercise('BARBELL.BENCH.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Barbell Bench Press',
      equipment: 'BARBELL',
      tags: ['POWERLIFTING', 'COMPOUND'],
    })
    const squat = exercise('BARBELL.SQUAT', 'QUADRICEPS', {
      name: 'Barbell Squat',
      equipment: 'BARBELL',
      tags: ['POWERLIFTING', 'COMPOUND'],
    })
    const beginner = generateOptimDemo(
      baseInputs({ experience: 'beginner', split: 'fullBody', nonCoreCountOverride: 2 }),
      context([bench, squat]),
    )
    const beginnerLunge = generateOptimDemo(
      baseInputs({ experience: 'beginner', split: 'lower', nonCoreCountOverride: 1 }),
      context([exercise('LUNGE', 'QUADRICEPS', { name: 'Lunge' })]),
    )

    expect(new Set(beginner.exercises.map(item => item.code))).toEqual(new Set(['BARBELL.BENCH.PRESS', 'BARBELL.SQUAT']))
    expect(beginner.rejectedCandidates.some(candidate => candidate.reasons.includes('experience level'))).toBe(false)
    expect(beginnerLunge.exercises[0]?.code).toBe('LUNGE')
  })

  it('orders the selected primary lifts before accessories when the recovered position rules permit it', () => {
    const barbellBench = exercise('ORDER_BARBELL_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL',
      name: 'Barbell Bench Press',
      popularity: 10,
      tags: ['TIER_1', 'COMPOUND'],
    })
    const squat = exercise('ORDER_BARBELL_SQUAT', 'QUADRICEPS', {
      equipment: 'BARBELL',
      name: 'Barbell Squat',
      popularity: 9,
      tags: ['TIER_1', 'COMPOUND'],
    })
    const legExtension = exercise('ORDER_CABLE_LEG_EXTENSION', 'QUADRICEPS', {
      equipment: 'BARBELL',
      name: 'Cable Seated Leg Extension',
      popularity: 10,
      tags: ['TIER_2', 'ISOLATION'],
    })
    const dumbbellBench = exercise('ORDER_DUMBBELL_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL',
      name: 'Dumbbell Bench Press',
      popularity: 8,
      tags: ['TIER_2', 'COMPOUND'],
    })
    const result = generateOptimDemo(
      baseInputs({ goal: 'strength', split: 'fresh', nonCoreCountOverride: 4 }),
      context([barbellBench, squat, legExtension, dumbbellBench]),
    )
    const codes = result.exercises.filter(item => item.phase === 'strength').map(item => item.code)

    expect(new Set(codes)).toEqual(new Set([
      'ORDER_BARBELL_BENCH',
      'ORDER_BARBELL_SQUAT',
      'ORDER_CABLE_LEG_EXTENSION',
      'ORDER_DUMBBELL_BENCH',
    ]))
    expect(codes.indexOf('ORDER_DUMBBELL_BENCH')).toBeLessThan(codes.indexOf('ORDER_CABLE_LEG_EXTENSION'))
  })

  it('keeps a pinned accessory first even when primary lifts follow it', () => {
    const accessory = exercise('PINNED_LATERAL_RAISE', 'LATERAL_DELTOID', {
      equipment: 'BARBELL',
      name: 'Barbell Lateral Raise',
      tags: ['TIER_3', 'ISOLATION'],
    })
    const primary = exercise('PINNED_OVERHEAD_PRESS', 'ANTERIOR_DELTOID', {
      equipment: 'BARBELL',
      name: 'Barbell Overhead Press',
      tags: ['TIER_1', 'COMPOUND'],
    })
    const result = generateOptimDemo(
      baseInputs({ startingExerciseCodes: ['PINNED_LATERAL_RAISE'], nonCoreCountOverride: 2 }),
      context([accessory, primary]),
    )

    expect(result.exercises.filter(item => item.phase === 'strength').map(item => item.code))
      .toEqual(['PINNED_LATERAL_RAISE', 'PINNED_OVERHEAD_PRESS'])
  })

  it('uses a distinct movement instead of an exact implement variant when the catalog can fill the slot', () => {
    const catalog = [
      exercise('VARIANT_BARBELL_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        equipment: 'BARBELL', name: 'Barbell Bench Press', popularity: 10, tags: ['TIER_1', 'COMPOUND'],
      }),
      exercise('VARIANT_DUMBBELL_OVERHEAD_PRESS', 'ANTERIOR_DELTOID', {
        equipment: 'BARBELL', name: 'Dumbbell Overhead Press', popularity: 9, tags: ['TIER_1', 'COMPOUND'],
      }),
      exercise('VARIANT_EZ_TRICEPS_EXTENSION', 'TRICEPS_BRACHII', {
        equipment: 'BARBELL', name: 'EZ-Bar Triceps Extension', popularity: 9, tags: ['TIER_2', 'ISOLATION'],
      }),
      exercise('VARIANT_DUMBBELL_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        equipment: 'BARBELL', name: 'Dumbbell Bench Press', popularity: 9, tags: ['TIER_2', 'COMPOUND'],
      }),
      exercise('VARIANT_DUMBBELL_FLY', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        equipment: 'BARBELL', name: 'Dumbbell Fly', popularity: 8, tags: ['TIER_2', 'ISOLATION'],
      }),
    ]
    const result = generateOptimDemo(
      baseInputs({ goal: 'strength', split: 'push', nonCoreCountOverride: 4 }),
      context(catalog),
    )
    const codes = result.exercises.filter(item => item.phase === 'strength').map(item => item.code)

    expect(codes).toHaveLength(4)
    expect(codes).toContain('VARIANT_DUMBBELL_FLY')
    expect(codes).not.toContain('VARIANT_DUMBBELL_BENCH')
  })

  it('falls back to exact implement variants when they are the only way to fill the workout', () => {
    const result = generateOptimDemo(
      baseInputs({ nonCoreCountOverride: 2 }),
      context([
        exercise('SPARSE_BARBELL_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Barbell Bench Press', tags: ['TIER_1', 'COMPOUND'],
        }),
        exercise('SPARSE_DUMBBELL_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Dumbbell Bench Press', tags: ['TIER_2', 'COMPOUND'],
        }),
      ]),
    )

    expect(result.counts.generatedStrength).toBe(2)
  })

  it('prefers a distinct authentic powerlifting movement over the same bench under another bar label', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'powerlifting', split: 'push', nonCoreCountOverride: 2 }),
      context([
        exercise('POWER_BARBELL_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Barbell Bench Press', popularity: 10, tags: ['POWERLIFTING'],
        }),
        exercise('POWER_EZ_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'EZ-Bar Bench Press', popularity: 9, tags: ['POWERLIFTING'],
        }),
        exercise('POWER_WIDE_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Barbell Wide Bench Press', popularity: 8, tags: ['POWERLIFTING'],
        }),
      ]),
    )
    const codes = result.exercises.filter(item => item.phase === 'strength').map(item => item.code)

    expect(codes).toEqual(['POWER_BARBELL_BENCH', 'POWER_WIDE_BENCH'])
  })

  it('still fills a sparse powerlifting pool with exact implement variants', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'powerlifting', split: 'push', nonCoreCountOverride: 2 }),
      context([
        exercise('SPARSE_POWER_BARBELL_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Barbell Bench Press', popularity: 10, tags: ['POWERLIFTING'],
        }),
        exercise('SPARSE_POWER_EZ_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'EZ-Bar Bench Press', popularity: 9, tags: ['POWERLIFTING'],
        }),
      ]),
    )

    expect(result.counts.generatedStrength).toBe(2)
  })

  it('prefers a distinct authentic Olympic lift over the same clean under another bar label', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'olympic', split: 'lower', experience: 'intermediate', nonCoreCountOverride: 2 }),
      context([
        exercise('OLYMPIC_BARBELL_POWER_CLEAN', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Barbell Power-Clean', popularity: 10, tags: ['OLYMPIC_LIFTING', 'TIER_1'],
        }),
        exercise('OLYMPIC_POWER_CLEAN', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Power-Clean', popularity: 9, tags: ['OLYMPIC_LIFTING', 'TIER_2'],
        }),
        exercise('OLYMPIC_POWER_CLEAN_THRUSTER', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Power-Clean Thruster', popularity: 8, tags: ['OLYMPIC_LIFTING', 'TIER_2'],
        }),
      ]),
    )
    const codes = result.exercises.filter(item => item.phase === 'strength').map(item => item.code)

    expect(codes).toEqual(['OLYMPIC_BARBELL_POWER_CLEAN', 'OLYMPIC_POWER_CLEAN_THRUSTER'])
  })

  it('still fills a sparse Olympic pool with exact implement variants', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'olympic', split: 'lower', experience: 'intermediate', nonCoreCountOverride: 2 }),
      context([
        exercise('SPARSE_OLYMPIC_BARBELL_POWER_CLEAN', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Barbell Power-Clean', popularity: 10, tags: ['OLYMPIC_LIFTING', 'TIER_1'],
        }),
        exercise('SPARSE_OLYMPIC_POWER_CLEAN', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Power-Clean', popularity: 9, tags: ['OLYMPIC_LIFTING', 'TIER_2'],
        }),
      ]),
    )

    expect(result.counts.generatedStrength).toBe(2)
  })

  it('uses an underrepresented authentic bucket before tripling another after position tiers exhaust', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'powerlifting', split: 'fresh', nonCoreCountOverride: 4, coreCountOverride: 0 }),
      context([
        exercise('BALANCED_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Barbell Bench Press', popularity: 10, tags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
        }),
        exercise('BALANCED_DEADLIFT', 'HAMSTRINGS', {
          equipment: 'BARBELL', name: 'Barbell Romanian Deadlift', popularity: 9, tags: ['POWERLIFTING', 'TIER_2', 'COMPOUND'],
        }),
        exercise('BALANCED_SPLIT_SQUAT', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Barbell Split Squat', popularity: 8, tags: ['POWERLIFTING', 'TIER_3', 'COMPOUND'],
        }),
        exercise('BALANCED_BACK_SQUAT', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Barbell Back Squat', popularity: 9.9, tags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
        }),
        exercise('BALANCED_WIDE_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Barbell Wide Bench Press', popularity: 7, tags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
        }),
      ]),
    )
    const codes = result.exercises.filter(item => item.phase === 'strength').map(item => item.code)

    expect(codes).toContain('BALANCED_WIDE_BENCH')
    expect(codes).not.toContain('BALANCED_BACK_SQUAT')
  })

  it('keeps backup bucket balancing soft when only a dominant-bucket lift remains', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'powerlifting', split: 'fresh', nonCoreCountOverride: 4, coreCountOverride: 0 }),
      context([
        exercise('SOFT_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Barbell Bench Press', popularity: 10, tags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
        }),
        exercise('SOFT_DEADLIFT', 'HAMSTRINGS', {
          equipment: 'BARBELL', name: 'Barbell Romanian Deadlift', popularity: 9, tags: ['POWERLIFTING', 'TIER_2', 'COMPOUND'],
        }),
        exercise('SOFT_SPLIT_SQUAT', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Barbell Split Squat', popularity: 8, tags: ['POWERLIFTING', 'TIER_3', 'COMPOUND'],
        }),
        exercise('SOFT_BACK_SQUAT', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Barbell Back Squat', popularity: 9.9, tags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
        }),
      ]),
    )

    expect(result.counts.generatedStrength).toBe(4)
    expect(result.exercises.some(item => item.code === 'SOFT_BACK_SQUAT')).toBe(true)
  })

  it('keeps exact-variant diversity ahead of backup bucket balance', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'powerlifting', split: 'fresh', nonCoreCountOverride: 4, coreCountOverride: 0 }),
      context([
        exercise('PRIORITY_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Barbell Bench Press', popularity: 10, tags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
        }),
        exercise('PRIORITY_DEADLIFT', 'HAMSTRINGS', {
          equipment: 'BARBELL', name: 'Barbell Romanian Deadlift', popularity: 9, tags: ['POWERLIFTING', 'TIER_2', 'COMPOUND'],
        }),
        exercise('PRIORITY_SPLIT_SQUAT', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Barbell Split Squat', popularity: 8, tags: ['POWERLIFTING', 'TIER_3', 'COMPOUND'],
        }),
        exercise('PRIORITY_EZ_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'EZ-Bar Bench Press', popularity: 9.9, tags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
        }),
        exercise('PRIORITY_BACK_SQUAT', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Barbell Back Squat', popularity: 7, tags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
        }),
      ]),
    )
    const codes = result.exercises.filter(item => item.phase === 'strength').map(item => item.code)

    expect(codes).toContain('PRIORITY_BACK_SQUAT')
    expect(codes).not.toContain('PRIORITY_EZ_BENCH')
  })

  it('applies backup bucket balance consistently outside specialized goals', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'strength', split: 'fresh', nonCoreCountOverride: 4, coreCountOverride: 0 }),
      context([
        exercise('GENERAL_BALANCE_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Barbell Bench Press', popularity: 10, tags: ['TIER_1', 'COMPOUND'],
        }),
        exercise('GENERAL_BALANCE_DEADLIFT', 'HAMSTRINGS', {
          equipment: 'BARBELL', name: 'Barbell Romanian Deadlift', popularity: 9, tags: ['TIER_2', 'COMPOUND'],
        }),
        exercise('GENERAL_BALANCE_SPLIT_SQUAT', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Barbell Split Squat', popularity: 8, tags: ['TIER_3', 'COMPOUND'],
        }),
        exercise('GENERAL_BALANCE_BACK_SQUAT', 'QUADRICEPS', {
          equipment: 'BARBELL', name: 'Barbell Back Squat', popularity: 7, tags: ['TIER_1', 'COMPOUND'],
        }),
        exercise('GENERAL_BALANCE_WIDE_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          equipment: 'BARBELL', name: 'Barbell Wide Bench Press', popularity: 6, tags: ['TIER_1', 'COMPOUND'],
        }),
      ]),
    )
    const codes = result.exercises.filter(item => item.phase === 'strength').map(item => item.code)

    expect(codes).toContain('GENERAL_BALANCE_WIDE_BENCH')
    expect(codes).not.toContain('GENERAL_BALANCE_BACK_SQUAT')
  })

  it('avoids exact implement variants in core work when a distinct movement is available', () => {
    const result = generateOptimDemo(
      baseInputs({ nonCoreCountOverride: 0, coreCountOverride: 2 }),
      context([
        exercise('CORE_CABLE_DECLINE_CRUNCH', 'RECTUS_ABDOMINIS', {
          name: 'Cable Decline Crunch', popularity: 10, tags: ['TIER_2', 'ISOLATION'],
        }),
        exercise('CORE_DECLINE_CRUNCH', 'RECTUS_ABDOMINIS', {
          name: 'Decline Crunch', popularity: 9, tags: ['TIER_2', 'ISOLATION'],
        }),
        exercise('CORE_PLANK', 'RECTUS_ABDOMINIS', {
          name: 'Plank', popularity: 8, tags: ['TIER_2', 'ISOLATION'],
        }),
      ]),
    )

    expect(result.exercises.filter(item => item.phase === 'core').map(item => item.code))
      .toEqual(['CORE_CABLE_DECLINE_CRUNCH', 'CORE_PLANK'])
  })

  it('does not promote a shoulder-dominant upright row into the primary row slot', () => {
    const uprightRow = exercise('TEST_UPRIGHT_ROW', 'LATERAL_DELTOID', {
      equipment: 'BARBELL',
      name: 'Barbell Upright Row',
      popularity: 10,
      tags: ['TIER_1', 'COMPOUND'],
    })
    const backRow = exercise('TEST_BENT_OVER_ROW', 'LATISSIMUS_DORSI', {
      equipment: 'BARBELL',
      name: 'Barbell Bent-Over Row',
      popularity: 5,
      tags: ['TIER_1', 'COMPOUND'],
    })
    const result = generateOptimDemo(
      baseInputs({ goal: 'strength', nonCoreCountOverride: 1 }),
      context([uprightRow, backRow]),
    )

    expect(result.exercises[0].code).toBe('TEST_BENT_OVER_ROW')
  })

  it('avoids introducing core-only equipment when a close equipment-free option exists', () => {
    const chairCore = exercise('A_CHAIR_CORE', 'RECTUS_ABDOMINIS', {
      equipment: 'CAPTAINS_CHAIR',
      popularity: 8,
    })
    const floorCore = exercise('Z_FLOOR_CORE', 'RECTUS_ABDOMINIS', {
      popularity: 8,
    })
    const result = generateOptimDemo(
      baseInputs({ coreCountOverride: 1 }),
      context([chest, chairCore, floorCore]),
    )

    expect(result.exercises.find((item) => item.phase === 'core')?.code).toBe('Z_FLOOR_CORE')
  })

  it('fills a sparse workout after the preferred fresh-muscle capacity is exhausted', () => {
    const result = generateOptimDemo(
      baseInputs({ split: 'fresh', nonCoreCountOverride: 4 }),
      context([
        chest,
        exercise('OVERHEAD_PRESS', 'ANTERIOR_DELTOID', { equipment: 'BARBELL' }),
        exercise('BARBELL_ROW', 'LATISSIMUS_DORSI', { equipment: 'BARBELL' }),
        legs,
      ]),
    )

    expect(result.counts.generatedStrength).toBe(4)
    expect(result.events.some((event) => event.includes('No non-core candidate remained'))).toBe(false)
  })

  it('balances repeats across the selected fresh-muscle buckets', () => {
    const result = generateOptimDemo(
      baseInputs({ split: 'fresh', nonCoreCountOverride: 4 }),
      context([
        exercise('BARBELL_ROW_A', 'LATISSIMUS_DORSI', { equipment: 'BARBELL', popularity: 10 }),
        exercise('BACK_SQUAT_A', 'QUADRICEPS', { equipment: 'BARBELL', popularity: 9 }),
        exercise('BACK_SQUAT_B', 'QUADRICEPS', { equipment: 'BARBELL', popularity: 8 }),
        exercise('BACK_SQUAT_C', 'QUADRICEPS', { equipment: 'BARBELL', popularity: 7 }),
        exercise('BARBELL_ROW_B', 'LATISSIMUS_DORSI', { equipment: 'BARBELL', popularity: 6 }),
      ]),
    )
    const bucketCounts = result.exercises.reduce<Record<string, number>>((counts, item) => ({
      ...counts,
      [item.primaryBucket ?? 'none']: (counts[item.primaryBucket ?? 'none'] ?? 0) + 1,
    }), {})
    const buckets = result.exercises.map(item => item.primaryBucket)

    expect(bucketCounts).toEqual({ back: 2, legs: 2 })
    expect(buckets.every((bucket, index) => index === 0 || bucket !== buckets[index - 1])).toBe(true)
  })

  it('separates a repeated bucket at the tail when every shifted primary lift remains position-valid', () => {
    const inputs = baseInputs({ split: 'fullBody', nonCoreCountOverride: 4 })
    const source = context([
      exercise('TEST_TAIL_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', { name: 'Barbell Bench Press', equipment: 'BARBELL', popularity: 10 }),
      exercise('TEST_TAIL_ROW', 'LATISSIMUS_DORSI', { name: 'Barbell Bent-Over Row', equipment: 'BARBELL', popularity: 9 }),
      exercise('TEST_TAIL_BACK_SQUAT', 'QUADRICEPS', { name: 'Barbell Back Squat', equipment: 'BARBELL', popularity: 8 }),
      exercise('TEST_TAIL_FRONT_SQUAT', 'QUADRICEPS', { name: 'Barbell Front Squat', equipment: 'BARBELL', popularity: 7 }),
    ])
    const result = generateOptimDemo(inputs, source)
    const strength = result.exercises.filter(item => item.phase === 'strength')
    const repeatCodes = generateOptimDemo(inputs, source).exercises
      .filter(item => item.phase === 'strength')
      .map(item => item.code)

    expect(strength).toHaveLength(4)
    expect(new Set(strength.map(item => item.code))).toEqual(new Set([
      'TEST_TAIL_BENCH',
      'TEST_TAIL_ROW',
      'TEST_TAIL_BACK_SQUAT',
      'TEST_TAIL_FRONT_SQUAT',
    ]))
    expect(strength.every((item, index) => index === 0 || item.primaryBucket !== strength[index - 1].primaryBucket)).toBe(true)
    expect(strength.map(item => item.code)).toEqual(repeatCodes)
  })

  it('clusters repeated equipment stations only after main-lift and muscle-order costs tie', () => {
    // Why: leaving a station and rebuilding it later wastes time, but equipment
    // convenience must never outrank main-lift priority or fatigue separation.
    const result = generateOptimDemo(
      baseInputs({
        split: 'fullBody',
        nonCoreCountOverride: 4,
        availableEquipmentCodes: ['BARBELL', 'DUMBBELLS'],
      }),
      context([
        exercise('STATION_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          name: 'Barbell Bench Press', equipment: 'BARBELL', popularity: 10,
        }),
        exercise('STATION_SQUAT', 'QUADRICEPS', {
          name: 'Dumbbell Back Squat', equipment: 'DUMBBELLS', popularity: 7,
        }),
        exercise('STATION_ROW', 'LATISSIMUS_DORSI', {
          name: 'Barbell Bent-Over Row', equipment: 'BARBELL', popularity: 4,
        }),
        exercise('STATION_PRESS', 'ANTERIOR_DELTOID', {
          name: 'Dumbbell Overhead Press', equipment: 'DUMBBELLS', popularity: 1,
        }),
      ]),
    )
    const strength = result.exercises.filter(item => item.phase === 'strength')

    expect(strength.map(item => item.code)).toEqual([
      'STATION_BENCH',
      'STATION_ROW',
      'STATION_SQUAT',
      'STATION_PRESS',
    ])
    expect(strength.every((item, index) =>
      index === 0 || item.primaryBucket !== strength[index - 1]?.primaryBucket)).toBe(true)
    expect(result.events).toContainEqual(expect.stringContaining('avoid returning to the same equipment station'))
  })

  it('retains authored Olympic tier order when no bucket-separating move is position-valid', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'olympic', experience: 'advanced', split: 'fullBody', nonCoreCountOverride: 4 }),
      context([
        exercise('TEST_LOCKED_POWER_CLEAN', 'QUADRICEPS', { name: 'Barbell Power Clean', equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING', 'COMPOUND', 'TIER_1'] }),
        exercise('TEST_LOCKED_SNATCH_PULL', 'LATISSIMUS_DORSI', { name: 'Barbell Snatch Pull', equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING', 'COMPOUND', 'TIER_2'] }),
        exercise('TEST_LOCKED_BLOCK_SNATCH', 'QUADRICEPS', { name: 'Barbell Block Snatch', equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING', 'COMPOUND', 'TIER_3'] }),
        exercise('TEST_LOCKED_CLEAN_JERK', 'QUADRICEPS', { name: 'Barbell Clean & Jerk', equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING', 'COMPOUND', 'TIER_4'] }),
      ]),
    )
    const strength = result.exercises.filter(item => item.phase === 'strength')

    expect(strength.map(item => item.code)).toEqual([
      'TEST_LOCKED_POWER_CLEAN',
      'TEST_LOCKED_SNATCH_PULL',
      'TEST_LOCKED_BLOCK_SNATCH',
      'TEST_LOCKED_CLEAN_JERK',
    ])
    expect(strength.at(-1)?.primaryBucket).toBe(strength.at(-2)?.primaryBucket)
    expect(result.events.some(event => event.startsWith('Reordered algorithmic strength picks'))).toBe(false)
  })

  it('retains deterministic selection order above the debug reorder safety limit and reports why', () => {
    const codes = Array.from({ length: 25 }, (_, index) => `TEST_LARGE_OVERRIDE_${index}`)
    const result = generateOptimDemo(
      baseInputs({ startingExerciseCodes: codes, nonCoreCountOverride: codes.length }),
      context(codes.map((code, index) => exercise(code, index % 2 === 0 ? 'QUADRICEPS' : 'LATISSIMUS_DORSI', { equipment: 'BARBELL' }))),
    )

    expect(result.exercises.filter(item => item.phase === 'strength').map(item => item.code)).toEqual(codes)
    expect(result.events).toContainEqual(expect.stringContaining('debug safety limit is 24'))
  })

  it('keeps Olympic and powerlifting workouts inside their authored exercise pools', () => {
    const powerClean = exercise('POWER_CLEAN', 'QUADRICEPS', {
      equipment: 'BARBELL',
      tags: ['OLYMPIC_LIFTING'],
    })
    const lateralRaise = exercise('LATERAL_RAISE', 'LATERAL_DELTOID', {
      equipment: 'BARBELL',
      tags: ['COMPOUND'],
      popularity: 10,
    })
    const squat = exercise('BARBELL_SQUAT', 'QUADRICEPS', {
      equipment: 'BARBELL',
      tags: ['POWERLIFTING'],
    })
    const legExtension = exercise('LEG_EXTENSION', 'QUADRICEPS', {
      equipment: 'BARBELL',
      tags: ['COMPOUND'],
      popularity: 10,
    })
    const taggedNoise = exercise('STOOL_FORWARD_HOP', 'QUADRICEPS', {
      equipment: 'BARBELL',
      tags: ['POWERLIFTING'],
      popularity: 10,
    })
    const olympic = generateOptimDemo(baseInputs({ goal: 'olympic' }), context([powerClean, lateralRaise]))
    const powerlifting = generateOptimDemo(baseInputs({ goal: 'powerlifting' }), context([squat, legExtension, taggedNoise]))

    expect(olympic.exercises[0].code).toBe('POWER_CLEAN')
    expect(olympic.rejectedCandidates.find((item) => item.code === 'LATERAL_RAISE')?.reasons)
      .toContain('outside Olympic lifting pool')
    expect(powerlifting.exercises[0].code).toBe('BARBELL_SQUAT')
    expect(powerlifting.rejectedCandidates.find((item) => item.code === 'LEG_EXTENSION')?.reasons)
      .toContain('outside powerlifting pool')
    expect(powerlifting.rejectedCandidates.find((item) => item.code === 'STOOL_FORWARD_HOP')?.reasons)
      .toContain('outside powerlifting pool')
  })

  it('keeps authentic Olympic lifts out of accessory rep schemes only when product policy is enabled', () => {
    // Why: every strict-pool clean, snatch, and jerk is technical work even in
    // slot four; granting more workout time must not turn it into 8-12 rep work.
    const codes = ['TECH_POWER_CLEAN', 'TECH_HANG_SNATCH', 'TECH_SPLIT_JERK', 'TECH_MUSCLE_CLEAN']
    const source = context([
      exercise(codes[0], 'QUADRICEPS', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'] }),
      exercise(codes[1], 'LATISSIMUS_DORSI', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'] }),
      exercise(codes[2], 'ANTERIOR_DELTOID', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'] }),
      exercise(codes[3], 'GLUTEUS_MAXIMUS', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'] }),
    ])
    const enabledInputs = baseInputs({
      goal: 'olympic',
      split: 'fullBody',
      nonCoreCountOverride: 4,
      startingExerciseCodes: codes,
      olympicTechnicalPrescriptionsEnabled: true,
    })
    const enabled = generateOptimDemo(enabledInputs, source)
    const enabledStrength = enabled.exercises.filter((item) => item.phase === 'strength')

    expect(enabledStrength).toHaveLength(4)
    expect(enabledStrength.every((item) => item.schemeSource.includes('olympic technical routing'))).toBe(true)
    expect(enabledStrength.flatMap((item) => item.sets)
      .filter((set) => set.setType === 'normal')
      .every((set) => (set.reps ?? 0) <= 5)).toBe(true)

    const pinnedOutsideOlympicGoal = generateOptimDemo({
      ...baseInputs({
        goal: 'bodybuilding',
        startingExerciseCodes: [codes[0]],
      }),
      olympicTechnicalPrescriptionsEnabled: true,
    }, source).exercises.find((item) => item.code === codes[0])
    expect(pinnedOutsideOlympicGoal?.schemeSource).toContain('olympic technical routing')
    expect(pinnedOutsideOlympicGoal?.sets.filter((set) => set.setType === 'normal')
      .every((set) => (set.reps ?? 0) <= 5)).toBe(true)

    const disabledInputs = { ...enabledInputs, olympicTechnicalPrescriptionsEnabled: false }
    const omittedInputs: OptimDemoInputs = { ...disabledInputs }
    delete omittedInputs.olympicTechnicalPrescriptionsEnabled
    const disabled = generateOptimDemo(disabledInputs, source)
    expect(disabled).toEqual(generateOptimDemo(omittedInputs, source))
    expect(disabled.exercises.flatMap((item) => item.sets)
      .filter((set) => set.setType === 'normal')
      .some((set) => (set.reps ?? 0) > 5)).toBe(true)
  })

  it('keeps loaded decline sit-ups inside the bodyweight progression ceiling only when enabled', () => {
    // Why: adding external load cannot make trunk flexion easier than its
    // bodyweight sibling, whose progression is already bounded at 20 reps.
    const source = context([exercise('DUMBBELL.DECLINE.SIT.UP', 'RECTUS_ABDOMINIS', {
      name: 'Dumbbell Decline Sit-Up',
      equipment: 'DUMBBELLS',
      tags: ['ABS_CORE', 'COMPOUND', 'ENDURANCE'],
    })])
    const enabledInputs = baseInputs({
      availableEquipmentCodes: ['DUMBBELLS'],
      generationDateIso: '2026-07-17T12:00:00.000Z',
      nonCoreCountOverride: 0,
      coreCountOverride: 1,
      prescriptionRepCapsEnabled: true,
    })
    const enabled = generateOptimDemo(enabledInputs, source)
    const enabledSets = enabled.exercises[0]?.sets.filter((set) => set.setType === 'normal') ?? []
    expect(enabledSets.every((set) => (set.reps ?? 0) <= 20)).toBe(true)
    expect(enabled.exercises[0]?.schemeSource).toContain('prescription metadata capped to 20 reps')
    expect(enabled.exercises[0]?.trace).toContainEqual(expect.stringContaining('loaded_trunk_flexion_bodyweight_floor'))

    const disabledInputs = { ...enabledInputs, prescriptionRepCapsEnabled: false }
    const omittedInputs: OptimDemoInputs = { ...disabledInputs }
    delete omittedInputs.prescriptionRepCapsEnabled
    const disabled = generateOptimDemo(disabledInputs, source)
    expect(disabled).toEqual(generateOptimDemo(omittedInputs, source))
    expect(disabled.exercises[0]?.sets.some((set) => (set.reps ?? 0) > 20)).toBe(true)
  })

  it('covers clean, snatch, and jerk patterns before repeating an Olympic lift family', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'olympic', split: 'fullBody', nonCoreCountOverride: 3 }),
      context([
        exercise('POWER_CLEAN_A', 'QUADRICEPS', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'], popularity: 10 }),
        exercise('POWER_CLEAN_B', 'QUADRICEPS', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'], popularity: 9 }),
        exercise('POWER_SNATCH', 'LATISSIMUS_DORSI', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'], popularity: 7 }),
        exercise('SPLIT_JERK', 'ANTERIOR_DELTOID', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'], popularity: 6 }),
      ]),
    )
    const patterns = result.exercises
      .filter((item) => item.phase === 'strength')
      .map((item) => item.code.includes('SNATCH') ? 'snatch' : item.code.includes('JERK') ? 'jerk' : 'clean')

    expect(new Set(patterns)).toEqual(new Set(['clean', 'snatch', 'jerk']))
  })

  it('balances specialized lift families within the fresh-split bucket limit', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'powerlifting', split: 'fresh', nonCoreCountOverride: 4 }),
      context([
        exercise('POWER_BENCH_PRESS_A', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', tags: ['POWERLIFTING'], popularity: 10 }),
        exercise('POWER_BENCH_PRESS_B', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', tags: ['POWERLIFTING'], popularity: 8 }),
        exercise('POWER_BENCH_PRESS_C', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', tags: ['POWERLIFTING'], popularity: 7 }),
        exercise('POWER_OVERHEAD_PRESS_A', 'ANTERIOR_DELTOID', { equipment: 'BARBELL', tags: ['POWERLIFTING'], popularity: 9 }),
        exercise('POWER_OVERHEAD_PRESS_B', 'ANTERIOR_DELTOID', { equipment: 'BARBELL', tags: ['POWERLIFTING'], popularity: 6 }),
        exercise('POWER_SQUAT_OUTSIDE_FRESH_BUCKETS', 'QUADRICEPS', { equipment: 'BARBELL', tags: ['POWERLIFTING'], popularity: 1 }),
      ]),
    )
    const familyCounts = result.exercises
      .filter((item) => item.phase === 'strength')
      .reduce<Record<string, number>>((counts, item) => {
        const family = item.code.includes('OVERHEAD') ? 'overhead' : 'bench'
        counts[family] = (counts[family] ?? 0) + 1
        return counts
      }, {})

    expect(familyCounts).toEqual({ bench: 2, overhead: 2 })
  })

  it('caps Olympic working sets to the available strength-session duration', () => {
    const core = exercise('OLYMPIC_CORE', 'RECTUS_ABDOMINIS', { tags: ['BODYWEIGHT_ONLY'] })
    const result = generateOptimDemo(
      baseInputs({
        durationMinutes: 30,
        goal: 'olympic',
        split: 'fullBody',
        nonCoreCountOverride: null,
        coreCountOverride: null,
      }),
      context([
        exercise('DURATION_POWER_CLEAN', 'QUADRICEPS', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'] }),
        exercise('DURATION_POWER_SNATCH', 'LATISSIMUS_DORSI', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'] }),
        exercise('DURATION_SPLIT_JERK', 'ANTERIOR_DELTOID', { equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING'] }),
        core,
      ]),
    )
    const strength = result.exercises.filter((item) => item.phase === 'strength')

    expect(strength).toHaveLength(3)
    expect(Math.max(...strength.map((item) => item.sets.filter((set) => set.setType === 'normal').length)))
      .toBeLessThanOrEqual(4)
    expect(strength.some((item) => item.schemeSource.includes('duration-capped'))).toBe(true)
  })

  it('budgets history-driven warm-up sets without cutting recovered working sets', () => {
    const weighted = [
      exercise('TIMED_BENCH_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL' }),
      exercise('TIMED_OVERHEAD_PRESS', 'ANTERIOR_DELTOID', { equipment: 'BARBELL' }),
      exercise('TIMED_BARBELL_CURL', 'BICEPS_BRACHII', { equipment: 'BARBELL' }),
      exercise('TIMED_BACK_SQUAT', 'QUADRICEPS', { equipment: 'BARBELL' }),
      exercise('TIMED_BARBELL_ROW', 'LATISSIMUS_DORSI', { equipment: 'BARBELL' }),
    ]
    const core = exercise('TIMED_PLANK', 'RECTUS_ABDOMINIS', {
      tags: ['BODYWEIGHT_ONLY'],
      measurements: ['REPS'],
    })
    const histories = weighted.flatMap(item =>
      [14, 30, 60].map(daysAgo => completedWorkout(item.exerciseCode ?? '', daysAgo)))
    const inputs = baseInputs({
      durationMinutes: 30,
      goal: 'muscleTone',
      split: 'fullBody',
      warmupSetsEnabled: true,
      nonCoreCountOverride: 5,
      coreCountOverride: 1,
    })
    const withWarmups = generateOptimDemo(inputs, context([...weighted, core], histories))
    const withoutWarmups = generateOptimDemo(
      { ...inputs, warmupSetsEnabled: false },
      context([...weighted, core], histories),
    )
    const estimateSeconds = (result: ReturnType<typeof generateOptimDemo>) =>
      result.exercises.reduce((total, item) => {
        const exerciseSeconds = item.sets.reduce(
          (sum, set) => sum + (set.durationSeconds ?? (set.reps ?? 0) * 3) + set.restSeconds,
          0,
        )
        return total + exerciseSeconds - (item.sets.at(-1)?.restSeconds ?? 0)
      }, 0)
    const warmupCount = withWarmups.exercises.reduce(
      (count, item) => count + item.sets.filter(set => set.setType === 'warmup').length,
      0,
    )
    const workingSetCount = (result: ReturnType<typeof generateOptimDemo>) =>
      result.exercises.reduce(
        (count, item) => count + item.sets.filter(set => set.setType === 'normal').length,
        0,
      )

    expect(warmupCount).toBeGreaterThan(0)
    expect(workingSetCount(withWarmups)).toBe(workingSetCount(withoutWarmups))
    expect(estimateSeconds(withWarmups)).toBeLessThanOrEqual(inputs.durationMinutes * 60)
  })

  it('labels an ordinary movement as strength foundation instead of a competition lift', () => {
    const result = generateOptimDemo(
      baseInputs({ goal: 'powerlifting', bodyweightOnly: true, availableEquipmentCodes: [] }),
      context([exercise('PUSH_UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', { tags: ['BODYWEIGHT_ONLY', 'POWERLIFTING'] })]),
    )

    expect(result.counts.generatedStrength).toBe(1)
    expect(result.counts.foundationNonCore).toBe(1)
    expect(result.exercises[0].schemeSource).not.toContain('powerTier')
    expect(result.exercises[0].trace.some((line) => line.includes('Strength-foundation filler'))).toBe(true)
    expect(result.events.some((event) => event.includes('Powerlifting pool filled 0/1 authentic lifts'))).toBe(true)
  })

  it('keeps authentic powerlifting work first and gives only missing slots strength semantics', () => {
    const authentic = [
      exercise('TEST_DUMBBELL_SQUAT', 'QUADRICEPS', {
        name: 'Dumbbell Back Squat',
        equipment: 'DUMBBELLS',
        tags: ['POWERLIFTING', 'COMPOUND', 'TIER_1'],
      }),
      exercise('TEST_DUMBBELL_BENCH_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Dumbbell Bench Press',
        equipment: 'DUMBBELLS',
        tags: ['POWERLIFTING', 'COMPOUND', 'TIER_2'],
      }),
    ]
    const foundation = [
      exercise('TEST_DUMBBELL_ROW', 'LATISSIMUS_DORSI', {
        name: 'Dumbbell Row',
        equipment: 'DUMBBELLS',
        tags: ['COMPOUND', 'TIER_3'],
      }),
      exercise('TEST_DUMBBELL_LUNGE', 'QUADRICEPS', {
        name: 'Dumbbell Lunge',
        equipment: 'DUMBBELLS',
        tags: ['COMPOUND', 'TIER_4'],
      }),
    ]
    const result = generateOptimDemo(
      baseInputs({
        goal: 'powerlifting',
        durationMinutes: 30,
        availableEquipmentCodes: ['DUMBBELLS'],
        nonCoreCountOverride: 4,
        coreCountOverride: 0,
      }),
      context([...authentic, ...foundation]),
    )

    expect(result.exercises.map((item) => item.code).slice(0, 2)).toEqual(authentic.map((item) => item.exerciseCode))
    expect(result.exercises.slice(0, 2).every((item) => !item.trace.some((line) => line.includes('Strength-foundation filler')))).toBe(true)
    expect(result.exercises.slice(2).every((item) => item.trace.some((line) => line.includes('Strength-foundation filler')))).toBe(true)
    expect(result.exercises.slice(2).every((item) => item.schemeSource.startsWith('strengthTier'))).toBe(true)
    expect(result.counts.foundationNonCore).toBe(2)
    expect(estimatedResultSeconds(result)).toBeLessThanOrEqual(30 * 60)
  })

  it('uses visible sport relevance to prefer a preparatory row over a more popular isolation filler', () => {
    const authentic = [
      exercise('TEST_RELEVANCE_SQUAT', 'QUADRICEPS', { name: 'Barbell Squat', equipment: 'BARBELL', tags: ['POWERLIFTING', 'COMPOUND', 'TIER_1'] }),
      exercise('TEST_RELEVANCE_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', { name: 'Barbell Bench Press', equipment: 'BARBELL', tags: ['POWERLIFTING', 'COMPOUND', 'TIER_2'] }),
    ]
    const row = exercise('TEST_RELEVANCE_ROW', 'LATISSIMUS_DORSI', {
      name: 'Barbell Row',
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'TIER_3'],
      popularity: 5,
    })
    const shrug = exercise('TEST_RELEVANCE_SHRUG', 'LATISSIMUS_DORSI', {
      name: 'Barbell Shrug',
      equipment: 'BARBELL',
      tags: ['ISOLATION', 'TIER_3'],
      popularity: 10,
    })
    const result = generateOptimDemo(
      baseInputs({ goal: 'powerlifting', nonCoreCountOverride: 3, coreCountOverride: 0 }),
      context([...authentic, row, shrug]),
    )
    const filler = result.exercises[2]

    expect(filler.code).toBe('TEST_RELEVANCE_ROW')
    expect(filler.scoreBreakdown?.sportFoundationUtility).toBe(0.75)
  })

  it('does not reward an incidental pattern word that conflicts with the primary muscle bucket', () => {
    const authentic = [
      exercise('TEST_COMPATIBLE_SQUAT', 'QUADRICEPS', { name: 'Barbell Squat', equipment: 'BARBELL', tags: ['POWERLIFTING', 'COMPOUND', 'TIER_1'] }),
      exercise('TEST_COMPATIBLE_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', { name: 'Barbell Bench Press', equipment: 'BARBELL', tags: ['POWERLIFTING', 'COMPOUND', 'TIER_2'] }),
    ]
    const squattingCurl = exercise('TEST_SQUATTING_CURL', 'BICEPS_BRACHII', {
      name: 'Cable Squatting Curl',
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'TIER_3'],
    })
    const result = generateOptimDemo(
      baseInputs({ goal: 'powerlifting', nonCoreCountOverride: 3, coreCountOverride: 0 }),
      context([...authentic, squattingCurl]),
    )

    expect(result.exercises[2].code).toBe('TEST_SQUATTING_CURL')
    expect(result.exercises[2].scoreBreakdown?.sportFoundationUtility).toBe(0)
  })

  it('gives patternless compound foundation work a small visible edge over isolation', () => {
    const authentic = [
      exercise('TEST_BODYWEIGHT_POWER_SQUAT', 'QUADRICEPS', { name: 'Bodyweight Squat', tags: ['BODYWEIGHT_ONLY', 'POWERLIFTING', 'TIER_1'] }),
      exercise('TEST_BODYWEIGHT_POWER_PRESS', 'ANTERIOR_DELTOID', { name: 'Bodyweight Overhead Press', tags: ['BODYWEIGHT_ONLY', 'POWERLIFTING', 'TIER_2'] }),
    ]
    const pushUp = exercise('TEST_HAND_RELEASE_PUSH_UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Hand Release Push-Up',
      tags: ['BODYWEIGHT_ONLY', 'COMPOUND', 'TIER_3'],
      popularity: 8,
    })
    const isolation = exercise('TEST_BODYWEIGHT_CHEST_ISOLATION', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      tags: ['BODYWEIGHT_ONLY', 'ISOLATION', 'TIER_3'],
      popularity: 10,
    })
    const result = generateOptimDemo(
      baseInputs({
        goal: 'powerlifting',
        bodyweightOnly: true,
        availableEquipmentCodes: [],
        nonCoreCountOverride: 3,
        coreCountOverride: 0,
      }),
      context([...authentic, pushUp, isolation]),
    )
    const filler = result.exercises[2]

    expect(filler.code).toBe('TEST_HAND_RELEASE_PUSH_UP')
    expect(filler.scoreBreakdown?.sportFoundationUtility).toBe(0.375)
  })

  it('reserves a coverable pull role for Olympic full-body foundation work', () => {
    const clean = exercise('TEST_ROLE_POWER_CLEAN', 'QUADRICEPS', {
      name: 'Power Clean',
      equipment: 'BARBELL',
      tags: ['OLYMPIC_LIFTING', 'COMPOUND', 'TIER_1'],
      popularity: 10,
    })
    const bench = exercise('TEST_ROLE_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Barbell Bench Press',
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'TIER_2'],
      popularity: 8,
    })
    const row = exercise('TEST_ROLE_ROW', 'LATISSIMUS_DORSI', {
      name: 'Barbell Row',
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'TIER_2'],
      popularity: 1,
    })
    const lateralRaise = exercise('TEST_ROLE_LATERAL_RAISE', 'LATERAL_DELTOID', {
      equipment: 'BARBELL',
      tags: ['ISOLATION', 'TIER_2'],
      popularity: 10,
    })
    const result = generateOptimDemo(
      baseInputs({
        goal: 'olympic',
        experience: 'advanced',
        split: 'fullBody',
        nonCoreCountOverride: 3,
        coreCountOverride: 0,
      }),
      context([clean, bench, row, lateralRaise]),
    )

    expect(result.exercises.map((item) => item.code)).toEqual([
      'TEST_ROLE_POWER_CLEAN',
      'TEST_ROLE_BENCH',
      'TEST_ROLE_ROW',
    ])
    expect(result.events).toContain('Strength-foundation full-body role coverage satisfied.')
  })

  it('keeps requested Olympic session timing when every strength slot needs foundation work', () => {
    const exercises = [
      exercise('TEST_PUSH_UP', 'PECTORALIS_MAJOR_STERNAL_HEAD', { tags: ['BODYWEIGHT_ONLY', 'COMPOUND', 'TIER_1'] }),
      exercise('TEST_BODYWEIGHT_ROW', 'LATISSIMUS_DORSI', { tags: ['BODYWEIGHT_ONLY', 'COMPOUND', 'TIER_2'] }),
      exercise('TEST_BODYWEIGHT_CARDIO', 'QUADRICEPS', {
        tags: ['BODYWEIGHT_ONLY', 'CARDIO'],
        type: 'CARDIO',
        measurements: ['DURATION'],
      }),
    ]
    const result = generateOptimDemo(
      baseInputs({
        goal: 'olympic',
        experience: 'intermediate',
        bodyweightOnly: true,
        availableEquipmentCodes: [],
        nonCoreCountOverride: 2,
        coreCountOverride: 0,
        cardioEnabled: true,
      }),
      context(exercises),
    )

    expect(result.foundationFallback).toBe(false)
    expect(result.counts.foundationNonCore).toBe(2)
    expect(result.recoveryWindowDays).toBe(6)
    expect(result.exercises.find((item) => item.phase === 'cardio')?.trace)
      .toContain('Goal multiplier produced 5 cardio minutes')
  })

  it('never moves a foundation accessory ahead of authentic Olympic lifts', () => {
    const olympic = [
      exercise('TEST_HANG_SNATCH', 'LATERAL_DELTOID', { name: 'Hang Snatch', equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING', 'PULL_SPLIT', 'TIER_1'], popularity: 10 }),
      exercise('TEST_HANG_CLEAN', 'LATISSIMUS_DORSI', { name: 'Hang Clean', equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING', 'PULL_SPLIT', 'TIER_2'], popularity: 8 }),
      exercise('TEST_SPLIT_JERK', 'ANTERIOR_DELTOID', { name: 'Split Jerk', equipment: 'BARBELL', tags: ['OLYMPIC_LIFTING', 'PUSH_SPLIT', 'TIER_3'], popularity: 6 }),
    ]
    const accessory = exercise('TEST_BARBELL_ROW', 'LATISSIMUS_DORSI', {
      name: 'Barbell Row',
      equipment: 'BARBELL',
      tags: ['COMPOUND', 'TIER_4'],
    })
    const result = generateOptimDemo(
      baseInputs({
        goal: 'olympic',
        experience: 'intermediate',
        split: 'upper',
        nonCoreCountOverride: 4,
        coreCountOverride: 0,
      }),
      context([...olympic, accessory]),
    )

    expect(result.exercises.map((item) => item.code)).toEqual([...olympic.map((item) => item.exerciseCode), accessory.exerciseCode])
    expect(result.exercises[3].schemeSource).toMatch(/^strengthTier/)
    expect(result.exercises[3].trace.some((line) => line.includes('Strength-foundation filler'))).toBe(true)
  })

  it('keeps bodyweight, split, and exclusion constraints active in the foundation pool', () => {
    const allowed = exercise('TEST_PUSH_UP_ALLOWED', 'PECTORALIS_MAJOR_STERNAL_HEAD', { tags: ['BODYWEIGHT_ONLY', 'COMPOUND'] })
    const excluded = exercise('TEST_PUSH_UP_EXCLUDED', 'PECTORALIS_MAJOR_STERNAL_HEAD', { tags: ['BODYWEIGHT_ONLY', 'COMPOUND'] })
    const offSplit = exercise('TEST_BODYWEIGHT_SQUAT', 'QUADRICEPS', { tags: ['BODYWEIGHT_ONLY', 'COMPOUND'] })
    const weighted = exercise('TEST_DUMBBELL_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'DUMBBELLS' })
    const result = generateOptimDemo(
      baseInputs({
        goal: 'powerlifting',
        bodyweightOnly: true,
        split: 'push',
        availableEquipmentCodes: ['DUMBBELLS'],
        excludedExerciseCodes: ['TEST_PUSH_UP_EXCLUDED'],
      }),
      context([allowed, excluded, offSplit, weighted]),
    )

    expect(result.exercises.map((item) => item.code)).toEqual(['TEST_PUSH_UP_ALLOWED'])
    expect(result.counts.foundationNonCore).toBe(1)
  })

  it('limits max-effort promotion to one exercise per workout', () => {
    const exercises = [
      chest,
      exercise('OVERHEAD_PRESS', 'ANTERIOR_DELTOID', { equipment: 'BARBELL' }),
      exercise('BARBELL_ROW', 'LATISSIMUS_DORSI', { equipment: 'BARBELL' }),
      legs,
    ]
    const result = generateOptimDemo(
      baseInputs({ split: 'fullBody', supersetsEnabled: true, nonCoreCountOverride: 4, seed: 0 }),
      context(exercises, exercises.flatMap((item) =>
        [1, 7, 14].map((daysAgo) => completedWorkout(item.exerciseCode ?? '', daysAgo)))),
    )

    const maxEffort = result.exercises.filter((item) => item.maxEffort)
    expect(maxEffort).toHaveLength(1)
    expect(maxEffort[0].groupId).toBeNull()
  })

  it('does not prescribe max-effort work to a beginner', () => {
    const result = generateOptimDemo(
      baseInputs({ experience: 'beginner', seed: 0 }),
      context([chest], [1, 7, 14].map((daysAgo) => completedWorkout('BENCH_PRESS', daysAgo))),
    )

    expect(result.exercises.some((item) => item.maxEffort)).toBe(false)
  })

  it('keeps primary lifts out of circuits for every goal and shortens accessory-circuit rest', () => {
    const source = context([
      exercise('BENCH_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', popularity: 10 }),
      exercise('BACK_SQUAT', 'QUADRICEPS', { equipment: 'BARBELL', popularity: 9 }),
      exercise('BARBELL_CURL', 'BICEPS_BRACHII', { equipment: 'BARBELL', popularity: 4, tags: ['ISOLATION'] }),
      exercise('BARBELL_EXTENSION', 'TRICEPS_BRACHII', { equipment: 'BARBELL', popularity: 4, tags: ['ISOLATION'] }),
    ])
    const strength = generateOptimDemo(
      baseInputs({ goal: 'strength', split: 'fullBody', circuitsEnabled: true, nonCoreCountOverride: 4 }),
      source,
    )
    const bodybuilding = generateOptimDemo(
      baseInputs({ goal: 'bodybuilding', split: 'fullBody', circuitsEnabled: true, nonCoreCountOverride: 4 }),
      source,
    )

    for (const result of [strength, bodybuilding]) {
      expect(result.exercises.find((item) => item.code === 'BENCH_PRESS')?.groupId).toBeNull()
      expect(result.exercises.find((item) => item.code === 'BACK_SQUAT')?.groupId).toBeNull()
    }
    const curl = strength.exercises.find((item) => item.code === 'BARBELL_CURL')
    const extension = strength.exercises.find((item) => item.code === 'BARBELL_EXTENSION')
    expect(curl?.groupId).not.toBeNull()
    expect(extension?.groupId).toBe(curl?.groupId)
    expect([...(curl?.sets ?? []), ...(extension?.sets ?? [])].every((set) => set.restSeconds <= 30)).toBe(true)
  })

  it('opts safe unweighted bodyweight patterns into product circuits without changing legacy results', () => {
    // Why: broad movement-pattern/tier inference correctly protects loaded
    // main lifts, but otherwise makes the engine's bodyweight circuit branch
    // unreachable for ordinary squats, rows, presses, and lunges.
    const squat = exercise('BODYWEIGHT_PATTERN_SQUAT', 'QUADRICEPS', {
      name: 'Bodyweight Squat',
      tags: ['BODYWEIGHT', 'COMPOUND', 'TIER_1'],
      type: 'BODYWEIGHT_REPS',
      measurements: ['REPS'],
    })
    const press = exercise('BODYWEIGHT_PATTERN_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Bodyweight Chest Press Push-Up',
      tags: ['BODYWEIGHT', 'COMPOUND', 'TIER_1'],
      type: 'BODYWEIGHT_REPS',
      measurements: ['REPS'],
    })
    const inputs = baseInputs({
      goal: 'general',
      experience: 'beginner',
      split: 'fullBody',
      bodyweightOnly: true,
      circuitsEnabled: true,
      availableEquipmentCodes: [],
      startingExerciseCodes: [squat.exerciseCode ?? '', press.exerciseCode ?? ''],
      nonCoreCountOverride: 2,
      coreCountOverride: 0,
    })
    const omitted = { ...inputs }
    delete omitted.bodyweightCircuitPatternGroupingEnabled
    const disabled = generateOptimDemo({
      ...inputs,
      bodyweightCircuitPatternGroupingEnabled: false,
    }, context([squat, press]))
    const enabled = generateOptimDemo({
      ...inputs,
      bodyweightCircuitPatternGroupingEnabled: true,
    }, context([squat, press]))

    expect(generateOptimDemo(omitted, context([squat, press]))).toEqual(disabled)
    expect(disabled.exercises.map((item) => item.groupType)).toEqual([null, null])
    expect(enabled.exercises.map((item) => item.code)).toEqual(disabled.exercises.map((item) => item.code))
    expect(enabled.exercises.map((item) => item.groupType)).toEqual(['circuit', 'circuit'])
    for (const exercise of enabled.exercises) {
      const prior = disabled.exercises.find((item) => item.code === exercise.code)
      expect(exercise.maxEffort).toBe(false)
      expect(exercise.weightedBodyweight).toBe(false)
      expect(exercise.sets).toHaveLength(prior?.sets.length ?? 0)
      expect(exercise.sets.every((set, index) =>
        set.restSeconds === Math.max(15, Math.floor((prior?.sets[index]?.restSeconds ?? 0) / 2)),
      )).toBe(true)
    }

    const strength = generateOptimDemo({
      ...inputs,
      goal: 'strength',
      bodyweightCircuitPatternGroupingEnabled: true,
    }, context([squat, press]))
    expect(strength.exercises.map((item) => item.groupType)).toEqual([null, null])
  })

  it('preserves timed circuit rest for sequential interval execution without changing legacy callers', () => {
    // Why: JustGains intentionally plays timed Circuit groups as AABBCC. The
    // rotating-station rest reduction is safe for normal logged circuits, but
    // would otherwise schedule repeated timed sets on half rest in the player.
    const plank = exercise('TIMED_FRONT_PLANK', 'RECTUS_ABDOMINIS', {
      name: 'Front Plank',
      tags: ['BODYWEIGHT', 'ABS_CORE', 'TIER_1'],
      type: 'STATIC_HOLD',
      measurements: ['DURATION'],
    })
    const sidePlank = exercise('TIMED_SIDE_PLANK', 'OBLIQUES', {
      name: 'Side Plank',
      tags: ['BODYWEIGHT', 'ABS_CORE', 'TIER_1'],
      type: 'STATIC_HOLD',
      measurements: ['DURATION'],
    })
    const inputs = baseInputs({
      goal: 'general',
      experience: 'beginner',
      split: 'fullBody',
      bodyweightOnly: true,
      circuitsEnabled: true,
      bodyweightCircuitPatternGroupingEnabled: true,
      availableEquipmentCodes: [],
      startingExerciseCodes: [plank.exerciseCode ?? '', sidePlank.exerciseCode ?? ''],
      nonCoreCountOverride: 0,
      coreCountOverride: 2,
    })
    const omitted = { ...inputs }
    delete omitted.timedCircuitSequentialRestEnabled
    const disabled = generateOptimDemo({
      ...inputs,
      timedCircuitSequentialRestEnabled: false,
    }, context([plank, sidePlank]))
    const enabled = generateOptimDemo({
      ...inputs,
      timedCircuitSequentialRestEnabled: true,
    }, context([plank, sidePlank]))
    const ungrouped = generateOptimDemo({
      ...inputs,
      circuitsEnabled: false,
    }, context([plank, sidePlank]))

    expect(generateOptimDemo(omitted, context([plank, sidePlank]))).toEqual(disabled)
    expect(enabled.exercises.map((item) => item.groupType)).toEqual(['circuit', 'circuit'])
    for (const exercise of enabled.exercises) {
      const legacy = disabled.exercises.find((item) => item.code === exercise.code)
      const original = ungrouped.exercises.find((item) => item.code === exercise.code)
      expect(exercise.sets.map((set) => set.restSeconds))
        .toEqual(original?.sets.map((set) => set.restSeconds))
      expect(legacy?.sets.every((set, index) =>
        set.restSeconds === Math.max(15, Math.floor((original?.sets[index]?.restSeconds ?? 0) / 2)),
      )).toBe(true)
    }
  })

  it('opts only guided general accessories past inferred tier-one circuit classification', () => {
    // Why: compound/popular live-catalog accessories often infer tier one even
    // when they are not main lifts, making loaded General circuits unreachable.
    const anchor = exercise('DUMBBELL_GOBLET_SQUAT', 'QUADRICEPS', {
      name: 'Dumbbell Goblet Squat',
      equipment: 'DUMBBELLS',
      popularity: 9,
      tags: ['COMPOUND'],
    })
    const curl = exercise('POPULAR_HAMMER_CURL', 'BICEPS_BRACHII', {
      equipment: 'DUMBBELLS',
      popularity: 9,
      tags: ['COMPOUND'],
    })
    const extension = exercise('POPULAR_TRICEPS_EXTENSION', 'TRICEPS_BRACHII', {
      equipment: 'DUMBBELLS',
      popularity: 9,
      tags: ['COMPOUND'],
    })
    const inputs = baseInputs({
      goal: 'general',
      split: 'fullBody',
      circuitsEnabled: true,
      circuitLoadGuidanceEnabled: true,
      availableEquipmentCodes: ['DUMBBELLS'],
      startingExerciseCodes: [anchor, curl, extension].map((item) => item.exerciseCode ?? ''),
      nonCoreCountOverride: 3,
      coreCountOverride: 0,
      warmupSetsEnabled: true,
    })
    const source = context(
      [anchor, curl, extension],
      [anchor, curl, extension].map((item) => completedWorkout(item.exerciseCode ?? '')),
    )
    const omitted = { ...inputs }
    delete omitted.generalAccessoryCircuitGroupingEnabled
    const disabled = generateOptimDemo({
      ...inputs,
      generalAccessoryCircuitGroupingEnabled: false,
    }, source)
    const enabled = generateOptimDemo({
      ...inputs,
      generalAccessoryCircuitGroupingEnabled: true,
    }, source)

    expect(generateOptimDemo(omitted, source)).toEqual(disabled)
    expect(disabled.exercises.map((item) => item.groupType)).toEqual([null, null, null])
    expect(enabled.exercises.map((item) => item.code)).toEqual(disabled.exercises.map((item) => item.code))
    expect(enabled.exercises.find((item) => item.code === anchor.exerciseCode)?.groupId).toBeNull()
    const enabledAccessories = enabled.exercises.filter((item) => item.code !== anchor.exerciseCode)
    expect(enabledAccessories.map((item) => item.groupType)).toEqual(['circuit', 'circuit'])
    for (const accessory of enabledAccessories) {
      const straight = disabled.exercises.find((item) => item.code === accessory.code)
      const straightLoad = straight?.sets.find((set) => set.setType === 'normal')?.weightKg ?? 0
      const circuitLoad = accessory.sets.find((set) => set.setType === 'normal')?.weightKg ?? 0
      expect(circuitLoad).toBeGreaterThan(0)
      expect(circuitLoad).toBeLessThan(straightLoad)
      expect(accessory.sets.every((set) => set.setType === 'normal' && set.targetRpe != null)).toBe(true)
    }

    for (const goal of ['strength', 'bodybuilding', 'olympic'] as const) {
      expect(generateOptimDemo({
        ...inputs,
        goal,
        generalAccessoryCircuitGroupingEnabled: true,
      }, source)).toEqual(generateOptimDemo({
        ...inputs,
        goal,
        generalAccessoryCircuitGroupingEnabled: false,
      }, source))
    }
  })

  it('keeps omitted and disabled circuit load guidance byte-compatible', () => {
    // Why: this is a product policy layered over the recovered engine. Existing
    // debug, serialized, and programmatic circuit callers must not drift.
    const disabled = baseInputs({
      circuitsEnabled: true,
      circuitLoadGuidanceEnabled: false,
      split: 'fullBody',
      nonCoreCountOverride: 2,
      startingExerciseCodes: ['COMPAT_CIRCUIT_ARMS', 'COMPAT_CIRCUIT_LEGS'],
    })
    const omitted = { ...disabled }
    delete omitted.circuitLoadGuidanceEnabled
    const source = context([
      exercise('COMPAT_CIRCUIT_ARMS', 'BICEPS_BRACHII', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
      exercise('COMPAT_CIRCUIT_LEGS', 'QUADRICEPS', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
    ], [], { gender: 'male', ageYears: 30 })

    expect(generateOptimDemo(omitted, source)).toEqual(generateOptimDemo(disabled, source))
  })

  it('guides only actual circuit members and preserves an ungrouped anchor', () => {
    // Why: circuit density warrants a conservative working load, but merely
    // requesting circuits must not erase the normal prescription on a main
    // lift that cannot join one.
    const anchor = exercise('BARBELL.BENCH.PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Barbell Bench Press',
      equipment: 'BARBELL',
      tags: ['TIER_1', 'COMPOUND', 'PLATE_LOADED'],
    })
    const curl = exercise('DUMBBELL.ALTERNATE.BICEPS.CURL', 'BICEPS_BRACHII', {
      equipment: 'DUMBBELLS',
      tags: ['TIER_2', 'ISOLATION'],
    })
    const kickback = exercise('DUMBBELL.KICKBACK', 'TRICEPS_BRACHII', {
      equipment: 'DUMBBELLS',
      tags: ['TIER_2', 'ISOLATION'],
    })
    const inputs = baseInputs({
      goal: 'general',
      split: 'fullBody',
      availableEquipmentCodes: ['BARBELL', 'DUMBBELLS'],
      executableLoadsEnabled: true,
      startingExerciseCodes: [anchor.exerciseCode ?? '', curl.exerciseCode ?? '', kickback.exerciseCode ?? ''],
      nonCoreCountOverride: 3,
      warmupSetsEnabled: true,
    })
    const source = context([anchor, curl, kickback], [], { gender: 'male', ageYears: 30 })
    const straight = generateOptimDemo(inputs, source)
    const guided = generateOptimDemo({
      ...inputs,
      circuitsEnabled: true,
      circuitLoadGuidanceEnabled: true,
    }, source)
    const straightAnchor = straight.exercises.find((item) => item.code === anchor.exerciseCode)
    const guidedAnchor = guided.exercises.find((item) => item.code === anchor.exerciseCode)
    const straightMembers = straight.exercises.filter((item) =>
      item.code === curl.exerciseCode || item.code === kickback.exerciseCode)
    const guidedMembers = guided.exercises.filter((item) =>
      item.code === curl.exerciseCode || item.code === kickback.exerciseCode)

    expect(guidedAnchor?.groupId).toBeNull()
    expect(guidedAnchor?.sets).toEqual(straightAnchor?.sets)
    expect(guidedMembers.map((item) => item.groupType)).toEqual(['circuit', 'circuit'])
    expect(guidedMembers.every((item) => item.sets.every((set) => set.setType === 'normal'))).toBe(true)
    expect(straightMembers.every((item) => item.sets.some((set) => set.setType === 'warmup'))).toBe(true)
    for (const member of guidedMembers) {
      const straightMember = straightMembers.find((item) => item.code === member.code)
      const straightSet = straightMember?.sets.find((set) => set.setType === 'normal')
      const circuitSet = member.sets.find((set) => set.setType === 'normal')
      const straightLoad = straightSet?.weightKg ?? 0
      const circuitLoad = circuitSet?.weightKg ?? 0
      const straightRest = straightSet?.restSeconds ?? 0
      const circuitRest = circuitSet?.restSeconds ?? 0
      expect(circuitLoad).toBeGreaterThan(0)
      expect(circuitLoad).toBeLessThanOrEqual(straightLoad)
      if (circuitLoad === straightLoad) {
        expect(circuitSet?.reps).toBe((straightSet?.reps ?? 0) - 2)
        expect(circuitSet?.targetRpe).toBe(8)
        expect(member.trace).toContainEqual(expect.stringContaining('reversible RPE/history window'))
      } else {
        expect(member.trace).toContainEqual(expect.stringContaining('snapped-load RPE target'))
        const loadFactor = (reps: number) => 1.0278 - Math.min(reps, 20) * 0.0278
        const straightCapacity = straightLoad / loadFactor(straightSet?.reps ?? 1)
        const guidedEffectiveReps = (circuitSet?.reps ?? 1) + (10 - (circuitSet?.targetRpe ?? 10))
        const guidedCapacity = circuitLoad / loadFactor(guidedEffectiveReps)
        expect(guidedCapacity / straightCapacity).toBeCloseTo(1, 3)
      }
      expect(circuitRest).toBe(Math.max(15, Math.floor(straightRest / 2)))
      expect(member.maxEffort).toBe(false)
      expect(member.sets.every((set) =>
        set.targetRpe != null && set.targetRpe >= 6 && set.targetRpe <= 9.5,
      )).toBe(true)
    }
    expect(guidedAnchor?.sets.every((set) => set.targetRpe == null)).toBe(true)
  })

  it('keeps load when snapped circuit reserve would reconstruct at the asymmetric rep ceiling', () => {
    // Why: an effective target near 20 credits a bad day but cannot credit the
    // matching good day, so repeated circuit history otherwise ratchets down.
    const codes = ['CEILING_LEGS', 'CEILING_CHEST', 'CEILING_HIGH_REP_SHRUG', 'CEILING_ARMS']
    const sources = [
      exercise(codes[0], 'QUADRICEPS', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
      exercise(codes[1], 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
      exercise(codes[2], 'TRAPEZIUS_UPPER_FIBERS', {
        name: 'High Rep Shrug',
        equipment: 'DUMBBELLS',
        tags: ['TIER_3', 'ISOLATION', 'HIGH_REP'],
      }),
      exercise(codes[3], 'BICEPS_BRACHII', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
    ]
    const inputs = baseInputs({
      goal: 'bodybuilding',
      split: 'fullBody',
      availableEquipmentCodes: ['DUMBBELLS'],
      executableLoadsEnabled: true,
      startingExerciseCodes: codes,
      nonCoreCountOverride: 4,
      coreCountOverride: 0,
    })
    const history = {
      workoutType: 'Log',
      workoutLogEndedAt: '2025-12-31T12:00:00.000Z',
      workoutData: [{
        exerciseCode: codes[2],
        exerciseData: [1, 2, 3].map((setNumber) => ({
          setNumber,
          setType: 'normal' as const,
          setCompleted: true,
          setMeasurements: [
            { measurementCode: 'WEIGHT', measurementValue: 10 },
            { measurementCode: 'REPS', measurementValue: 20 },
          ],
        })),
      }],
    } as Workout
    const source = context(sources, [history], { gender: 'male', ageYears: 30 })
    let scenario: {
      straight: ReturnType<typeof generateOptimDemo>
      guided: ReturnType<typeof generateOptimDemo>
    } | null = null
    for (let day = 0; day < 366 && scenario == null; day += 1) {
      const generationDateIso = new Date(Date.UTC(2026, 0, day + 1, 12)).toISOString()
      const straight = generateOptimDemo({ ...inputs, generationDateIso }, source)
      const guided = generateOptimDemo({
        ...inputs,
        generationDateIso,
        circuitsEnabled: true,
        circuitLoadGuidanceEnabled: true,
        rpeAwareHistoryEnabled: true,
      }, source)
      const straightSet = straight.exercises.find((item) => item.code === codes[2])
        ?.sets.find((set) => set.setType === 'normal')
      const guidedExercise = guided.exercises.find((item) => item.code === codes[2])
      const guidedSet = guidedExercise?.sets.find((set) => set.setType === 'normal')
      if (
        straightSet?.reps != null && straightSet.reps >= 15 && straightSet.reps <= 18 &&
        guidedExercise?.groupType === 'circuit' && guidedSet?.weightKg === straightSet.weightKg
      ) scenario = { straight, guided }
    }
    expect(scenario).not.toBeNull()
    const straightSet = scenario?.straight.exercises.find((item) => item.code === codes[2])
      ?.sets.find((set) => set.setType === 'normal')
    const guidedExercise = scenario?.guided.exercises.find((item) => item.code === codes[2])
    const guidedSet = guidedExercise?.sets.find((set) => set.setType === 'normal')

    expect(straightSet?.reps).toBeGreaterThanOrEqual(15)
    expect(straightSet?.reps).toBeLessThanOrEqual(18)
    expect(guidedExercise?.groupType).toBe('circuit')
    expect(guidedSet?.weightKg).toBe(straightSet?.weightKg)
    expect(guidedSet?.reps).toBe((straightSet?.reps ?? 0) - 2)
    expect(guidedSet?.targetRpe).toBe(8)
    expect(guidedExercise?.trace).toContainEqual(expect.stringContaining('reversible RPE/history window'))
  })

  it('keeps load when a deep executable snap would require an RPE below six', () => {
    // Why: RPE history cannot express more than four reps in reserve. A coarse
    // dumbbell step must not silently under-credit capacity every time the
    // reduced circuit target falls below that floor.
    const codes = ['RPE_FLOOR_LEGS', 'RPE_FLOOR_CHEST', 'RPE_FLOOR_FLY', 'RPE_FLOOR_ARMS']
    const sources = [
      exercise(codes[0], 'QUADRICEPS', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
      exercise(codes[1], 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
      exercise(codes[2], 'PECTORALIS_MAJOR_STERNAL_HEAD', {
        name: 'Dumbbell Fly',
        equipment: 'DUMBBELLS',
        tags: ['TIER_3', 'ISOLATION'],
      }),
      exercise(codes[3], 'BICEPS_BRACHII', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
    ]
    const history = {
      workoutType: 'Log',
      workoutLogEndedAt: '2025-12-31T12:00:00.000Z',
      workoutData: [{
        exerciseCode: codes[2],
        exerciseData: [1, 2, 3].map((setNumber) => ({
          setNumber,
          setType: 'normal' as const,
          setCompleted: true,
          setMeasurements: [
            { measurementCode: 'WEIGHT', measurementValue: 12 },
            { measurementCode: 'REPS', measurementValue: 9 },
          ],
        })),
      }],
    } as Workout
    const inputs = baseInputs({
      goal: 'bodybuilding',
      split: 'fullBody',
      availableEquipmentCodes: ['DUMBBELLS'],
      executableLoadsEnabled: true,
      startingExerciseCodes: codes,
      nonCoreCountOverride: 4,
      coreCountOverride: 0,
    })
    const source = context(sources, [history], { gender: 'male', ageYears: 30 })
    let scenario: {
      straight: ReturnType<typeof generateOptimDemo>
      guided: ReturnType<typeof generateOptimDemo>
    } | null = null
    for (let day = 0; day < 366 && scenario == null; day += 1) {
      const generationDateIso = new Date(Date.UTC(2026, 0, day + 1, 12)).toISOString()
      const straight = generateOptimDemo({ ...inputs, generationDateIso }, source)
      const guided = generateOptimDemo({
        ...inputs,
        generationDateIso,
        circuitsEnabled: true,
        circuitLoadGuidanceEnabled: true,
      }, source)
      const straightSet = straight.exercises.find((item) => item.code === codes[2])
        ?.sets.find((set) => set.setType === 'normal')
      const guidedExercise = guided.exercises.find((item) => item.code === codes[2])
      const guidedSet = guidedExercise?.sets.find((set) => set.setType === 'normal')
      if (
        straightSet?.reps != null && straightSet.reps <= 14 &&
        guidedSet?.weightKg === straightSet.weightKg &&
        guidedExercise?.trace.some((trace) => trace.includes('reversible RPE/history window'))
      ) scenario = { straight, guided }
    }
    expect(scenario).not.toBeNull()
    const straightSet = scenario?.straight.exercises.find((item) => item.code === codes[2])
      ?.sets.find((set) => set.setType === 'normal')
    const guidedExercise = scenario?.guided.exercises.find((item) => item.code === codes[2])
    const guidedSet = guidedExercise?.sets.find((set) => set.setType === 'normal')

    expect(straightSet?.reps).toBeLessThanOrEqual(14)
    expect(guidedExercise?.groupType).toBe('circuit')
    expect(guidedSet?.weightKg).toBe(straightSet?.weightKg)
    expect(guidedSet?.reps).toBe((straightSet?.reps ?? 0) - 2)
    expect(guidedSet?.targetRpe).toBe(8)
  })

  it('preserves capacity at the 20-rep history ceiling by guiding reps instead of load', () => {
    // Why: at 19+ prescribed reps, lowering weight cannot be reversed because
    // historical max evidence caps at 20 reps. Two fewer reps at the original
    // load plus RPE 8 encodes the same capacity without compounding a loss.
    const generationDateIso = '2026-02-09T12:00:00.000Z'
    const codes = ['CIRCUIT_LEGS', 'CIRCUIT_CHEST', 'CIRCUIT_HIGH_REP_SHRUG', 'CIRCUIT_ARMS']
    const sources = [
      exercise(codes[0], 'QUADRICEPS', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
      exercise(codes[1], 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
      exercise(codes[2], 'LATISSIMUS_DORSI', {
        name: 'High Rep Shrug',
        equipment: 'DUMBBELLS',
        tags: ['TIER_3', 'ISOLATION', 'HIGH_REP'],
      }),
      exercise(codes[3], 'BICEPS_BRACHII', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] }),
    ]
    const history = {
      workoutType: 'Log',
      workoutLogEndedAt: '2026-02-08T12:00:00.000Z',
      workoutData: [{
        exerciseCode: codes[2],
        exerciseData: [1, 2, 3].map((setNumber) => ({
          setNumber,
          setType: 'normal' as const,
          setCompleted: true,
          setMeasurements: [
            { measurementCode: 'WEIGHT', measurementValue: 10 },
            { measurementCode: 'REPS', measurementValue: 20 },
          ],
        })),
      }],
    } as Workout
    const inputs = baseInputs({
      goal: 'bodybuilding',
      split: 'fullBody',
      availableEquipmentCodes: ['DUMBBELLS'],
      executableLoadsEnabled: true,
      generationDateIso,
      startingExerciseCodes: codes,
      nonCoreCountOverride: 4,
      coreCountOverride: 0,
    })
    const source = context(sources, [history], { gender: 'male', ageYears: 30 })
    const straight = generateOptimDemo(inputs, source)
    const guided = generateOptimDemo({
      ...inputs,
      circuitsEnabled: true,
      circuitLoadGuidanceEnabled: true,
    }, source)
    const straightShrug = straight.exercises.find((item) => item.code === codes[2])
    const guidedShrug = guided.exercises.find((item) => item.code === codes[2])
    const straightSet = straightShrug?.sets.find((set) => set.setType === 'normal')
    const guidedSet = guidedShrug?.sets.find((set) => set.setType === 'normal')

    expect(straight.exercises.map((item) => item.code)).toContain(codes[2])
    expect(straightSet?.reps).toBeGreaterThanOrEqual(19)
    expect(guidedShrug?.groupType).toBe('circuit')
    expect(guidedSet?.reps).toBe((straightSet?.reps ?? 0) - 2)
    expect(guidedSet?.weightKg).toBe(straightSet?.weightKg)
    expect(guidedSet?.targetRpe).toBe(8)
    expect(guidedShrug?.trace).toContainEqual(expect.stringContaining('reversible RPE/history window'))
  })

  it('keeps omitted and disabled superset inputs byte-compatible', () => {
    const disabled = baseInputs({ supersetsEnabled: false })
    const omitted = { ...disabled }
    delete omitted.supersetsEnabled
    const source = context([
      exercise('COMPAT_ARMS', 'BICEPS_BRACHII', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
      exercise('COMPAT_LEGS', 'QUADRICEPS', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
    ])

    expect(generateOptimDemo(disabled, source)).toEqual(generateOptimDemo(omitted, source))
  })

  it('keeps stationary-support superset sharing opt-in and limited to portable implements', () => {
    // Why: a nearby bench can stay available during dumbbell accessories, but
    // subset matching must never turn one loaded bar into two stations.
    const withEquipment = (
      code: string,
      muscleCode: string,
      equipment: string[],
      name = code,
    ): ExerciseListItem => ({
      ...exercise(code, muscleCode, { name, tags: ['TIER_2', 'ISOLATION'] }),
      exerciseEquipment: { required: equipment.map((item) => [item]) },
    })
    const dumbbellPair = context([
      withEquipment('STATION_LATERAL_RAISE', 'ANTERIOR_DELTOID', ['DUMBBELLS', 'EXERCISE_BENCH']),
      withEquipment('STATION_SKULLCRUSHER', 'TRICEPS_BRACHII', ['DUMBBELLS']),
    ])
    const base = baseInputs({
      availableEquipmentCodes: ['DUMBBELLS', 'EXERCISE_BENCH'],
      goal: 'bodybuilding',
      split: 'fullBody',
      supersetsEnabled: true,
      startingExerciseCodes: ['STATION_LATERAL_RAISE', 'STATION_SKULLCRUSHER'],
      nonCoreCountOverride: 2,
    })
    const omitted = generateOptimDemo(base, dumbbellPair)
    const disabled = generateOptimDemo({ ...base, supersetStationSharingEnabled: false }, dumbbellPair)
    const enabled = generateOptimDemo({ ...base, supersetStationSharingEnabled: true }, dumbbellPair)

    expect(omitted).toEqual(disabled)
    expect(omitted.exercises.map((item) => item.groupId)).toEqual([null, null])
    expect(enabled.exercises.map((item) => item.groupId)).toEqual([1, 1])
    expect(enabled.exercises.every((item) =>
      item.trace.some((entry) => entry.includes('stationary support remains available')))).toBe(true)

    const barbellPair = context([
      withEquipment('STATION_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', ['BARBELL', 'WEIGHT_PLATES', 'EXERCISE_BENCH'], 'Barbell Bench Press'),
      withEquipment('STATION_SHRUG', 'TRAPEZIUS', ['BARBELL', 'WEIGHT_PLATES'], 'Barbell Shrug'),
    ])
    const barbell = generateOptimDemo({
      ...base,
      availableEquipmentCodes: ['BARBELL', 'WEIGHT_PLATES', 'EXERCISE_BENCH'],
      startingExerciseCodes: ['STATION_BENCH', 'STATION_SHRUG'],
      supersetStationSharingEnabled: true,
    }, barbellPair)
    expect(barbell.exercises.every((item) => item.groupId == null)).toBe(true)
  })

  it('does not relax circuit equipment matching when station-sharing supersets are enabled', () => {
    const benchMove = {
      ...exercise('CIRCUIT_BENCH_MOVE', 'BICEPS_BRACHII', { tags: ['TIER_2', 'ISOLATION'] }),
      exerciseEquipment: { required: [['DUMBBELLS'], ['EXERCISE_BENCH']] },
    }
    const standingMove = exercise('CIRCUIT_STANDING_MOVE', 'QUADRICEPS', {
      equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'],
    })
    const result = generateOptimDemo(baseInputs({
      availableEquipmentCodes: ['DUMBBELLS', 'EXERCISE_BENCH'],
      circuitsEnabled: true,
      supersetStationSharingEnabled: true,
      startingExerciseCodes: ['CIRCUIT_BENCH_MOVE', 'CIRCUIT_STANDING_MOVE'],
      nonCoreCountOverride: 2,
    }), context([benchMove, standingMove]))

    expect(result.exercises.every((item) => item.groupId == null)).toBe(true)
  })

  it('groups adjacent compatible accessories as a genuine superset without rewriting prescriptions', () => {
    const source = context([
      exercise('SUPERSET_CURL', 'BICEPS_BRACHII', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
      exercise('SUPERSET_LEG_EXTENSION', 'QUADRICEPS', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
    ])
    const base = baseInputs({
      goal: 'bodybuilding',
      split: 'fullBody',
      startingExerciseCodes: ['SUPERSET_CURL', 'SUPERSET_LEG_EXTENSION'],
      nonCoreCountOverride: 2,
    })
    const ungrouped = generateOptimDemo(base, source)
    const grouped = generateOptimDemo({ ...base, supersetsEnabled: true }, source)
    const strength = grouped.exercises.filter(item => item.phase === 'strength')

    expect(strength.map(item => item.groupType)).toEqual(['superset', 'superset'])
    expect(strength.map(item => item.groupId)).toEqual([1, 1])
    expect(strength.map(item => item.sets)).toEqual(
      ungrouped.exercises.filter(item => item.phase === 'strength').map(item => item.sets),
    )
    expect(grouped.durationEstimate).toEqual(ungrouped.durationEstimate)
  })

  it('rejects non-core compound sets and equipment transitions while allowing a bodyweight bridge', () => {
    const generatePair = (first: ExerciseListItem, second: ExerciseListItem) => generateOptimDemo(
      baseInputs({
        goal: 'bodybuilding',
        split: 'fullBody',
        supersetsEnabled: true,
        startingExerciseCodes: [first.exerciseCode ?? '', second.exerciseCode ?? ''],
        nonCoreCountOverride: 2,
      }),
      context([first, second]),
    ).exercises.filter(item => item.phase === 'strength')
    const arms = exercise('PAIR_ARMS', 'BICEPS_BRACHII', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] })
    const otherArms = exercise('PAIR_OTHER_ARMS', 'TRICEPS_BRACHII', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] })
    const dumbbellLegs = exercise('PAIR_DUMBBELL_LEGS', 'QUADRICEPS', { equipment: 'DUMBBELLS', tags: ['TIER_2', 'ISOLATION'] })
    const bodyweightLegs = exercise('PAIR_BODYWEIGHT_LEGS', 'QUADRICEPS', { tags: ['BODYWEIGHT_ONLY', 'TIER_2', 'ISOLATION'] })

    expect(generatePair(arms, otherArms).every(item => item.groupId == null)).toBe(true)
    expect(generatePair(arms, dumbbellLegs).every(item => item.groupId == null)).toBe(true)
    expect(generatePair(arms, bodyweightLegs).map(item => item.groupId)).toEqual([1, 1])
  })

  it('protects performance-goal main lifts from supersets', () => {
    const result = generateOptimDemo(
      baseInputs({
        goal: 'strength',
        split: 'push',
        supersetsEnabled: true,
        startingExerciseCodes: ['SUPERSET_BENCH', 'SUPERSET_CURL'],
        nonCoreCountOverride: 2,
      }),
      context([
        exercise('SUPERSET_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
          name: 'Barbell Bench Press', equipment: 'BARBELL', tags: ['TIER_1', 'COMPOUND'],
        }),
        exercise('SUPERSET_CURL', 'BICEPS_BRACHII', {
          equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'],
        }),
      ]),
    )

    expect(result.exercises.every(item => item.groupId == null)).toBe(true)
  })

  it('keeps superset pairs contiguous, deterministic, and free of orphan groups', () => {
    const inputs = baseInputs({
      goal: 'bodybuilding',
      split: 'fullBody',
      supersetsEnabled: true,
      startingExerciseCodes: ['ODD_ARMS', 'ODD_LEGS', 'ODD_CHEST'],
      nonCoreCountOverride: 3,
    })
    const source = context([
      exercise('ODD_ARMS', 'BICEPS_BRACHII', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
      exercise('ODD_LEGS', 'QUADRICEPS', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
      exercise('ODD_CHEST', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
    ])
    const result = generateOptimDemo(inputs, source)
    const strength = result.exercises.filter(item => item.phase === 'strength')

    expect(result).toEqual(generateOptimDemo(inputs, source))
    expect(strength.map(item => item.code)).toEqual(['ODD_ARMS', 'ODD_LEGS', 'ODD_CHEST'])
    expect(strength.map(item => item.groupId)).toEqual([1, 1, null])
    const groupSizes = new Map<number, number>()
    for (const item of strength) {
      if (item.groupId != null) groupSizes.set(item.groupId, (groupSizes.get(item.groupId) ?? 0) + 1)
    }
    expect([...groupSizes.values()]).toEqual([2])
  })

  it('never spans phases and allows a same-bucket core superset', () => {
    const result = generateOptimDemo(
      baseInputs({
        goal: 'bodybuilding',
        supersetsEnabled: true,
        startingExerciseCodes: ['PHASE_CHEST'],
        nonCoreCountOverride: 1,
        coreCountOverride: 2,
      }),
      context([
        exercise('PHASE_CHEST', 'PECTORALIS_MAJOR_STERNAL_HEAD', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
        exercise('PHASE_CRUNCH', 'RECTUS_ABDOMINIS', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
        exercise('PHASE_WOODCHOP', 'OBLIQUES', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
      ]),
    )
    const strength = result.exercises.filter(item => item.phase === 'strength')
    const core = result.exercises.filter(item => item.phase === 'core')

    expect(strength[0].groupId).toBeNull()
    expect(core.map(item => item.groupId)).toEqual([1, 1])
  })

  it('opts core pairs and inferred-tier accessories into performance supersets without changing legacy results', () => {
    // Why: popularity inference labels popular core work and isolation
    // accessories tier one, which blocked every pairing under performance
    // goals even though they are not competition lifts. The policies must
    // stay opt-in and must not touch authored tiers or prescriptions.
    const bench = exercise('POLICY_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Barbell Bench Press', equipment: 'BARBELL', tags: ['TIER_1', 'COMPOUND'],
    })
    const lateral = exercise('POLICY_LATERAL_RAISE', 'LATERAL_DELTOID', {
      equipment: 'DUMBBELLS', popularity: 9, tags: ['ISOLATION'],
    })
    const curl = exercise('POLICY_HAMMER_CURL', 'BICEPS_BRACHII', {
      equipment: 'DUMBBELLS', popularity: 9, tags: ['ISOLATION'],
    })
    const crunch = exercise('POLICY_CRUNCH', 'RECTUS_ABDOMINIS', {
      equipment: 'DUMBBELLS', popularity: 9, tags: ['ISOLATION'],
    })
    const woodchop = exercise('POLICY_WOODCHOP', 'OBLIQUES', {
      equipment: 'DUMBBELLS', popularity: 9, tags: ['ISOLATION'],
    })
    const inputs = baseInputs({
      goal: 'strength',
      split: 'fullBody',
      supersetsEnabled: true,
      availableEquipmentCodes: ['BARBELL', 'DUMBBELLS'],
      startingExerciseCodes: ['POLICY_BENCH', 'POLICY_LATERAL_RAISE', 'POLICY_HAMMER_CURL'],
      nonCoreCountOverride: 3,
      coreCountOverride: 2,
    })
    const source = context([bench, lateral, curl, crunch, woodchop])
    const omitted = { ...inputs }
    delete omitted.corePhasePairGroupingEnabled
    delete omitted.inferredAccessoryPairGroupingEnabled
    const disabled = generateOptimDemo({
      ...inputs,
      corePhasePairGroupingEnabled: false,
      inferredAccessoryPairGroupingEnabled: false,
    }, source)
    const enabled = generateOptimDemo({
      ...inputs,
      corePhasePairGroupingEnabled: true,
      inferredAccessoryPairGroupingEnabled: true,
    }, source)

    expect(generateOptimDemo(omitted, source)).toEqual(disabled)
    expect(disabled.exercises.every((item) => item.groupId == null)).toBe(true)
    expect(enabled.exercises.map((item) => item.code)).toEqual(disabled.exercises.map((item) => item.code))
    const byCode = new Map(enabled.exercises.map((item) => [item.code, item]))
    expect(byCode.get('POLICY_BENCH')?.groupId).toBeNull()
    expect(byCode.get('POLICY_LATERAL_RAISE')?.groupType).toBe('superset')
    expect(byCode.get('POLICY_HAMMER_CURL')?.groupType).toBe('superset')
    expect(byCode.get('POLICY_CRUNCH')?.groupType).toBe('superset')
    expect(byCode.get('POLICY_WOODCHOP')?.groupType).toBe('superset')
    for (const item of enabled.exercises) {
      const straight = disabled.exercises.find((candidate) => candidate.code === item.code)
      expect(item.sets).toEqual(straight?.sets)
    }
  })

  it('keeps authored tier-one tags out of inferred-accessory supersets', () => {
    // Why: the bypass exists for popularity noise only. An explicit catalog
    // tier tag is authored data and keeps the recovered strict boundary.
    const tagged = exercise('AUTHORED_TIER_RAISE', 'LATERAL_DELTOID', {
      equipment: 'DUMBBELLS', popularity: 9, tags: ['TIER_1', 'ISOLATION'],
    })
    const curl = exercise('AUTHORED_TIER_CURL', 'BICEPS_BRACHII', {
      equipment: 'DUMBBELLS', popularity: 9, tags: ['ISOLATION'],
    })
    const result = generateOptimDemo(
      baseInputs({
        goal: 'strength',
        split: 'fullBody',
        supersetsEnabled: true,
        inferredAccessoryPairGroupingEnabled: true,
        availableEquipmentCodes: ['DUMBBELLS'],
        startingExerciseCodes: ['AUTHORED_TIER_RAISE', 'AUTHORED_TIER_CURL'],
        nonCoreCountOverride: 2,
      }),
      context([tagged, curl]),
    )

    expect(result.exercises.every((item) => item.groupId == null)).toBe(true)
  })

  it('opts inferred-tier accessories and core pairs into circuits without changing legacy results', () => {
    // Why: the same popularity noise made most short and performance-goal
    // circuit requests fall all the way back to straight sets.
    const bench = exercise('CIRCUIT_POLICY_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Barbell Bench Press', equipment: 'BARBELL', tags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
    })
    const situp = exercise('CIRCUIT_POLICY_SITUP', 'RECTUS_ABDOMINIS', {
      popularity: 9, tags: ['ISOLATION', 'BODYWEIGHT'], type: 'BODYWEIGHT_REPS', measurements: ['REPS'],
    })
    const twist = exercise('CIRCUIT_POLICY_TWIST', 'OBLIQUES', {
      popularity: 9, tags: ['ISOLATION', 'BODYWEIGHT'], type: 'BODYWEIGHT_REPS', measurements: ['REPS'],
    })
    const inputs = baseInputs({
      goal: 'powerlifting',
      split: 'fullBody',
      circuitsEnabled: true,
      circuitLoadGuidanceEnabled: true,
      availableEquipmentCodes: ['BARBELL'],
      startingExerciseCodes: ['CIRCUIT_POLICY_BENCH'],
      nonCoreCountOverride: 1,
      coreCountOverride: 2,
    })
    const source = context([bench, situp, twist], [], { gender: 'male', ageYears: 30 })
    const omitted = { ...inputs }
    delete omitted.corePhasePairGroupingEnabled
    delete omitted.inferredAccessoryPairGroupingEnabled
    const disabled = generateOptimDemo({
      ...inputs,
      corePhasePairGroupingEnabled: false,
      inferredAccessoryPairGroupingEnabled: false,
    }, source)
    const enabled = generateOptimDemo({
      ...inputs,
      corePhasePairGroupingEnabled: true,
      inferredAccessoryPairGroupingEnabled: true,
    }, source)

    expect(generateOptimDemo(omitted, source)).toEqual(disabled)
    expect(disabled.exercises.every((item) => item.groupId == null)).toBe(true)
    const byCode = new Map(enabled.exercises.map((item) => [item.code, item]))
    expect(byCode.get('CIRCUIT_POLICY_BENCH')?.groupId).toBeNull()
    expect(byCode.get('CIRCUIT_POLICY_SITUP')?.groupType).toBe('circuit')
    expect(byCode.get('CIRCUIT_POLICY_TWIST')?.groupType).toBe('circuit')
  })

  it('pulls a compatible superset partner adjacent without touching pinned lifts or prescriptions', () => {
    // Why: pairing only accidental neighbors made half of superset requests
    // return nothing. Partner ordering may move an unpinned accessory next to
    // its pair, but never across phases and never a pinned starting exercise.
    const bench = exercise('REORDER_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      name: 'Barbell Bench Press', equipment: 'BARBELL', tags: ['TIER_1', 'COMPOUND'],
    })
    const curl = exercise('REORDER_CURL', 'BICEPS_BRACHII', {
      equipment: 'DUMBBELLS', popularity: 4, tags: ['ISOLATION'],
    })
    const row = exercise('REORDER_ROW_MACHINE', 'LATISSIMUS_DORSI', {
      equipment: 'ROWING_MACHINE_STATION', popularity: 4.8, tags: ['ISOLATION'],
    })
    const lateral = exercise('REORDER_LATERAL', 'LATERAL_DELTOID', {
      equipment: 'DUMBBELLS', popularity: 3.9, tags: ['ISOLATION'],
    })
    const inputs = baseInputs({
      goal: 'bodybuilding',
      split: 'fullBody',
      supersetsEnabled: true,
      availableEquipmentCodes: ['BARBELL', 'DUMBBELLS', 'ROWING_MACHINE_STATION'],
      startingExerciseCodes: ['REORDER_BENCH', 'REORDER_CURL'],
      nonCoreCountOverride: 4,
      coreCountOverride: 0,
    })
    const source = context([bench, curl, row, lateral])
    const omitted = { ...inputs }
    delete omitted.groupPartnerReorderEnabled
    const disabled = generateOptimDemo({ ...inputs, groupPartnerReorderEnabled: false }, source)
    const enabled = generateOptimDemo({ ...inputs, groupPartnerReorderEnabled: true }, source)

    expect(generateOptimDemo(omitted, source)).toEqual(disabled)
    // Adjacent-only matching finds nothing: bench|curl blocked, curl|row and
    // row|lateral have incompatible equipment.
    expect(disabled.exercises.every((item) => item.groupId == null)).toBe(true)
    const enabledStrength = enabled.exercises.filter((item) => item.phase === 'strength')
    expect(enabledStrength.map((item) => item.code)).toEqual([
      'REORDER_BENCH', 'REORDER_CURL', 'REORDER_LATERAL', 'REORDER_ROW_MACHINE',
    ])
    expect(enabledStrength.map((item) => item.groupType)).toEqual([null, 'superset', 'superset', null])
    for (const item of enabled.exercises) {
      const straight = disabled.exercises.find((candidate) => candidate.code === item.code)
      expect(item.sets).toEqual(straight?.sets)
    }
  })

  it('allows a timed hold inside a core-phase superset pair only through the policy', () => {
    // Why: a plank next to a rep movement is ordinary core programming, but
    // the recovered timed exclusion must stay for every legacy caller.
    const chest = exercise('TIMED_CORE_CHEST', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'],
    })
    const crunch = exercise('TIMED_CORE_CRUNCH', 'RECTUS_ABDOMINIS', {
      popularity: 9, tags: ['ISOLATION', 'BODYWEIGHT'], type: 'BODYWEIGHT_REPS', measurements: ['REPS'],
    })
    const plank = exercise('TIMED_CORE_PLANK', 'RECTUS_ABDOMINIS', {
      popularity: 9, tags: ['ISOLATION', 'BODYWEIGHT', 'TIMED'], type: 'TIMED', measurements: ['DURATION'],
    })
    const inputs = baseInputs({
      goal: 'general',
      supersetsEnabled: true,
      corePhasePairGroupingEnabled: true,
      availableEquipmentCodes: ['BARBELL'],
      startingExerciseCodes: ['TIMED_CORE_CHEST'],
      nonCoreCountOverride: 1,
      coreCountOverride: 2,
    })
    const source = context([chest, crunch, plank])
    const withoutPolicy = generateOptimDemo({
      ...inputs,
      corePhasePairGroupingEnabled: false,
    }, source)
    const result = generateOptimDemo(inputs, source)
    const core = result.exercises.filter((item) => item.phase === 'core')

    expect(withoutPolicy.exercises.every((item) => item.groupId == null)).toBe(true)
    expect(core.map((item) => item.groupType)).toEqual(['superset', 'superset'])
  })

  it('pulls a compatible circuit partner adjacent only through the reorder policy', () => {
    const anchor = exercise('CIRCUIT_REORDER_SQUAT', 'QUADRICEPS', {
      name: 'Barbell Back Squat', equipment: 'BARBELL', tags: ['TIER_1', 'COMPOUND'],
    })
    const curl = exercise('CIRCUIT_REORDER_CURL', 'BICEPS_BRACHII', {
      equipment: 'DUMBBELLS', popularity: 4, tags: ['TIER_2', 'ISOLATION'],
    })
    const cableFly = exercise('CIRCUIT_REORDER_CABLE_FLY', 'PECTORALIS_MAJOR_STERNAL_HEAD', {
      equipment: 'SINGLE_CABLE_MACHINE', popularity: 6.5, tags: ['TIER_2', 'ISOLATION'],
    })
    const lateral = exercise('CIRCUIT_REORDER_LATERAL', 'LATERAL_DELTOID', {
      equipment: 'DUMBBELLS', popularity: 3.9, tags: ['TIER_2', 'ISOLATION'],
    })
    // Squat, curl, and cable fly are pinned in place; only the dumbbell
    // lateral raise is algorithmic, so it lands last and no adjacent pair is
    // compatible until the policy pulls it next to the curl.
    const inputs = baseInputs({
      goal: 'bodybuilding',
      split: 'fullBody',
      circuitsEnabled: true,
      availableEquipmentCodes: ['BARBELL', 'DUMBBELLS', 'SINGLE_CABLE_MACHINE'],
      startingExerciseCodes: ['CIRCUIT_REORDER_SQUAT', 'CIRCUIT_REORDER_CURL', 'CIRCUIT_REORDER_CABLE_FLY'],
      nonCoreCountOverride: 4,
      coreCountOverride: 0,
    })
    const source = context([anchor, curl, cableFly, lateral])
    const omitted = { ...inputs }
    delete omitted.groupPartnerReorderEnabled
    const disabled = generateOptimDemo({ ...inputs, groupPartnerReorderEnabled: false }, source)
    const enabled = generateOptimDemo({ ...inputs, groupPartnerReorderEnabled: true }, source)

    expect(generateOptimDemo(omitted, source)).toEqual(disabled)
    expect(disabled.exercises.every((item) => item.groupId == null)).toBe(true)
    const enabledStrength = enabled.exercises.filter((item) => item.phase === 'strength')
    expect(enabledStrength.map((item) => item.code)).toEqual([
      'CIRCUIT_REORDER_SQUAT', 'CIRCUIT_REORDER_CURL', 'CIRCUIT_REORDER_LATERAL', 'CIRCUIT_REORDER_CABLE_FLY',
    ])
    expect(enabledStrength.map((item) => item.groupType)).toEqual([null, 'circuit', 'circuit', null])
  })

  it('gives existing circuit mode precedence when both grouping flags are supplied', () => {
    const result = generateOptimDemo(
      baseInputs({
        goal: 'strength',
        split: 'fullBody',
        circuitsEnabled: true,
        supersetsEnabled: true,
        startingExerciseCodes: ['PRECEDENCE_ARMS', 'PRECEDENCE_LEGS'],
        nonCoreCountOverride: 2,
      }),
      context([
        exercise('PRECEDENCE_ARMS', 'BICEPS_BRACHII', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
        exercise('PRECEDENCE_LEGS', 'QUADRICEPS', { equipment: 'BARBELL', tags: ['TIER_2', 'ISOLATION'] }),
      ]),
    )

    expect(result.exercises.map(item => item.groupType)).toEqual(['circuit', 'circuit'])
    expect(result.events).toContain('Both grouping modes were enabled; circuit generation took precedence for backward compatibility.')
  })

  it('uses a stable epoch fallback for malformed generation dates', () => {
    const inputs = baseInputs({ generationDateIso: 'not-a-date' })
    const source = context([chest])
    const first = generateOptimDemo(inputs, source)

    expect(first).toEqual(generateOptimDemo(inputs, source))
    expect(first.generatedAt).toBe('1970-01-01T00:00:00.000Z')
  })
})
