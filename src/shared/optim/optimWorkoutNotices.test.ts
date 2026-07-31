import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'
import type { Workout } from '@justgains/shared/src/api/types/Workout'
import { describe, expect, it } from 'vitest'

import {
  defaultOptimDemoInputs,
  generateOptimDemo,
  type OptimDemoResult,
} from './optimDemoEngine'
import { emptyMuscleUsageCounts } from '../utils/muscleUsage'

import {
  classifyOptimWorkoutNotices,
  generateOptimUserWorkout,
  resolveOptimUserSplit,
  shouldUseStraightSetFallback,
} from './optimWorkoutNotices'

function resultWith(
  exercises: OptimDemoResult['exercises'],
): OptimDemoResult {
  return {
    generatedAt: '2026-07-17T00:00:00.000Z',
    counts: {
      computedNonCore: 0, computedCore: 0, requestedNonCore: 0, requestedCore: 0,
      generatedStrength: exercises.length, generatedCore: 0, generatedCardio: 0,
      generatedMobility: 0,
    },
    muscleUsage: emptyMuscleUsageCounts(),
    recoveryWindowDays: 0,
    availabilityRatio: 1,
    events: [],
    dataNotes: [],
    rejectedCandidates: [],
    rankedCandidates: [],
    exercises,
  }
}

function catalogExercise(
  code: string,
  muscleCode: string,
  equipment: string[] = ['DUMBBELLS'],
): ExerciseListItem {
  return {
    exerciseCode: code,
    exerciseName: code,
    popularityRating: 8,
    exerciseTags: ['TIER_2', 'ISOLATION'],
    exerciseTypeCode: 'WEIGHT_REPS',
    exerciseMeasurements: ['WEIGHT', 'REPS'],
    exerciseEquipment: { required: equipment.map((item) => [item]) },
    exerciseMuscles: [{ muscleCode, isPrimary: true, targetPercentage: 100 }],
  }
}

