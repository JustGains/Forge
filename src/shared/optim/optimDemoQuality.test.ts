import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'
import type { MuscleUsageStats } from '../utils/muscleUsage'
import { emptyMuscleUsageCounts } from '../utils/muscleUsage'
import { describe, expect, it } from 'vitest'

import {
  OPTIM_EXPERIENCES,
  OPTIM_GOALS,
  OPTIM_SPLITS,
  defaultOptimDemoInputs,
  generateOptimDemo,
  type OptimDemoUserContext,
} from './optimDemoEngine'

const DATE = '2026-07-15T12:00:00.000Z'
const EMPTY_USAGE: MuscleUsageStats = {
  '7d': emptyMuscleUsageCounts(),
  '30d': emptyMuscleUsageCounts(),
  '6m': emptyMuscleUsageCounts(),
}

const BUCKET_MUSCLES = {
  chest: 'PECTORALIS_MAJOR_STERNAL_HEAD',
  shoulders: 'ANTERIOR_DELTOID',
  arms: 'BICEPS_BRACHII',
  legs: 'QUADRICEPS',
  back: 'LATISSIMUS_DORSI',
} as const

function fixtureExercise(
  bucket: keyof typeof BUCKET_MUSCLES,
  tier: 1 | 2 | 3 | 4,
  pool: 'powerlifting' | 'olympic' = 'powerlifting',
): ExerciseListItem {
  const popularity = tier === 1 ? 9 : tier === 2 ? 6 : tier === 3 ? 3 : 1
  const movement = pool === 'olympic' ? 'POWER_CLEAN' : 'BENCH_PRESS'
  return {
    exerciseCode: `FIXTURE_${movement}_${bucket.toUpperCase()}_${tier}`,
    exerciseName: `Fixture ${movement} ${bucket} ${tier}`,
    popularityRating: popularity,
    exerciseTags: [
      `TIER_${tier}`,
      tier === 1 ? 'COMPOUND' : 'ISOLATION',
      pool === 'olympic' ? 'OLYMPIC_LIFTING' : 'POWERLIFTING',
    ],
    exerciseTypeCode: 'WEIGHT_REPS',
    exerciseMeasurements: ['WEIGHT', 'REPS'],
    exerciseEquipment: { required: [['BARBELL']] },
    exerciseMuscles: [{
      muscleCode: BUCKET_MUSCLES[bucket],
      isPrimary: true,
      targetPercentage: 80,
    }],
  }
}

const CATALOG: ExerciseListItem[] = [
  ...Object.keys(BUCKET_MUSCLES).flatMap((bucket) =>
    ([1, 2, 3, 4] as const).map((tier) =>
      fixtureExercise(bucket as keyof typeof BUCKET_MUSCLES, tier))),
  ...Object.keys(BUCKET_MUSCLES).flatMap((bucket) =>
    ([1, 2, 3, 4] as const).map((tier) =>
      fixtureExercise(bucket as keyof typeof BUCKET_MUSCLES, tier, 'olympic'))),
  ...([1, 2, 3] as const).map((tier) => ({
    ...fixtureExercise('chest', tier),
    exerciseCode: `FIXTURE_CORE_${tier}`,
    exerciseName: `Fixture core ${tier}`,
    exerciseMuscles: [{ muscleCode: 'RECTUS_ABDOMINIS', isPrimary: true, targetPercentage: 100 }],
  })),
  {
    exerciseCode: 'FIXTURE_CARDIO',
    exerciseName: 'Fixture Cardio',
    popularityRating: 8,
    exerciseTags: ['CARDIO', 'BODYWEIGHT_ONLY'],
    exerciseTypeCode: 'DISTANCE_DURATION',
    exerciseMeasurements: ['DISTANCE', 'DURATION'],
    exerciseMuscles: [{ muscleCode: 'QUADRICEPS', isPrimary: true, targetPercentage: 100 }],
  },
  ...Array.from({ length: 8 }, (_, index): ExerciseListItem => ({
    exerciseCode: `FIXTURE_MOBILITY_${index}`,
    exerciseName: `Fixture Mobility ${index}`,
    popularityRating: 8 - index / 10,
    exerciseTags: ['STRETCHING', 'BODYWEIGHT_ONLY'],
    exerciseTypeCode: 'STATIC_STRETCHES',
    exerciseMeasurements: ['DURATION'],
    exerciseMuscles: [{
      muscleCode: Object.values(BUCKET_MUSCLES)[index % Object.values(BUCKET_MUSCLES).length],
      isPrimary: true,
      targetPercentage: 100,
    }],
  })),
]

