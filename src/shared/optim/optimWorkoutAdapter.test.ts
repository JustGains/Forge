import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'
import { describe, expect, it } from 'vitest'

import type {
  OptimDemoExercise,
  OptimDemoResult,
  OptimDemoSet,
} from './optimDemoEngine'
import { buildGroupedItems, normalizeExerciseGroups } from '../utils/exerciseGrouping'
import {
  buildIntervalWorkoutSteps,
  canStartIntervalWorkoutGroup,
  getSetRestSeconds,
} from '../utils/intervalWorkout'
import { getUsedMeasurements } from '../utils/workoutHelpers'

import {
  buildCatalogByCode,
  buildWorkoutDataFromOptim,
  generateOptimWorkoutTitle,
  maxExerciseGroupId,
} from './optimWorkoutAdapter'
import { estimateOptimGuidedSessionMinutes } from './optimDurationPolicy'
import { estimateOptimStartedGuidedMinutes } from './optimOutcomeStore'

function catalogItem(overrides: Partial<ExerciseListItem> = {}): ExerciseListItem {
  return {
    exerciseCode: 'BENCH_PRESS',
    exerciseName: 'Bench Press',
    exerciseTypeCode: 'WEIGHT_REPS',
    exerciseMeasurements: ['WEIGHT', 'REPS'],
    exerciseMedia: [
      {
        creatorProfileId: 'creator-1',
        exerciseVideos: [
          { thumbnailMediaAsset: { fileUrl: 'https://cdn/thumb.jpg' } },
        ],
      },
    ],
    ...overrides,
  } as ExerciseListItem
}

function optimSet(overrides: Partial<OptimDemoSet> = {}): OptimDemoSet {
  return {
    setNumber: 1,
    setType: 'normal',
    reps: 8,
    weightKg: 60,
    restSeconds: 90,
    ...overrides,
  }
}

function optimExercise(overrides: Partial<OptimDemoExercise> = {}): OptimDemoExercise {
  return {
    code: 'BENCH_PRESS',
    name: 'Bench Press',
    phase: 'strength',
    primaryBucket: 'chest',
    primaryMuscles: ['PECTORALIS_MAJOR_STERNAL_HEAD'],
    equipmentCodes: ['BARBELL'],
    score: 1,
    scoreBreakdown: null,
    rank: 1,
    schemeSource: 'test',
    maxEffort: false,
    weightedBodyweight: false,
    theoreticalMaxKg: null,
    groupId: null,
    groupType: null,
    sets: [optimSet()],
    trace: [],
    ...overrides,
  }
}

function optimResult(exercises: OptimDemoExercise[]): OptimDemoResult {
  return {
    generatedAt: '2026-07-16T00:00:00.000Z',
    counts: {
      computedNonCore: exercises.length,
      computedCore: 0,
      requestedNonCore: exercises.length,
      requestedCore: 0,
      generatedStrength: exercises.length,
      generatedCore: 0,
      generatedCardio: 0,
      generatedMobility: 0,
    },
    muscleUsage: {
      chest: 0, back: 0, shoulders: 0, arms: 0, legs: 0, core: 0,
    },
    recoveryWindowDays: 4,
    availabilityRatio: 1,
    exercises,
    rankedCandidates: [],
    rejectedCandidates: [],
    events: [],
    dataNotes: [],
  }
}

const CATALOG = buildCatalogByCode([catalogItem()])