describe('Optim user-facing result notices', () => {
  it('uses balanced full-body selection only until recovery history exists', () => {
    // Why: a first-ever "Optim's pick" has no freshness signal and otherwise
    // collapses into popularity-heavy legs/chest sessions with no pull work.
    expect(resolveOptimUserSplit('fresh', 0)).toBe('fullBody')
    expect(resolveOptimUserSplit('fresh', 1)).toBe('fresh')
    expect(resolveOptimUserSplit('push', 0)).toBe('push')
  })

  it('falls back only when circuit mode formed no real circuit', () => {
    // Why: circuit mode suppresses first-use loads, so returning an ungrouped
    // circuit result would silently make a normal workout less actionable.
    expect(shouldUseStraightSetFallback('circuits', resultWith([]))).toBe(true)
    expect(shouldUseStraightSetFallback('supersets', resultWith([]))).toBe(false)
    expect(shouldUseStraightSetFallback('circuits', resultWith([{
      groupId: 1,
      groupType: 'circuit',
    } as OptimDemoResult['exercises'][number]]))).toBe(false)
  })

  it('explains grouping fallbacks and requested stages that could not be delivered', () => {
    // Why: persisted fine-tune choices must not look broken when safety or the
    // hard time cap prevents the engine from honoring them.
    expect(classifyOptimWorkoutNotices({
      grouping: 'circuits',
      result: resultWith([]),
      circuitFallback: true,
      cardioRequested: true,
      cooldownRequested: true,
    })).toEqual(['circuitFallback', 'cardioOmitted', 'cooldownOmitted'])
    expect(classifyOptimWorkoutNotices({
      grouping: 'circuits',
      result: resultWith([]),
      circuitFallback: false,
      cardioRequested: false,
      cooldownRequested: false,
    })).toEqual(['circuitFallback'])

    expect(classifyOptimWorkoutNotices({
      grouping: 'supersets',
      result: resultWith([]),
      circuitFallback: false,
      cardioRequested: false,
      cooldownRequested: false,
    })).toEqual(['supersetUnavailable'])
  })

  it('distinguishes guided circuit targets from genuinely open circuit loads', () => {
    // Why: history-backed circuits already carried weights, so a blanket
    // "loads open" message contradicted the workout shown directly below it.
    const circuitExercise = {
      groupId: 1,
      groupType: 'circuit',
      sets: [{ setNumber: 1, setType: 'normal', reps: 10, restSeconds: 30 }],
    } as OptimDemoResult['exercises'][number]
    expect(classifyOptimWorkoutNotices({
      grouping: 'circuits',
      result: resultWith([{ ...circuitExercise, sets: [{
        setNumber: 1, setType: 'normal', reps: 10, weightKg: 20, restSeconds: 30,
      }] }]),
      circuitFallback: false,
      cardioRequested: false,
      cooldownRequested: false,
    })).toEqual(['circuitLoadsGuided'])
    expect(classifyOptimWorkoutNotices({
      grouping: 'circuits',
      result: resultWith([circuitExercise]),
      circuitFallback: false,
      cardioRequested: false,
      cooldownRequested: false,
    })).toEqual(['circuitLoadsOpen'])
  })

  it('calls out only a material time-window shortfall', () => {
    // Why: below 75% even generous setup and transition overhead cannot fill
    // the selected window. The user needs an honest explanation, while
    // ordinary headroom should not become warning noise.
    const atUtilization = (utilization: number | undefined) => ({
      ...resultWith([{
        groupId: null,
        groupType: null,
        sets: [{ setNumber: 1, setType: 'normal', reps: 10, restSeconds: 60 }],
      } as OptimDemoResult['exercises'][number]]),
      ...(utilization == null ? {} : {
        durationEstimate: {
          requestedMinutes: 60,
          projectedMinutes: Math.round(60 * utilization * 10) / 10,
          utilization,
          sessionProjectedMinutes: Math.round(60 * utilization * 10) / 10,
          sessionUtilization: utilization,
        },
      }),
    })
    const classify = (result: OptimDemoResult) => classifyOptimWorkoutNotices({
      grouping: 'straight',
      result,
      circuitFallback: false,
      cardioRequested: false,
      cooldownRequested: false,
    })

    expect(classify(atUtilization(0.749))).toEqual(['durationShortfall'])
    expect(classify(atUtilization(0.75))).toEqual([])
    expect(classify(atUtilization(undefined))).toEqual([])

    const first = {
      groupId: null,
      groupType: null,
      sets: [{ setNumber: 1, setType: 'normal', reps: 10, restSeconds: 90 }],
    } as OptimDemoResult['exercises'][number]
    const second = {
      groupId: null,
      groupType: null,
      sets: [{ setNumber: 1, setType: 'normal', reps: 10, restSeconds: 60 }],
    } as OptimDemoResult['exercises'][number]
    expect(classify({
      ...resultWith([first, second]),
      durationEstimate: {
        requestedMinutes: 60,
        projectedMinutes: 58.5,
        utilization: 58.5 / 60,
        sessionProjectedMinutes: 59.5,
        sessionUtilization: 59.5 / 60,
      },
    })).toEqual([])

    const nearestFit = {
      ...resultWith([{
        ...first,
        sets: [{ ...first.sets[0], restSeconds: 78 }],
      }, second]),
      durationEstimate: {
        requestedMinutes: 35,
        projectedMinutes: 34,
        utilization: 34 / 35,
        sessionProjectedMinutes: 35,
        sessionUtilization: 1,
      },
    }
    // Why: a whole technical set can be a worse fit than the estimator's
    // sub-minute variance. The exact 35.8-minute estimate remains visible.
    expect(classify(nearestFit)).toEqual([])
    expect(classify({
      ...nearestFit,
      exercises: [{
        ...first,
        sets: [{ ...first.sets[0], restSeconds: 96 }],
      }, second],
    })).toEqual(['durationOverrun'])

    expect(classify({
      ...resultWith([{
        ...first,
        sets: [{ ...first.sets[0], restSeconds: 180 }],
      }, second]),
      durationEstimate: {
        requestedMinutes: 60,
        projectedMinutes: 58.5,
        utilization: 58.5 / 60,
        sessionProjectedMinutes: 59.5,
        sessionUtilization: 59.5 / 60,
      },
    })).toEqual(['durationOverrun'])
  })

  it('regenerates an ungrouped circuit request through the straight-set engine path', () => {
    // Why: circuit mode suppresses first-use loads before grouping. The product
    // seam must not expose that degraded result when no circuit formed.
    const generated = generateOptimUserWorkout({
      ...defaultOptimDemoInputs({ generationDate: new Date('2026-07-17T00:00:00.000Z') }),
      circuitsEnabled: true,
      cardioEnabled: true,
      mobilityCooldownEnabled: true,
    }, {
      exercises: [],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }, 'circuits')

    expect(generated.circuitFallback).toBe(true)
    expect(generated.notices).toEqual(['circuitFallback', 'cardioOmitted', 'cooldownOmitted'])
  })

  it('forms honest bodyweight pattern circuits through the product-only classifier seam', () => {
    // Why: the broad primary-pattern guard protects loaded main lifts, but a
    // bodyweight circuit made of safe squats and push-ups should not silently
    // fall back to straight sets merely because their names match patterns.
    const squat: ExerciseListItem = {
      ...catalogExercise('PRODUCT_BODYWEIGHT_SQUAT', 'QUADRICEPS', []),
      exerciseName: 'Bodyweight Squat',
      exerciseTags: ['BODYWEIGHT', 'COMPOUND', 'TIER_1'],
      exerciseTypeCode: 'BODYWEIGHT_REPS',
      exerciseMeasurements: ['REPS'],
      exerciseEquipment: undefined,
    }
    const pushUp: ExerciseListItem = {
      ...catalogExercise('PRODUCT_BODYWEIGHT_PRESS', 'PECTORALIS_MAJOR_STERNAL_HEAD', []),
      exerciseName: 'Bodyweight Chest Press Push-Up',
      exerciseTags: ['BODYWEIGHT', 'COMPOUND', 'TIER_1'],
      exerciseTypeCode: 'BODYWEIGHT_REPS',
      exerciseMeasurements: ['REPS'],
      exerciseEquipment: undefined,
    }
    const history = {
      workoutType: 'Log',
      workoutLogEndedAt: '2026-07-15T00:00:00.000Z',
      workoutData: [squat, pushUp].map((exercise) => ({
        exerciseCode: exercise.exerciseCode,
        exerciseData: [{
          setNumber: 1,
          setType: 'normal' as const,
          setCompleted: true,
          setMeasurements: [{ measurementCode: 'REPS', measurementValue: 10 }],
        }],
      })),
    } as Workout
    const generated = generateOptimUserWorkout({
      ...defaultOptimDemoInputs({ generationDate: new Date('2026-07-17T00:00:00.000Z') }),
      goal: 'general',
      experience: 'beginner',
      split: 'fullBody',
      bodyweightOnly: true,
      circuitsEnabled: true,
      availableEquipmentCodes: [],
      startingExerciseCodes: [squat.exerciseCode ?? '', pushUp.exerciseCode ?? ''],
      nonCoreCountOverride: 2,
      coreCountOverride: 0,
    }, {
      exercises: [squat, pushUp],
      completedWorkouts: [history],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }, 'circuits')

    expect(generated.circuitFallback).toBe(false)
    expect(generated.result.exercises.map((item) => item.groupType)).toEqual(['circuit', 'circuit'])
    expect(generated.result.exercises.every((item) => !item.weightedBodyweight)).toBe(true)
    expect(generated.result.exercises.every((item) =>
      item.sets.every((set) => set.weightKg == null),
    )).toBe(true)
    expect(generated.notices).toContain('circuitLoadsOpen')
    expect(generated.notices).not.toContain('circuitFallback')
  })

  it('forms guided loaded General accessory circuits through the product-only classifier seam', () => {
    // Why: live-catalog popularity and compound tags infer tier one for many
    // ordinary accessories; the product circuit choice must remain viable.
    const codes = ['PRODUCT_POPULAR_CURL', 'PRODUCT_POPULAR_EXTENSION']
    const catalog = [
      { ...catalogExercise(codes[0], 'BICEPS_BRACHII'), exerciseTags: ['COMPOUND'] },
      { ...catalogExercise(codes[1], 'TRICEPS_BRACHII'), exerciseTags: ['COMPOUND'] },
    ]
    const history = {
      workoutType: 'Log',
      workoutLogEndedAt: '2026-07-15T00:00:00.000Z',
      workoutData: codes.map((exerciseCode) => ({
        exerciseCode,
        exerciseData: [1, 2, 3].map((setNumber) => ({
          setNumber,
          setType: 'normal' as const,
          setCompleted: true,
          setMeasurements: [
            { measurementCode: 'WEIGHT', measurementValue: 20 },
            { measurementCode: 'REPS', measurementValue: 10 },
          ],
        })),
      })),
    } as Workout
    const inputs = {
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS'],
        executableLoads: true,
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      goal: 'general' as const,
      split: 'fullBody' as const,
      circuitsEnabled: true,
      startingExerciseCodes: codes,
      nonCoreCountOverride: 2,
      coreCountOverride: 0,
    }
    const userContext = {
      exercises: catalog,
      completedWorkouts: [history],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }
    const recovered = generateOptimDemo(inputs, userContext)
    const product = generateOptimUserWorkout(inputs, userContext, 'circuits')

    expect(recovered.exercises.map((item) => item.groupType)).toEqual([null, null])
    expect(product.circuitFallback).toBe(false)
    expect(product.result.exercises.map((item) => item.groupType)).toEqual(['circuit', 'circuit'])
    expect(product.result.exercises.every((item) => item.sets.every((set) =>
      set.setType === 'normal' && set.weightKg != null && set.targetRpe != null,
    ))).toBe(true)
    expect(product.notices).toContain('circuitLoadsGuided')
    expect(product.notices).not.toContain('circuitFallback')
  })

  it('enables proven same-station dumbbell supersets only through the product seam', () => {
    // Why: Instant Workout should use the nearby-bench policy while legacy
    // engine callers retain exact equipment matching by default.
    const codes = ['PRODUCT_LATERAL_RAISE', 'PRODUCT_SKULLCRUSHER']
    const generated = generateOptimUserWorkout({
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS', 'EXERCISE_BENCH'],
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      goal: 'bodybuilding',
      split: 'fullBody',
      supersetsEnabled: true,
      startingExerciseCodes: codes,
      nonCoreCountOverride: 2,
      coreCountOverride: 0,
    }, {
      exercises: [
        catalogExercise(codes[0], 'ANTERIOR_DELTOID', ['DUMBBELLS', 'EXERCISE_BENCH']),
        catalogExercise(codes[1], 'TRICEPS_BRACHII'),
      ],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }, 'supersets')

    expect(generated.result.exercises.map((item) => item.groupType)).toEqual(['superset', 'superset'])
    expect(generated.notices).not.toContain('supersetUnavailable')
  })

  it('keeps authentic Olympic movements within technical rep ranges in the product seam', () => {
    // Why: later Olympic slots are still competition-lift practice, not
    // accessory hypertrophy work, regardless of duration or grouping choice.
    const codes = ['PRODUCT_POWER_CLEAN', 'PRODUCT_HANG_SNATCH', 'PRODUCT_SPLIT_JERK', 'PRODUCT_MUSCLE_CLEAN']
    const generated = generateOptimUserWorkout({
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS'],
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      goal: 'olympic',
      split: 'fullBody',
      startingExerciseCodes: codes,
      nonCoreCountOverride: 4,
      coreCountOverride: 0,
    }, {
      exercises: [
        { ...catalogExercise(codes[0], 'QUADRICEPS'), exerciseTags: ['OLYMPIC_LIFTING'] },
        { ...catalogExercise(codes[1], 'LATISSIMUS_DORSI'), exerciseTags: ['OLYMPIC_LIFTING'] },
        { ...catalogExercise(codes[2], 'ANTERIOR_DELTOID'), exerciseTags: ['OLYMPIC_LIFTING'] },
        { ...catalogExercise(codes[3], 'GLUTEUS_MAXIMUS'), exerciseTags: ['OLYMPIC_LIFTING'] },
      ],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }, 'straight')
    const strength = generated.result.exercises.filter((item) => item.phase === 'strength')

    expect(strength).toHaveLength(4)
    expect(strength.every((item) => item.schemeSource.includes('olympic technical routing'))).toBe(true)
    expect(strength.flatMap((item) => item.sets)
      .filter((set) => set.setType === 'normal')
      .every((set) => (set.reps ?? 0) <= 5)).toBe(true)
  })

  it('applies identity-guarded loaded trunk-flexion caps only in the product seam', () => {
    const generated = generateOptimUserWorkout({
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS'],
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      nonCoreCountOverride: 0,
      coreCountOverride: 1,
    }, {
      exercises: [{
        ...catalogExercise('DUMBBELL.DECLINE.SIT.UP', 'RECTUS_ABDOMINIS'),
        exerciseName: 'Dumbbell Decline Sit-Up',
        exerciseTags: ['ABS_CORE', 'COMPOUND', 'ENDURANCE'],
      }],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }, 'straight')
    const normalSets = generated.result.exercises[0]?.sets.filter((set) => set.setType === 'normal') ?? []

    expect(normalSets.every((set) => (set.reps ?? 0) <= 20)).toBe(true)
    expect(generated.result.exercises[0]?.schemeSource).toContain('prescription metadata capped to 20 reps')
  })

  it('restores the missing core only in the product seam without reshaping existing lifts', () => {
    // Why: the recovered 46-49 minute strength-budget cliff must not make a
    // user lose work merely because they granted Optim more time.
    const strengthCodes = ['LEGS', 'CHEST', 'BACK', 'ARMS']
    const inputs = {
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS'],
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      durationMinutes: 46,
      goal: 'general' as const,
      split: 'fullBody' as const,
      startingExerciseCodes: strengthCodes,
    }
    const context = {
      exercises: [
        catalogExercise(strengthCodes[0], 'QUADRICEPS'),
        catalogExercise(strengthCodes[1], 'PECTORALIS_MAJOR_STERNAL_HEAD'),
        catalogExercise(strengthCodes[2], 'LATISSIMUS_DORSI'),
        catalogExercise(strengthCodes[3], 'BICEPS_BRACHII'),
        catalogExercise('CORE_ONE', 'RECTUS_ABDOMINIS'),
        catalogExercise('CORE_TWO', 'OBLIQUES'),
      ],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }
    const recovered = generateOptimDemo(inputs, context)
    const product = generateOptimUserWorkout(inputs, context, 'straight').result

    expect(recovered.counts.generatedCore).toBe(1)
    expect(product.counts.generatedCore).toBe(2)
    expect(product.exercises.filter((item) => item.phase === 'strength').map((item) => item.code))
      .toEqual(recovered.exercises.filter((item) => item.phase === 'strength').map((item) => item.code))
    expect(product.durationEstimate?.projectedMinutes).toBeLessThanOrEqual(46)
    expect(product.events).toContainEqual(expect.stringContaining('restored one core movement'))
  })

  it('adds one core movement so a structurally blocked grouping request can form', () => {
    // Why: specialized sessions are mostly protected primary lifts plus a
    // single core finisher, which made a supersets request return nothing.
    // One extra core movement forms an honest core pair; lifts, the manual
    // overrides contract, and the duration ceiling stay untouched.
    const inputs = {
      ...defaultOptimDemoInputs({
        equipmentCodes: ['BARBELL'],
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      durationMinutes: 30,
      goal: 'powerlifting' as const,
      split: 'upper' as const,
      supersetsEnabled: true,
    }
    const source = {
      exercises: [
        {
          ...catalogExercise('PL_BENCH', 'PECTORALIS_MAJOR_STERNAL_HEAD', ['BARBELL']),
          exerciseName: 'Barbell Bench Press',
          exerciseTags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
        },
        {
          ...catalogExercise('PL_OHP', 'ANTERIOR_DELTOID', ['BARBELL']),
          exerciseName: 'Barbell Shoulder Press',
          exerciseTags: ['POWERLIFTING', 'TIER_1', 'COMPOUND'],
        },
        {
          ...catalogExercise('PL_CORE_ONE', 'RECTUS_ABDOMINIS', []),
          exerciseEquipment: undefined,
          exerciseTags: ['ISOLATION', 'BODYWEIGHT'],
          exerciseTypeCode: 'BODYWEIGHT_REPS',
          exerciseMeasurements: ['REPS'],
        },
        {
          ...catalogExercise('PL_CORE_TWO', 'OBLIQUES', []),
          exerciseEquipment: undefined,
          exerciseTags: ['ISOLATION', 'BODYWEIGHT'],
          exerciseTypeCode: 'BODYWEIGHT_REPS',
          exerciseMeasurements: ['REPS'],
        },
      ],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }
    const recovered = generateOptimDemo({ ...inputs }, source)
    const product = generateOptimUserWorkout(inputs, source, 'supersets')

    expect(recovered.counts.generatedCore).toBe(1)
    expect(recovered.exercises.every((item) => item.groupId == null)).toBe(true)
    expect(product.notices).not.toContain('supersetUnavailable')
    const productCore = product.result.exercises.filter((item) => item.phase === 'core')
    expect(productCore).toHaveLength(2)
    expect(productCore.map((item) => item.groupType)).toEqual(['superset', 'superset'])
    expect(product.result.exercises.filter((item) => item.phase === 'strength').map((item) => item.code))
      .toEqual(recovered.exercises.filter((item) => item.phase === 'strength').map((item) => item.code))
    expect(product.result.events).toContainEqual(expect.stringContaining('so the requested superset mode could actually form'))

    // A manual core override is a contract: the restore must not rewrite it.
    const overridden = generateOptimUserWorkout(
      { ...inputs, coreCountOverride: 1 },
      source,
      'supersets',
    )
    expect(overridden.result.counts.generatedCore).toBe(1)
    expect(overridden.notices).toContain('supersetUnavailable')
  })

  it('fills a long automatic plan toward the selected window without changing the legacy result', () => {
    // Why: duration is a user promise. The product seam may add a bounded
    // amount of compatible work, but legacy/debug generation and the hard
    // ceiling must remain unchanged.
    const nonCoreMuscles = [
      'QUADRICEPS',
      'PECTORALIS_MAJOR_STERNAL_HEAD',
      'LATISSIMUS_DORSI',
      'HAMSTRINGS',
      'LATERAL_DELTOID',
      'BICEPS_BRACHII',
      'TRICEPS_BRACHII',
      'GLUTEUS_MAXIMUS',
      'GASTROCNEMIUS',
      'TRAPEZIUS',
      'QUADRICEPS',
      'PECTORALIS_MAJOR_STERNAL_HEAD',
      'LATISSIMUS_DORSI',
      'HAMSTRINGS',
    ]
    const inputs = {
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS'],
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      durationMinutes: 90,
      goal: 'general' as const,
      split: 'fullBody' as const,
      warmupSetsEnabled: false,
    }
    const context = {
      exercises: [
        ...nonCoreMuscles.map((muscle, index) => catalogExercise(`FILL_${index}`, muscle)),
        catalogExercise('FILL_CORE_ONE', 'RECTUS_ABDOMINIS'),
        catalogExercise('FILL_CORE_TWO', 'OBLIQUES'),
      ],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }
    const recovered = generateOptimDemo(inputs, context)
    const product = generateOptimUserWorkout(inputs, context, 'straight').result
    const recoveredCodes = recovered.exercises.map((exercise) => exercise.code)
    const productCodes = product.exercises.map((exercise) => exercise.code)

    expect(product.durationEstimate!.projectedMinutes)
      .toBeGreaterThan(recovered.durationEstimate!.projectedMinutes)
    expect(product.durationEstimate!.projectedMinutes).toBeLessThanOrEqual(90)
    expect(product.counts.requestedNonCore - recovered.counts.requestedNonCore)
      .toBeLessThanOrEqual(3)
    expect(recoveredCodes.every((code) => productCodes.includes(code))).toBe(true)
    expect(product.events).toContainEqual(expect.stringContaining('better match the requested 90-minute window'))
    expect(generateOptimDemo(inputs, context)).toEqual(recovered)
  })

  it('prevents the reachable 55-to-60 minute cardio setup from deleting core work', () => {
    // Why: the UI moves in five-minute steps, but cardio reservation turns a
    // 60-minute strength profile into the recovered 48-minute core gap.
    const strengthCodes = ['CARDIO_LEGS', 'CARDIO_CHEST', 'CARDIO_BACK', 'CARDIO_ARMS']
    const cardio: ExerciseListItem = {
      ...catalogExercise('CARDIO_FINISHER', 'QUADRICEPS', []),
      exerciseTags: ['CARDIO'],
      exerciseTypeCode: 'CARDIO',
      exerciseMeasurements: ['DURATION'],
      exerciseEquipment: undefined,
    }
    const context = {
      exercises: [
        catalogExercise(strengthCodes[0], 'QUADRICEPS'),
        catalogExercise(strengthCodes[1], 'PECTORALIS_MAJOR_STERNAL_HEAD'),
        catalogExercise(strengthCodes[2], 'LATISSIMUS_DORSI'),
        catalogExercise(strengthCodes[3], 'BICEPS_BRACHII'),
        catalogExercise('CARDIO_CORE_ONE', 'RECTUS_ABDOMINIS'),
        catalogExercise('CARDIO_CORE_TWO', 'OBLIQUES'),
        cardio,
      ],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }
    const atDuration = (durationMinutes: number) => ({
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS'],
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      durationMinutes,
      goal: 'strength' as const,
      split: 'fullBody' as const,
      cardioEnabled: true,
      selectedCardioExerciseCodes: ['CARDIO_FINISHER'],
      startingExerciseCodes: strengthCodes,
    })
    const recovered60 = generateOptimDemo(atDuration(60), context)
    const product55 = generateOptimUserWorkout(atDuration(55), context, 'straight').result
    const product60 = generateOptimUserWorkout(atDuration(60), context, 'straight').result

    expect(recovered60.durationEstimate?.strengthBudgetMinutes).toBe(48)
    expect(recovered60.counts.generatedCore).toBe(1)
    expect(product55.counts.generatedCore).toBe(2)
    expect(product60.counts.generatedCore).toBe(2)
    expect(product60.durationEstimate?.sessionProjectedMinutes).toBeLessThanOrEqual(60)
    expect(product60.exercises.filter((item) => item.phase === 'strength').map((item) => item.code))
      .toEqual(product55.exercises.filter((item) => item.phase === 'strength').map((item) => item.code))
  })

  it('returns unused rep-cardio allocation to useful strength through the product seam', () => {
    // Why: a selected rep-only cardio move tops out at eight prescribed
    // rounds; reserving the larger goal allocation created invisible dead air.
    const strengthMuscles = [
      'QUADRICEPS',
      'PECTORALIS_MAJOR_STERNAL_HEAD',
      'LATISSIMUS_DORSI',
      'HAMSTRINGS',
      'LATERAL_DELTOID',
      'BICEPS_BRACHII',
      'TRICEPS_BRACHII',
      'GLUTEUS_MAXIMUS',
      'GASTROCNEMIUS',
      'TRAPEZIUS',
      'RECTUS_ABDOMINIS',
      'OBLIQUES',
      'TRANSVERSE_ABDOMINIS',
    ]
    const cardio: ExerciseListItem = {
      ...catalogExercise('PRODUCT_REP_CARDIO', 'ANTERIOR_DELTOID', []),
      exerciseTags: ['CARDIO', 'BODYWEIGHT_ONLY'],
      exerciseTypeCode: 'REPS_ONLY',
      exerciseMeasurements: ['REPS'],
      exerciseEquipment: undefined,
    }
    const context = {
      exercises: [
        ...strengthMuscles.map((muscle, index) =>
          catalogExercise(`PRODUCT_CARDIO_STRENGTH_${index}`, muscle)),
        cardio,
      ],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }
    const inputs = {
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS'],
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      durationMinutes: 90,
      goal: 'muscleTone' as const,
      split: 'fullBody' as const,
      warmupSetsEnabled: false,
      cardioEnabled: true,
      selectedCardioExerciseCodes: [cardio.exerciseCode!],
    }
    const recovered = generateOptimDemo(inputs, context)
    const product = generateOptimUserWorkout(inputs, context, 'straight').result
    const cardioSets = (result: OptimDemoResult) =>
      result.exercises.find((exercise) => exercise.phase === 'cardio')?.sets
    const recoveredSessionMinutes =
      (recovered.durationEstimate?.projectedMinutes ?? 0) + recovered.exercises.length * 0.5

    expect(recovered.durationEstimate?.strengthBudgetMinutes).toBe(55)
    expect(product.durationEstimate?.strengthBudgetMinutes).toBe(78)
    expect(cardioSets(product)).toEqual(cardioSets(recovered))
    expect(product.counts.generatedStrength).toBeGreaterThan(recovered.counts.generatedStrength)
    expect(product.durationEstimate?.sessionProjectedMinutes).toBeGreaterThan(recoveredSessionMinutes)
    expect(product.durationEstimate?.sessionProjectedMinutes).toBeLessThanOrEqual(90)
  })

  it('does not let longer cardio suppress circuit strength fill', () => {
    // Why: once a cardio prescription reaches its useful interval cap,
    // additional selected time must stay available for strength rather than
    // making the longer workout lose useful work.
    const bodyweightMuscles = [
      'QUADRICEPS',
      'PECTORALIS_MAJOR_STERNAL_HEAD',
      'LATISSIMUS_DORSI',
      'HAMSTRINGS',
      'LATERAL_DELTOID',
      'BICEPS_BRACHII',
      'TRICEPS_BRACHII',
      'GLUTEUS_MAXIMUS',
      'RECTUS_ABDOMINIS',
      'OBLIQUES',
      'TRANSVERSE_ABDOMINIS',
    ]
    const cardio: ExerciseListItem = {
      ...catalogExercise('CIRCUIT_CARDIO', 'QUADRICEPS', []),
      exerciseTags: ['CARDIO', 'BODYWEIGHT'],
      exerciseTypeCode: 'CARDIO',
      exerciseMeasurements: ['DURATION'],
      exerciseEquipment: undefined,
    }
    const context = {
      exercises: [
        ...bodyweightMuscles.map((muscle, index) => ({
          ...catalogExercise(`CIRCUIT_BODY_${index}`, muscle, []),
          exerciseTags: ['BODYWEIGHT', index < 4 ? 'COMPOUND' : 'ISOLATION'],
          exerciseTypeCode: 'BODYWEIGHT_REPS',
          exerciseMeasurements: ['REPS'],
          exerciseEquipment: undefined,
        })),
        cardio,
      ],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
    }
    const atDuration = (durationMinutes: number) => generateOptimUserWorkout({
      ...defaultOptimDemoInputs({
        equipmentCodes: [],
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      durationMinutes,
      goal: 'muscleTone',
      split: 'fullBody',
      bodyweightOnly: true,
      cardioEnabled: true,
      selectedCardioExerciseCodes: [cardio.exerciseCode!],
      circuitsEnabled: true,
      seed: 0,
    }, context, 'circuits').result
    const shorter = atDuration(80)
    const longer = atDuration(85)
    const strengthAndCore = (result: OptimDemoResult) => result.exercises.filter((item) =>
      item.phase === 'strength' || item.phase === 'core')
    const workingSets = (result: OptimDemoResult) => strengthAndCore(result)
      .flatMap((item) => item.sets)
      .filter((set) => set.setType === 'normal').length

    expect(longer.durationEstimate?.strengthBudgetMinutes)
      .toBeGreaterThanOrEqual(shorter.durationEstimate?.strengthBudgetMinutes ?? 0)
    expect(strengthAndCore(longer).length).toBeGreaterThanOrEqual(strengthAndCore(shorter).length)
    expect(workingSets(longer)).toBeGreaterThanOrEqual(workingSets(shorter))
    expect(longer.durationEstimate?.sessionProjectedMinutes)
      .toBeGreaterThanOrEqual(shorter.durationEstimate?.sessionProjectedMinutes ?? 0)
    expect(longer.durationEstimate?.sessionProjectedMinutes).toBeLessThanOrEqual(85)
  })

  it('uses reviewed relationship warm starts only through the product seam', () => {
    // Why: Instant Workout can compose two already-reviewed evidence sources,
    // while direct engine callers must retain their prior cold-start result.
    const target = catalogExercise('DUMBBELL-SUMO-DEADLIFT', 'HAMSTRINGS')
    const inputs = {
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS'],
        executableLoads: true,
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      goal: 'general' as const,
      split: 'fullBody' as const,
      startingExerciseCodes: [target.exerciseCode!],
      nonCoreCountOverride: 1,
      coreCountOverride: 0,
    }
    const context = {
      exercises: [target],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
      gender: 'Male',
      ageYears: 40,
    }
    const recovered = generateOptimDemo(inputs, context).exercises[0]
    const product = generateOptimUserWorkout(inputs, context, 'straight').result.exercises[0]

    expect(recovered.theoreticalMaxKg).toBeNull()
    expect(product.theoreticalMaxKg).toBeGreaterThan(0)
    expect(product.sets.some((set) => set.setType === 'normal' && set.weightKg != null)).toBe(true)
    expect(product.trace).toContainEqual(expect.stringContaining('Derived demographic warm-start max'))
  })

  it('uses the exact renamed lateral-raise relationship only through the product seam', () => {
    // Why: this live code owns the recovered exercise's exact name, dumbbell
    // contract, per-side logging, and standing-lateral-raise video, while the
    // old mapping target is absent from the catalog. Legacy callers stay open.
    const target = {
      ...catalogExercise('LATERAL.RAISE', 'LATERAL_DELTOID'),
      exerciseName: 'Dumbbell Lateral Raise',
      isWeightPerSide: true,
    }
    const inputs = {
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS'],
        executableLoads: true,
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      goal: 'general' as const,
      split: 'fullBody' as const,
      startingExerciseCodes: [target.exerciseCode!],
      nonCoreCountOverride: 1,
      coreCountOverride: 0,
    }
    const context = {
      exercises: [target],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
      gender: 'Male',
      ageYears: 30,
    }

    const recovered = generateOptimDemo(inputs, context).exercises[0]
    const product = generateOptimUserWorkout(inputs, context, 'straight').result.exercises[0]

    expect(recovered.theoreticalMaxKg).toBeNull()
    expect(product.theoreticalMaxKg).toBeCloseTo(7.3, 1)
    expect(product.sets.some((set) => set.setType === 'normal' && set.weightKg != null)).toBe(true)
    expect(product.trace).toContainEqual(expect.stringContaining('BARBELL.BENCH.PRESS'))
    expect(product.trace).toContainEqual(expect.stringContaining('0.135'))
  })

  it('uses exact collapsed-source reviews only through the product seam', () => {
    const target = catalogExercise('DUMBBELL.BENT.OVER.ROW', 'LATISSIMUS_DORSI')
    const inputs = {
      ...defaultOptimDemoInputs({
        equipmentCodes: ['DUMBBELLS'],
        executableLoads: true,
        generationDate: new Date('2026-07-17T00:00:00.000Z'),
      }),
      goal: 'general' as const,
      split: 'fullBody' as const,
      startingExerciseCodes: [target.exerciseCode!],
      nonCoreCountOverride: 1,
      coreCountOverride: 0,
    }
    const context = {
      exercises: [target],
      completedWorkouts: [],
      muscleUsageStats: {
        '7d': emptyMuscleUsageCounts(),
        '30d': emptyMuscleUsageCounts(),
        '6m': emptyMuscleUsageCounts(),
      },
      gender: 'Male',
      ageYears: 40,
    }

    expect(generateOptimDemo(inputs, context).exercises[0].theoreticalMaxKg).toBeNull()
    const product = generateOptimUserWorkout(inputs, context, 'straight').result.exercises[0]
    expect(product.theoreticalMaxKg).toBe(16.5)
    expect(product.trace).toContainEqual(expect.stringContaining(
      'Reviewed product demographic warm-start max 16.5 kg',
    ))
  })

  it('keeps randomized product inputs deterministic and numerically valid', () => {
    // Why: the user surface composes many independent controls. A seeded sweep
    // catches interaction failures that isolated examples cannot while staying
    // exactly reproducible in CI.
    const weighted = [
      ['FUZZ_DUMBBELL_SQUAT', 'Dumbbell Squat', 'QUADRICEPS'],
      ['FUZZ_DUMBBELL_PRESS', 'Dumbbell Chest Press', 'PECTORALIS_MAJOR_STERNAL_HEAD'],
      ['FUZZ_DUMBBELL_ROW', 'Dumbbell Bent Over Row', 'LATISSIMUS_DORSI'],
      ['FUZZ_DUMBBELL_CURL', 'Dumbbell Curl', 'BICEPS_BRACHII'],
      ['FUZZ_DUMBBELL_RAISE', 'Dumbbell Lateral Raise', 'LATERAL_DELTOID'],
      ['FUZZ_DUMBBELL_CRUNCH', 'Dumbbell Crunch', 'RECTUS_ABDOMINIS'],
    ].map(([code, name, muscle], index) => ({
      ...catalogExercise(code, muscle),
      exerciseName: name,
      popularityRating: 10 - index,
      exerciseTags: [index < 3 ? 'COMPOUND' : 'ISOLATION', index < 3 ? 'TIER_1' : 'TIER_2'],
    }))
    const bodyweight = [
      ['FUZZ_BODYWEIGHT_SQUAT', 'Bodyweight Squat', 'QUADRICEPS'],
      ['FUZZ_PUSH_UP', 'Push-Up', 'PECTORALIS_MAJOR_STERNAL_HEAD'],
      ['FUZZ_BODYWEIGHT_ROW', 'Bodyweight Row', 'LATISSIMUS_DORSI'],
      ['FUZZ_BODYWEIGHT_CRUNCH', 'Crunch', 'RECTUS_ABDOMINIS'],
    ].map(([code, name, muscle], index) => ({
      ...catalogExercise(code, muscle, []),
      exerciseName: name,
      popularityRating: 8 - index,
      exerciseTags: ['BODYWEIGHT', index < 3 ? 'COMPOUND' : 'ISOLATION'],
      exerciseTypeCode: 'BODYWEIGHT_REPS',
      exerciseMeasurements: ['REPS'],
      exerciseEquipment: undefined,
    }))
    const exercises = [...weighted, ...bodyweight]
    const goals = ['strength', 'bodybuilding', 'general', 'muscleTone', 'powerlifting', 'olympic'] as const
    const experiences = ['beginner', 'intermediate', 'advanced'] as const
    const splits = ['fresh', 'fullBody', 'upper', 'lower', 'push', 'pull'] as const
    const groupings = ['straight', 'supersets', 'circuits'] as const
    let randomState = 0x0f71cafe
    let nonEmptyCaseCount = 0
    const randomInt = (max: number) => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
      return randomState % max
    }

    for (let iteration = 0; iteration < 240; iteration += 1) {
      const grouping = groupings[randomInt(groupings.length)]
      const bodyweightOnly = randomInt(3) === 0
      const excludedCode = exercises[randomInt(exercises.length)].exerciseCode ?? ''
      const inputs = {
        ...defaultOptimDemoInputs({
          equipmentCodes: bodyweightOnly ? [] : ['DUMBBELLS'],
          executableLoads: true,
          generationDate: new Date(Date.UTC(2026, 0, 1 + randomInt(365), 12)),
        }),
        durationMinutes: 15 + randomInt(16) * 5,
        goal: goals[randomInt(goals.length)],
        experience: experiences[randomInt(experiences.length)],
        split: splits[randomInt(splits.length)],
        bodyweightOnly,
        warmupSetsEnabled: randomInt(2) === 0,
        mobilityWarmupEnabled: randomInt(2) === 0,
        mobilityCooldownEnabled: randomInt(2) === 0,
        supersetsEnabled: grouping === 'supersets',
        circuitsEnabled: grouping === 'circuits',
        excludedExerciseCodes: [excludedCode],
        seed: randomInt(1000),
      }
      const userContext = {
        exercises,
        completedWorkouts: [],
        muscleUsageStats: {
          '7d': emptyMuscleUsageCounts(),
          '30d': emptyMuscleUsageCounts(),
          '6m': emptyMuscleUsageCounts(),
        },
        gender: ['Male', 'Female', 'Unknown'][randomInt(3)],
        ageYears: [18, 30, 45, 80][randomInt(4)],
      }
      const first = generateOptimUserWorkout(inputs, userContext, grouping)
      const second = generateOptimUserWorkout(inputs, userContext, grouping)

      expect(second).toEqual(first)
      if (first.result.exercises.length > 0) nonEmptyCaseCount += 1
      expect(first.result.exercises.map(exercise => exercise.code)).not.toContain(excludedCode)
      expect(new Set(first.result.exercises.map(exercise => exercise.code)).size)
        .toBe(first.result.exercises.length)
      expect(first.result.durationEstimate).toBeDefined()
      expect(first.result.durationEstimate!.projectedMinutes).toBeLessThanOrEqual(inputs.durationMinutes)
      expect(first.result.durationEstimate!.sessionProjectedMinutes).toBeLessThanOrEqual(inputs.durationMinutes)
      if (
        first.notices.includes('circuitLoadsGuided') ||
        first.notices.includes('circuitLoadsOpen')
      ) {
        expect(first.result.exercises.some((item) => item.groupType === 'circuit')).toBe(true)
      }

      const positionsByGroup = new Map<number, number[]>()
      first.result.exercises.forEach((exercise, index) => {
        if (exercise.groupId == null) {
          expect(exercise.groupType).toBeNull()
        } else {
          expect(exercise.groupType === 'superset' || exercise.groupType === 'circuit').toBe(true)
          positionsByGroup.set(exercise.groupId, [...(positionsByGroup.get(exercise.groupId) ?? []), index])
        }
        exercise.sets.forEach((set) => {
          expect(Number.isFinite(set.restSeconds) && set.restSeconds >= 0).toBe(true)
          if (set.reps != null) expect(Number.isFinite(set.reps) && set.reps > 0).toBe(true)
          if (set.durationSeconds != null) {
            expect(Number.isFinite(set.durationSeconds) && set.durationSeconds > 0).toBe(true)
          }
          if (set.weightKg != null) expect(Number.isFinite(set.weightKg) && set.weightKg >= 0).toBe(true)
          if (set.targetRpe != null) expect(set.targetRpe > 0 && set.targetRpe <= 10).toBe(true)
          if (bodyweightOnly) expect(set.weightKg).toBeUndefined()
        })
      })
      for (const positions of positionsByGroup.values()) {
        expect(positions.length).toBeGreaterThanOrEqual(2)
        expect(positions.at(-1)! - positions[0] + 1).toBe(positions.length)
      }
    }
    expect(nonEmptyCaseCount).toBeGreaterThan(120)
  })
})