const FOUNDATION_MOVEMENTS = {
  chest: 'Bench Press',
  shoulders: 'Overhead Press',
  arms: 'Curl',
  legs: 'Squat',
  back: 'Row',
} as const

const RESTRICTED_FOUNDATION_CATALOG: ExerciseListItem[] = Object.entries(FOUNDATION_MOVEMENTS).flatMap(
  ([bucket, movement]) => ([1, 2, 3, 4] as const).map((tier) => ({
    exerciseCode: `FIXTURE_FOUNDATION_${bucket.toUpperCase()}_${tier}`,
    exerciseName: `Bodyweight ${movement} ${tier}`,
    popularityRating: 10 - tier,
    exerciseTags: ['BODYWEIGHT_ONLY', `TIER_${tier}`, tier <= 2 ? 'COMPOUND' : 'ISOLATION'],
    exerciseTypeCode: 'BODYWEIGHT',
    exerciseMeasurements: ['REPS'],
    exerciseMuscles: [{
      muscleCode: BUCKET_MUSCLES[bucket as keyof typeof BUCKET_MUSCLES],
      isPrimary: true,
      targetPercentage: 80,
    }],
  })),
)

const CONTEXT: OptimDemoUserContext = {
  exercises: CATALOG,
  completedWorkouts: [],
  muscleUsageStats: EMPTY_USAGE,
  bodyWeightKg: 80,
}