describe('buildWorkoutDataFromOptim', () => {
  it('emits prescriptions, never completed logs: every planned number is a placeholder with no value and no set completed', () => {
    // Why: a generated plan the user has not performed must load into
    // WorkoutScreen as targets. A measurementValue would read as an already
    // logged result and corrupt history/1RM math the moment it syncs.
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({
          sets: [
            optimSet({ setType: 'warmup', reps: 10, weightKg: 20, restSeconds: 60 }),
            optimSet({ setNumber: 2, reps: 8, weightKg: 60, restSeconds: 90 }),
          ],
        }),
      ]),
      CATALOG,
    )

    const sets = workoutData[0].exerciseData ?? []
    expect(sets).toHaveLength(2)
    for (const set of sets) {
      expect(set.setCompleted).toBe(false)
      for (const measurement of set.setMeasurements ?? []) {
        expect(measurement.measurementValue).toBeNull()
        expect(measurement.measurementPlaceholder).not.toBeNull()
      }
    }
    // Warmup type survives (excluded from history/1RM math downstream) and
    // set numbers are dense 1..n, which the complete-cascade logic assumes.
    expect(sets[0].setType).toBe('warmup')
    expect(sets[1].setType).toBeUndefined()
    expect(sets.map((set) => set.setNumber)).toEqual([1, 2])
  })

  it('preserves planned numbers exactly, converting only distance meters to canonical km', () => {
    // Why: weights are stored in kg and distance in km across the app
    // (computeWorkoutDistanceKm sums DISTANCE as km); any other transform
    // would silently change the user's prescription.
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({
          sets: [optimSet({ reps: 5, weightKg: 62.5, restSeconds: 150 })],
        }),
        optimExercise({
          code: 'ROWING_MACHINE',
          name: 'Rowing Machine',
          phase: 'cardio',
          sets: [optimSet({ reps: undefined, weightKg: undefined, durationSeconds: 600, distanceMeters: 1500, restSeconds: 0 })],
        }),
      ]),
      buildCatalogByCode([
        catalogItem(),
        catalogItem({
          exerciseCode: 'ROWING_MACHINE',
          exerciseName: 'Rowing Machine',
          exerciseTypeCode: 'ROWING',
          exerciseMeasurements: ['DURATION', 'DISTANCE'],
        }),
      ]),
    )

    const strengthMeasurements = workoutData[0].exerciseData?.[0].setMeasurements ?? []
    expect(strengthMeasurements).toEqual(expect.arrayContaining([
      expect.objectContaining({ measurementCode: 'REPS', measurementPlaceholder: 5 }),
      expect.objectContaining({ measurementCode: 'WEIGHT', measurementPlaceholder: 62.5 }),
      expect.objectContaining({ measurementCode: 'REST', measurementPlaceholder: 150 }),
    ]))

    const cardioMeasurements = workoutData[1].exerciseData?.[0].setMeasurements ?? []
    expect(cardioMeasurements).toEqual(expect.arrayContaining([
      expect.objectContaining({ measurementCode: 'DURATION', measurementPlaceholder: 600 }),
      expect.objectContaining({ measurementCode: 'DISTANCE', measurementPlaceholder: 1.5 }),
    ]))
    expect(cardioMeasurements.some((m) => m.measurementCode === 'REST')).toBe(false)
  })

  it('persists an explicit circuit effort target through canonical RPE placeholders', () => {
    // Why: the guided circuit load is deliberately lighter. RPE 8 is the
    // durable two-reps-in-reserve signal that prevents later Optim history
    // from learning that reserve as a loss of strength, while ordinary sets
    // must not gain a surprise effort column.
    const catalog = buildCatalogByCode([
      catalogItem(),
      catalogItem({ exerciseCode: 'ROW', exerciseName: 'Row' }),
    ])
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({ sets: [optimSet({ targetRpe: 8 })] }),
        optimExercise({ code: 'ROW', sets: [optimSet()] }),
      ]),
      catalog,
    )
    const guided = workoutData[0].exerciseData?.[0].setMeasurements ?? []
    const ordinary = workoutData[1].exerciseData?.[0].setMeasurements ?? []

    expect(guided).toContainEqual(expect.objectContaining({
      measurementCode: 'RPE',
      measurementValue: null,
      measurementPlaceholder: 8,
    }))
    expect(workoutData[0].measurementTemplate).toContainEqual(
      expect.objectContaining({ measurementCode: 'RPE' }),
    )
    expect(ordinary.some((measurement) => measurement.measurementCode === 'RPE')).toBe(false)
    expect(workoutData[1].measurementTemplate?.some(
      (measurement) => measurement.measurementCode === 'RPE',
    )).toBe(false)
  })

  it('feeds the real rest timer: REST rides every set as a placeholder the timer reads', () => {
    // Why: WorkoutScreen's rest timer reads the set's REST measurement
    // (value ?? placeholder); without it the engine's rest prescription
    // would be decoration.
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({
          sets: [
            optimSet({ setType: 'warmup', restSeconds: 0 }),
            optimSet({ setNumber: 2, restSeconds: 120 }),
          ],
        }),
      ]),
      CATALOG,
    )

    const sets = workoutData[0].exerciseData ?? []
    expect(getSetRestSeconds(sets[0])).toBe(0)
    expect(getSetRestSeconds(sets[1])).toBe(120)
    // Uniform column: both sets carry the REST measurement.
    for (const set of sets) {
      expect(set.setMeasurements?.some((m) => m.measurementCode === 'REST')).toBe(true)
    }
  })

  it('chooses the weight code safely: WEIGHT, else BODYWEIGHT_PLUS_WEIGHT, and never writes a load into BODYWEIGHT_MINUS_ASSISTANCE', () => {
    // Why: on an assisted exercise the number means "assistance", so a
    // prescribed load written there would invert its meaning (a 60 kg
    // prescription would render as 60 kg of help).
    const catalog = buildCatalogByCode([
      catalogItem({ exerciseCode: 'WEIGHTED_DIP', exerciseMeasurements: ['BODYWEIGHT_PLUS_WEIGHT', 'REPS'] }),
      catalogItem({ exerciseCode: 'ASSISTED_PULL_UP', exerciseMeasurements: ['BODYWEIGHT_MINUS_ASSISTANCE', 'REPS'] }),
      catalogItem({ exerciseCode: 'PULL_UP', exerciseMeasurements: ['REPS'] }),
    ])
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({ code: 'WEIGHTED_DIP', sets: [optimSet({ weightKg: 20 })] }),
        optimExercise({ code: 'ASSISTED_PULL_UP', sets: [optimSet({ weightKg: 30, reps: 6 })] }),
        optimExercise({
          code: 'PULL_UP',
          weightedBodyweight: true,
          sets: [optimSet({ weightKg: 4, reps: 8 })],
        }),
      ]),
      catalog,
    )

    const dip = workoutData[0].exerciseData?.[0].setMeasurements ?? []
    expect(dip.some((m) => m.measurementCode === 'BODYWEIGHT_PLUS_WEIGHT' && m.measurementPlaceholder === 20)).toBe(true)

    const assisted = workoutData[1].exerciseData?.[0].setMeasurements ?? []
    expect(assisted.some((m) => m.measurementCode === 'BODYWEIGHT_MINUS_ASSISTANCE')).toBe(false)
    expect(assisted.some((m) => m.measurementCode === 'WEIGHT')).toBe(false)
    // The reps prescription survives even though the load was dropped.
    expect(assisted.some((m) => m.measurementCode === 'REPS' && m.measurementPlaceholder === 6)).toBe(true)

    const weightedFallback = workoutData[2].exerciseData?.[0].setMeasurements ?? []
    expect(weightedFallback.some(
      (m) => m.measurementCode === 'BODYWEIGHT_PLUS_WEIGHT' && m.measurementPlaceholder === 4,
    )).toBe(true)
    expect(weightedFallback.some((m) => m.measurementCode === 'WEIGHT')).toBe(false)
  })

  it('uses HOLD_DURATION when that is the only duration measurement the exercise has', () => {
    const catalog = buildCatalogByCode([
      catalogItem({ exerciseCode: 'PLANK', exerciseMeasurements: ['HOLD_DURATION'] }),
    ])
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({ code: 'PLANK', sets: [optimSet({ reps: undefined, weightKg: undefined, durationSeconds: 45 })] }),
      ]),
      catalog,
    )
    const measurements = workoutData[0].exerciseData?.[0].setMeasurements ?? []
    expect(measurements.some((m) => m.measurementCode === 'HOLD_DURATION' && m.measurementPlaceholder === 45)).toBe(true)
  })

  it('maps engine supersets to SUPERSET groups that survive buildGroupedItems and normalizeExerciseGroups intact', () => {
    // Why: the session UI groups only adjacent rows with a shared id and
    // strips groups with fewer than 2 members on hydrate; the adapter's
    // output must land in exactly that shape or supersets silently unrender.
    const catalog = buildCatalogByCode([
      catalogItem(),
      catalogItem({ exerciseCode: 'BENT_OVER_ROW', exerciseName: 'Bent-Over Row' }),
    ])
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({ groupId: 3, groupType: 'superset' }),
        optimExercise({ code: 'BENT_OVER_ROW', groupId: 3, groupType: 'superset' }),
      ]),
      catalog,
    )

    expect(workoutData.map((entry) => entry.exerciseGroupType)).toEqual(['SUPERSET', 'SUPERSET'])
    expect(normalizeExerciseGroups(workoutData)).toBe(workoutData)

    const grouped = buildGroupedItems(workoutData)
    expect(grouped).toHaveLength(1)
    expect(grouped[0].type).toBe('group')
    expect(grouped[0].groupType).toBe('SUPERSET')
    expect(grouped[0].exercises).toHaveLength(2)
  })

  it('maps circuits to CIRCUIT groups that the interval player accepts, ordering exercise-major with the prescribed seconds', () => {
    // Why: WorkoutScreen hands a CIRCUIT group to the interval engine in
    // 'circuit' mode; timed sets must keep interval eligibility and the
    // exact prescribed work/rest seconds.
    const catalog = buildCatalogByCode([
      catalogItem({ exerciseCode: 'MOUNTAIN_CLIMBER', exerciseMeasurements: ['DURATION'] }),
      catalogItem({ exerciseCode: 'BURPEE', exerciseMeasurements: ['DURATION'] }),
    ])
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({
          code: 'MOUNTAIN_CLIMBER',
          groupId: 1,
          groupType: 'circuit',
          sets: [optimSet({ reps: undefined, weightKg: undefined, durationSeconds: 30, restSeconds: 15 })],
        }),
        optimExercise({
          code: 'BURPEE',
          groupId: 1,
          groupType: 'circuit',
          sets: [optimSet({ reps: undefined, weightKg: undefined, durationSeconds: 40, restSeconds: 20 })],
        }),
      ]),
      catalog,
    )

    expect(workoutData.map((entry) => entry.exerciseGroupType)).toEqual(['CIRCUIT', 'CIRCUIT'])
    expect(canStartIntervalWorkoutGroup(workoutData)).toBe(true)

    const steps = buildIntervalWorkoutSteps(
      workoutData.map((exercise, index) => ({ entryKey: `entry-${index}`, exercise })),
      'circuit',
    )
    expect(steps.map((step) => [step.exercise.exerciseCode, step.targetSeconds, step.restSeconds])).toEqual([
      ['MOUNTAIN_CLIMBER', 30, 15],
      ['BURPEE', 40, 20],
    ])
  })

  it('keeps the generated and editable-workout guided clocks aligned for timed groups', () => {
    // Why: Forge displays the engine estimate before review, then estimates
    // the canonical WorkoutData after an edit. A conversion boundary mismatch
    // would make the time jump even when the user changed nothing.
    const catalog = buildCatalogByCode([
      catalogItem({ exerciseCode: 'MOUNTAIN_CLIMBER', exerciseMeasurements: ['DURATION'] }),
      catalogItem({ exerciseCode: 'BURPEE', exerciseMeasurements: ['DURATION'] }),
    ])
    const result = optimResult([
      optimExercise({
        code: 'MOUNTAIN_CLIMBER',
        groupId: 1,
        groupType: 'circuit',
        sets: [optimSet({
          reps: undefined,
          weightKg: undefined,
          durationSeconds: 30,
          restSeconds: 45,
        })],
      }),
      optimExercise({
        code: 'BURPEE',
        groupId: 1,
        groupType: 'circuit',
        sets: [optimSet({
          reps: undefined,
          weightKg: undefined,
          durationSeconds: 40,
          restSeconds: 20,
        })],
      }),
    ])
    result.durationEstimate = {
      requestedMinutes: 15,
      projectedMinutes: 1.2,
      utilization: 0.08,
      sessionProjectedMinutes: 2.2,
      sessionUtilization: 0.147,
      strengthBudgetMinutes: 15,
    }

    const { workoutData } = buildWorkoutDataFromOptim(result, catalog)

    expect(estimateOptimGuidedSessionMinutes(result)).toBe(2.5)
    expect(estimateOptimStartedGuidedMinutes(workoutData)).toBe(2.5)
  })

  it('ungroups orphan and split group runs instead of shipping broken headers', () => {
    // Why: buildGroupedItems renders a header per contiguous run, so a split
    // group would show two "Superset" headers, and normalizeExerciseGroups
    // cannot repair a 2+1 split on hydrate.
    const catalog = buildCatalogByCode([
      catalogItem({ exerciseCode: 'A' }),
      catalogItem({ exerciseCode: 'B' }),
      catalogItem({ exerciseCode: 'C' }),
      catalogItem({ exerciseCode: 'D' }),
      catalogItem({ exerciseCode: 'E' }),
    ])
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({ code: 'A', groupId: 7, groupType: 'superset' }),
        optimExercise({ code: 'B', groupId: 7, groupType: 'superset' }),
        optimExercise({ code: 'C', groupId: null, groupType: null }),
        // Stray member of group 7 after a break — must not render a second header.
        optimExercise({ code: 'D', groupId: 7, groupType: 'superset' }),
        // Single-member group — a superset of one is just an exercise.
        optimExercise({ code: 'E', groupId: 9, groupType: 'superset' }),
      ]),
      catalog,
    )

    expect(workoutData[0].exerciseGroupId).toBe(7)
    expect(workoutData[1].exerciseGroupId).toBe(7)
    expect(workoutData[3].exerciseGroupId).toBeNull()
    expect(workoutData[3].exerciseGroupType).toBeNull()
    expect(workoutData[4].exerciseGroupId).toBeNull()

    const grouped = buildGroupedItems(workoutData)
    expect(grouped.filter((item) => item.type === 'group')).toHaveLength(1)
  })

  it('clears incomplete and mixed-type group metadata instead of rendering a malformed group', () => {
    // Why: a group is one contiguous run with one production type. Keeping a
    // type without an id (or mixing SUPERSET/CIRCUIT under one id) makes the
    // shared editor and interval player disagree about what the user sees.
    const catalog = buildCatalogByCode(
      ['A', 'B', 'C', 'D', 'E'].map((exerciseCode) => catalogItem({ exerciseCode })),
    )
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({ code: 'A', groupId: 11, groupType: 'superset' }),
        optimExercise({ code: 'B', groupId: 11, groupType: 'circuit' }),
        optimExercise({ code: 'C', groupId: null, groupType: 'superset' }),
        optimExercise({ code: 'D', groupId: 12, groupType: null }),
        optimExercise({ code: 'E', groupId: 12, groupType: null }),
      ]),
      catalog,
    )

    for (const entry of workoutData) {
      expect(entry.exerciseGroupId).toBeNull()
      expect(entry.exerciseGroupType).toBeNull()
      expect(entry.exerciseGroupName).toBeNull()
    }
    expect(buildGroupedItems(workoutData).every((item) => item.type === 'exercise')).toBe(true)
  })

  it('maintains group invariants across seeded hostile run shapes', () => {
    // Why: group ids are interpreted by adjacency, not globally. Randomized
    // odd runs, reused ids, and mixed types exercise far more edge shapes than
    // a few hand-picked examples while remaining deterministic in CI.
    let randomState = 0x5eed1234
    const randomInt = (max: number) => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0
      return randomState % max
    }

    for (let scenario = 0; scenario < 64; scenario++) {
      const specs: Array<{ groupId: number | null; groupType: 'superset' | 'circuit' | null }> = []
      for (let index = 0; index < 24; index++) {
        if (index > 0 && randomInt(4) === 0) {
          specs.push({ ...specs[index - 1] })
          continue
        }
        const groupChoice = randomInt(6)
        const typeChoice = randomInt(3)
        specs.push({
          groupId: groupChoice === 0 ? null : (groupChoice % 4) + 1,
          groupType: typeChoice === 0 ? null : typeChoice === 1 ? 'superset' : 'circuit',
        })
      }

      const codes = specs.map((_, index) => `SCENARIO_${scenario}_${index}`)
      const catalog = buildCatalogByCode(codes.map((exerciseCode) => catalogItem({ exerciseCode })))
      const { workoutData } = buildWorkoutDataFromOptim(
        optimResult(specs.map((spec, index) => optimExercise({
          code: codes[index],
          ...spec,
          sets: [optimSet({ reps: index + 1 })],
        }))),
        catalog,
      )

      expect(workoutData.map((entry) => entry.exerciseCode)).toEqual(codes)
      const claimedIds = new Set<number>()
      for (let index = 0; index < workoutData.length;) {
        const entry = workoutData[index]
        const groupId = entry.exerciseGroupId
        if (groupId == null) {
          expect(entry.exerciseGroupType).toBeNull()
          expect(entry.exerciseGroupName).toBeNull()
          index += 1
          continue
        }

        expect(entry.exerciseGroupType === 'SUPERSET' || entry.exerciseGroupType === 'CIRCUIT').toBe(true)
        expect(claimedIds.has(groupId), `scenario ${scenario} reused group ${groupId}`).toBe(false)
        claimedIds.add(groupId)
        let end = index + 1
        while (
          end < workoutData.length &&
          workoutData[end].exerciseGroupId === groupId &&
          workoutData[end].exerciseGroupType === entry.exerciseGroupType
        ) end += 1
        expect(end - index, `scenario ${scenario} kept an orphan group`).toBeGreaterThanOrEqual(2)
        index = end
      }
    }
  })

  it('keeps exercises missing from the catalog with an explicit missing code instead of dropping them', () => {
    // Why: silently losing a generated exercise would make the plan lie
    // about what the engine prescribed; a name-only card is honest and usable.
    const { workoutData, missingCatalogCodes } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise(),
        optimExercise({
          code: 'MYSTERY_MOVE',
          name: 'Mystery Move',
          isWeightPerSide: true,
          sets: [optimSet({ weightKg: 12.5, reps: 10 })],
        }),
      ]),
      CATALOG,
    )

    expect(missingCatalogCodes).toEqual(['MYSTERY_MOVE'])
    expect(workoutData).toHaveLength(2)
    const missing = workoutData[1]
    expect(missing.exerciseCode).toBe('MYSTERY_MOVE')
    expect(missing.exerciseName).toBe('Mystery Move')
    expect(missing.isWeightPerSide).toBe(true)
    expect(missing.exerciseOrder).toBe(1)
    const measurements = missing.exerciseData?.[0].setMeasurements ?? []
    expect(measurements.some((m) => m.measurementCode === 'WEIGHT' && m.measurementPlaceholder === 12.5)).toBe(true)
  })

  it('carries per-side metadata from the catalog without touching the numeric load', () => {
    // Why: the engine already emits per-side loads for per-side exercises;
    // the flag only changes the label, so doubling or halving here would
    // corrupt the prescription.
    const catalog = buildCatalogByCode([
      catalogItem({
        exerciseCode: 'DB_BENCH',
        exerciseMeasurements: ['WEIGHT', 'REPS'],
        exerciseTags: ['WEIGHT_PER_SIDE'],
      }),
    ])
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({ code: 'DB_BENCH', isWeightPerSide: true, sets: [optimSet({ weightKg: 22.5 })] }),
      ]),
      catalog,
    )

    expect(workoutData[0].isWeightPerSide).toBe(true)
    const measurements = workoutData[0].exerciseData?.[0].setMeasurements ?? []
    expect(measurements.some((m) => m.measurementCode === 'WEIGHT' && m.measurementPlaceholder === 22.5)).toBe(true)
  })

  it('denormalizes catalog thumbnail, creator, and type, and preserves exercise order', () => {
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([optimExercise()]),
      CATALOG,
    )
    const entry = workoutData[0]
    expect(entry.exerciseThumbnailUrl).toBe('https://cdn/thumb.jpg')
    expect(entry.creatorProfileId).toBe('creator-1')
    expect(entry.exerciseTypeCode).toBe('WEIGHT_REPS')
    expect(entry.exerciseOrder).toBe(0)
  })

  it('produces set data whose active measurement columns match what was written (getUsedMeasurements)', () => {
    // Why: the workout card derives its columns from set measurements; the
    // template must contain every written code or the toggle sheet loses it.
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([optimExercise()]),
      CATALOG,
    )
    const entry = workoutData[0]
    const active = getUsedMeasurements({ workoutData: entry }).map((m) => m.measurementCode)
    expect(active).toEqual(expect.arrayContaining(['REPS', 'WEIGHT', 'REST']))
    const templateCodes = (entry.measurementTemplate ?? []).map((m) => m.measurementCode)
    for (const code of active) expect(templateCodes).toContain(code)
  })
})