describe('Optim quality matrix', () => {
  it('generates complete, deterministic, non-duplicated workouts across the core input matrix', () => {
    for (const { value: goal } of OPTIM_GOALS) {
      for (const { value: experience } of OPTIM_EXPERIENCES) {
        for (const { value: split } of OPTIM_SPLITS) {
          for (const seed of [0, 1]) {
            const key = `${goal}/${experience}/${split}/seed-${seed}`
            const inputs = {
              ...defaultOptimDemoInputs({
                equipmentCodes: ['BARBELL'],
                generationDate: new Date(seed === 0 ? DATE : '2026-01-21T12:00:00.000Z'),
              }),
              goal,
              experience,
              split,
              seed,
              circuitsEnabled: seed === 1,
              nonCoreCountOverride: 4,
              coreCountOverride: 2,
            }
            const result = generateOptimDemo(inputs, CONTEXT)
            const repeat = generateOptimDemo(inputs, CONTEXT)
            const strength = result.exercises.filter((exercise) => exercise.phase === 'strength')
            const core = result.exercises.filter((exercise) => exercise.phase === 'core')
            const codes = result.exercises.map((exercise) => exercise.code)

            expect(result, `${key} is nondeterministic`).toEqual(repeat)
            expect(new Set(codes).size, `${key} has duplicates`).toBe(codes.length)
            expect(strength, `${key} underfilled strength`).toHaveLength(4)
            expect(core, `${key} underfilled core`).toHaveLength(2)
            expect(result.exercises.filter((exercise) => exercise.maxEffort).length).toBeLessThanOrEqual(1)

            for (const exercise of result.exercises) {
              expect(exercise.sets.map((set) => set.setNumber))
                .toEqual(Array.from({ length: exercise.sets.length }, (_, index) => index + 1))
              for (const set of exercise.sets) {
                expect(set.restSeconds).toBeGreaterThanOrEqual(0)
                expect(set.restSeconds).toBeLessThanOrEqual(300)
                if (set.reps != null) expect(set.reps).toBeGreaterThan(0)
                if (set.durationSeconds != null) expect(set.durationSeconds).toBeGreaterThan(0)
                if (set.weightKg != null) expect(set.weightKg).toBeGreaterThanOrEqual(0)
              }
            }

            if (split === 'lower') expect(strength.every((exercise) => exercise.primaryBucket === 'legs')).toBe(true)
            if (split === 'upper') expect(strength.every((exercise) => exercise.primaryBucket !== 'legs')).toBe(true)
            if (split === 'push') expect(strength.every((exercise) => exercise.primaryBucket === 'chest' || exercise.primaryBucket === 'shoulders')).toBe(true)
            if (split === 'pull') expect(strength.every((exercise) => exercise.primaryBucket === 'back' || exercise.primaryBucket === 'arms')).toBe(true)
            if (split === 'fullBody' && goal !== 'powerlifting' && goal !== 'olympic') {
              const buckets = new Set(strength.map((exercise) => exercise.primaryBucket))
              const selection = strength.map(exercise => `${exercise.code}:${exercise.primaryBucket}`).join(', ')
              expect(buckets.has('legs'), `${key} omitted lower-body coverage (${selection})`).toBe(true)
              expect(buckets.has('back'), `${key} omitted pull coverage (${selection})`).toBe(true)
              expect(
                buckets.has('chest') || buckets.has('shoulders'),
                `${key} omitted push coverage (${selection})`,
              ).toBe(true)
            }
          }
        }
      }
    }
  })

  it('keeps all optional stages complete and cross-phase unique for every goal', () => {
    for (const { value: goal } of OPTIM_GOALS) {
      const inputs = {
        ...defaultOptimDemoInputs({ equipmentCodes: ['BARBELL'], generationDate: new Date(DATE) }),
        goal,
        mobilityWarmupEnabled: true,
        mobilityCooldownEnabled: true,
        cardioEnabled: true,
        nonCoreCountOverride: 4,
        coreCountOverride: 2,
      }
      const result = generateOptimDemo(inputs, CONTEXT)
      const codes = result.exercises.map((exercise) => exercise.code)

      expect(result.counts.generatedCardio, `${goal} cardio underfilled`).toBe(1)
      expect(result.counts.generatedMobility, `${goal} mobility underfilled`).toBe(6)
      expect(new Set(codes).size, `${goal} duplicated an exercise across stages`).toBe(codes.length)
    }
  })

  it('fills restricted specialized sessions through labeled foundation work at every affected experience and split', () => {
    const affectedProfiles = [
      { goal: 'powerlifting' as const, experience: 'beginner' as const },
      { goal: 'powerlifting' as const, experience: 'intermediate' as const },
      { goal: 'powerlifting' as const, experience: 'advanced' as const },
      { goal: 'olympic' as const, experience: 'intermediate' as const },
      { goal: 'olympic' as const, experience: 'advanced' as const },
    ]
    const restrictedContext: OptimDemoUserContext = {
      ...CONTEXT,
      exercises: RESTRICTED_FOUNDATION_CATALOG,
    }

    for (const profile of affectedProfiles) {
      for (const { value: split } of OPTIM_SPLITS) {
        const result = generateOptimDemo({
          ...defaultOptimDemoInputs({ equipmentCodes: [], generationDate: new Date(DATE) }),
          ...profile,
          split,
          bodyweightOnly: true,
          nonCoreCountOverride: 4,
          coreCountOverride: 0,
        }, restrictedContext)
        const key = `${profile.goal}/${profile.experience}/${split}`

        expect(result.foundationFallback, `${key} changed the preserved beginner branch`).toBe(false)
        expect(result.counts.generatedStrength, `${key} underfilled`).toBe(4)
        expect(result.counts.foundationNonCore, `${key} did not disclose all fillers`).toBe(4)
        expect(result.exercises.every((exercise) =>
          exercise.trace.some((line) => line.includes('Strength-foundation filler'))), `${key} hid a filler`).toBe(true)
      }
    }
  })

  it('caps dense muscle-tone schemes to the time left after optional stages', () => {
    const inputs = {
      ...defaultOptimDemoInputs({ equipmentCodes: ['BARBELL'], generationDate: new Date(DATE) }),
      goal: 'muscleTone' as const,
      split: 'fullBody' as const,
      durationMinutes: 30,
      mobilityWarmupEnabled: true,
      mobilityCooldownEnabled: true,
      cardioEnabled: true,
    }
    const result = generateOptimDemo(inputs, CONTEXT)
    const estimatedSeconds = result.exercises.reduce((total, exercise) => {
      const exerciseSeconds = exercise.sets.reduce(
        (sum, set) => sum + (set.durationSeconds ?? (set.reps ?? 0) * 3) + set.restSeconds,
        0,
      )
      return total + exerciseSeconds - (exercise.sets.at(-1)?.restSeconds ?? 0)
    }, 0)

    expect(result.counts.generatedStrength).toBe(result.counts.requestedNonCore)
    expect(result.counts.generatedCore).toBe(result.counts.requestedCore)
    expect(estimatedSeconds).toBeLessThanOrEqual(inputs.durationMinutes * 60)
    expect(result.exercises.some((exercise) => exercise.schemeSource.includes('duration-capped'))).toBe(true)
  })
})