describe('maxExerciseGroupId', () => {
  it('returns the highest generated group id so editor-created groups never collide', () => {
    const catalog = buildCatalogByCode([
      catalogItem({ exerciseCode: 'A' }),
      catalogItem({ exerciseCode: 'B' }),
    ])
    const { workoutData } = buildWorkoutDataFromOptim(
      optimResult([
        optimExercise({ code: 'A', groupId: 4, groupType: 'superset' }),
        optimExercise({ code: 'B', groupId: 4, groupType: 'superset' }),
      ]),
      catalog,
    )
    expect(maxExerciseGroupId(workoutData)).toBe(4)
    expect(maxExerciseGroupId([])).toBe(0)
  })
})

describe('generateOptimWorkoutTitle', () => {
  it('is deterministic per seed and names the trained focus', () => {
    const result = optimResult([
      optimExercise({ primaryBucket: 'chest' }),
      optimExercise({ code: 'X', primaryBucket: 'arms' }),
    ])
    const title = generateOptimWorkoutTitle(result, 0)
    expect(title).toContain('Chest & Arms')
    expect(generateOptimWorkoutTitle(result, 0)).toBe(title)
    expect(generateOptimWorkoutTitle(result, 1)).not.toBe(title)
  })

  it('falls back to Full Body when the focus is broad or unknown', () => {
    const broad = optimResult([
      optimExercise({ primaryBucket: 'chest' }),
      optimExercise({ code: 'X1', primaryBucket: 'arms' }),
      optimExercise({ code: 'X2', primaryBucket: 'legs' }),
    ])
    expect(generateOptimWorkoutTitle(broad, 0)).toContain('Full Body')
    expect(generateOptimWorkoutTitle(optimResult([]), 2)).toContain('Full Body')
  })

  it('localizes title parts and sentence order through the product translator', () => {
    // Why: the generated title is saved into the real workout, so it must not
    // bypass the same localization seam as the rest of the generator screen.
    const translations: Record<string, string> = {
      'Chest (muscle)': 'Pecho',
      'Arms (muscle)': 'Brazos',
      'Served Fresh': 'Recién servido',
      '{first} & {second}': '{first} y {second}',
      '{focus}, {tagline}': '{tagline}: {focus}',
    }
    const result = optimResult([
      optimExercise({ primaryBucket: 'chest' }),
      optimExercise({ code: 'X', primaryBucket: 'arms' }),
    ])

    expect(generateOptimWorkoutTitle(result, 0, key => translations[key] ?? key))
      .toBe('Recién servido: Pecho y Brazos')
  })
})
