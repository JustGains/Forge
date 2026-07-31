import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const asyncStorage = new Map<string, string>()

// Stands in for the platform adapter mobile injects (AsyncStorage) and web will
// inject (localStorage), so the store logic itself is tested platform-free.
const AsyncStorage = {
  getItem: vi.fn(async (key: string) => asyncStorage.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    asyncStorage.set(key, value)
  }),
  removeItem: vi.fn(async (key: string) => {
    asyncStorage.delete(key)
  }),
}

import type { WorkoutData } from '@justgains/shared/src/api/types/WorkoutData'

import {
  buildOptimOutcomeFromFinish,
  buildOptimPlanAggregates,
  buildOptimStartedShape,
  createOptimOutcomeStore,
  estimateOptimStartedGuidedMinutes,
  OPTIM_ESTIMATOR_VERSION,
  type OptimOutcome,
  type OptimPlanAggregates,
  type OptimStartedShape,
} from './optimOutcomeStore'

const {
  attachOptimOutcome,
  clearOptimPlanRecords,
  readOptimPlanRecords,
  recordOptimPlanStarted,
} = createOptimOutcomeStore(AsyncStorage)

const NOW = new Date('2026-07-19T08:00:00.000Z')
const USER_A_KEY = 'optimOutcomes:user-a'

const PLAN: OptimPlanAggregates = {
  estimatorVersion: OPTIM_ESTIMATOR_VERSION,
  seed: 7,
  generatedAt: '2026-07-19T07:00:00.000Z',
  requestedMinutes: 45,
  rawProjectedMinutes: 39.5,
  sessionProjectedMinutes: 43,
  guidedProjectedMinutes: 44.5,
  strengthBudgetMinutes: 35,
  grouping: 'straight',
  goal: 'strength',
  experience: 'intermediate',
  split: 'fullBody',
  warmupEnabled: true,
  cooldownEnabled: false,
  cardioEnabled: false,
  generatedStrengthExerciseCount: 4,
  generatedCoreExerciseCount: 1,
  generatedCardioExerciseCount: 0,
  generatedMobilityExerciseCount: 0,
  generatedCardioSeconds: 0,
  generatedMobilitySeconds: 0,
  generatedRepCount: 120,
  generatedUnilateralRepCount: 30,
  contentEdited: false,
  titleEdited: false,
}

const STARTED_SHAPE: OptimStartedShape = {
  exerciseCount: 5,
  plannedSetCount: 15,
  repWorkingSetCount: 12,
  warmupSetCount: 3,
  timedSetCount: 0,
  plannedTimedSeconds: 0,
  plannedRestSeconds: 900,
  plannedRepCount: 120,
  plannedRepWorkingCount: 96,
  guidedProjectedMinutes: 43,
}

const OUTCOME: OptimOutcome = {
  completedAt: '2026-07-19T07:50:00.000Z',
  durationSeconds: 2_520,
  durationSource: 'timer',
  autoPaused: false,
  finalExerciseCount: 5,
  finalSetCount: 15,
  completedSetCount: 15,
  completedRepWorkingSetCount: 12,
  completedWarmupSetCount: 3,
  loggedTimedSeconds: 0,
  completedRepCount: 120,
  completedRepWorkingCount: 96,
  autoCompletedSetCount: 2,
  removedEmptySetCount: 1,
}

const WORKOUT_DATA = [
  {
    exerciseCode: 'BENCH_PRESS',
    exerciseData: [
      {
        setNumber: 1,
        setType: 'warmup',
        setCompleted: true,
        setMeasurements: [
          { measurementCode: 'REPS', measurementValue: 10 },
          { measurementCode: 'REST', measurementValue: null, measurementPlaceholder: 45 },
        ],
      },
      {
        setNumber: 2,
        setCompleted: true,
        setMeasurements: [
          { measurementCode: 'REPS', measurementValue: 8 },
          { measurementCode: 'WEIGHT', measurementValue: 80 },
          { measurementCode: 'REST', measurementValue: null, measurementPlaceholder: 90 },
        ],
      },
    ],
  },
  {
    exerciseCode: 'BIKE',
    exerciseData: [
      {
        setNumber: 1,
        setCompleted: true,
        setMeasurements: [
          {
            measurementCode: 'DURATION',
            measurementValue: 300,
            measurementPlaceholder: 360,
          },
          { measurementCode: 'REST', measurementValue: null, measurementPlaceholder: 30 },
        ],
      },
    ],
  },
] as WorkoutData[]

beforeEach(() => {
  asyncStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Optim outcome aggregate builders', () => {
  it('captures the generated estimate without retaining exercise identity', () => {
    const plan = buildOptimPlanAggregates({
      result: {
        generatedAt: '2026-07-19T07:00:00.000Z',
        durationEstimate: {
          requestedMinutes: 45,
          projectedMinutes: 39,
          utilization: 0.867,
          sessionProjectedMinutes: 42,
          sessionUtilization: 0.933,
          strengthBudgetMinutes: 35,
        },
        counts: {
          computedNonCore: 4,
          computedCore: 1,
          requestedNonCore: 4,
          requestedCore: 1,
          generatedStrength: 4,
          generatedCore: 1,
          generatedCardio: 1,
          generatedMobility: 1,
        },
        exercises: [
          {
            code: 'SECRET_EXERCISE_CODE',
            name: 'Secret exercise name',
            phase: 'cardio',
            sets: [{ setNumber: 1, setType: 'normal', durationSeconds: 300, restSeconds: 0 }],
          },
          {
            code: 'SECRET_MOBILITY_CODE',
            name: 'Secret mobility name',
            phase: 'mobilityCooldown',
            sets: [{ setNumber: 1, setType: 'normal', durationSeconds: 90, restSeconds: 0 }],
          },
          {
            code: 'SECRET_UNILATERAL_CODE',
            name: 'Secret unilateral name',
            isUnilateral: true,
            phase: 'strength',
            sets: [
              { setNumber: 1, setType: 'normal', reps: 10, restSeconds: 30 },
              { setNumber: 2, setType: 'normal', reps: 10, restSeconds: 30 },
            ],
          },
        ],
      } as any,
      inputs: {
        durationMinutes: 45,
        goal: 'strength',
        experience: 'intermediate',
        split: 'fullBody',
        warmupSetsEnabled: true,
        mobilityCooldownEnabled: true,
        cardioEnabled: true,
      } as any,
      grouping: 'straight',
      seed: 7,
    })

    expect(plan).toEqual(expect.objectContaining({
      sessionProjectedMinutes: 42,
      guidedProjectedMinutes: 42,
      generatedCardioSeconds: 300,
      generatedMobilitySeconds: 90,
      generatedRepCount: 20,
      generatedUnilateralRepCount: 20,
    }))
    expect(JSON.stringify(plan)).not.toContain('SECRET_')
    expect(JSON.stringify(plan)).not.toContain('Secret exercise')
  })

  it('measures the durable started blueprint and completed shape, not pre-edit engine counts', () => {
    // Why: users can add, remove, or rewrite sets in review. Pace research must
    // describe the exact blueprint that Start committed and the exact finish.
    expect(buildOptimStartedShape(WORKOUT_DATA)).toEqual({
      exerciseCount: 2,
      plannedSetCount: 3,
      repWorkingSetCount: 1,
      warmupSetCount: 1,
      timedSetCount: 1,
      plannedTimedSeconds: 360,
      plannedRestSeconds: 165,
      plannedRepCount: 18,
      plannedRepWorkingCount: 8,
      guidedProjectedMinutes: 9.7,
    })

    expect(buildOptimOutcomeFromFinish({
      workoutData: WORKOUT_DATA,
      durationSeconds: 900,
      durationWasAdjusted: false,
      completedAt: NOW.toISOString(),
      autoPaused: true,
      manualPaused: true,
      pauseAttributionComplete: false,
      autoCompletedSetCount: 1,
      removedEmptySetCount: 2,
    })).toEqual({
      completedAt: NOW.toISOString(),
      durationSeconds: 900,
      durationSource: 'timer',
      autoPaused: true,
      manualPaused: true,
      pauseAttributionComplete: false,
      finalExerciseCount: 2,
      finalSetCount: 3,
      completedSetCount: 3,
      completedRepWorkingSetCount: 1,
      completedWarmupSetCount: 1,
      loggedTimedSeconds: 300,
      completedRepCount: 18,
      completedRepWorkingCount: 8,
      autoCompletedSetCount: 1,
      removedEmptySetCount: 2,
    })

    expect(buildOptimOutcomeFromFinish({
      workoutData: WORKOUT_DATA,
      durationSeconds: 900,
      durationWasAdjusted: true,
      completedAt: NOW.toISOString(),
      autoPaused: false,
      manualPaused: false,
      pauseAttributionComplete: true,
    }).durationSource).toBe('adjustedTimes')
    expect(buildOptimOutcomeFromFinish({
      workoutData: WORKOUT_DATA,
      durationSeconds: 0,
      durationWasAdjusted: false,
      completedAt: NOW.toISOString(),
      autoPaused: false,
      manualPaused: false,
      pauseAttributionComplete: true,
    }).durationSource).toBe('wallClockFallback')
  })

  it('re-estimates guided time from the exact review after set edits', () => {
    // Why: the review is a real editor. Removing a movement or changing a
    // timed prescription must update the time users see before they press Start.
    const withoutBike = WORKOUT_DATA.slice(0, 1)
    const longerBike = structuredClone(WORKOUT_DATA)
    const duration = longerBike[1].exerciseData?.[0].setMeasurements?.find(
      (measurement) => measurement.measurementCode === 'DURATION',
    )
    if (duration) duration.measurementPlaceholder = 600

    expect(estimateOptimStartedGuidedMinutes(withoutBike)).toBe(2.2)
    expect(estimateOptimStartedGuidedMinutes(WORKOUT_DATA)).toBe(9.7)
    expect(estimateOptimStartedGuidedMinutes(longerBike)).toBe(13.7)
  })
})

describe('Optim outcome attribution store', () => {
  it('keeps legacy records readable when optional calibration fields are absent', async () => {
    // Why: outcome history predates the guided clock and must remain usable
    // without a storage migration or fabricated backfill.
    await recordOptimPlanStarted('user-a', 'legacy-v1', PLAN, STARTED_SHAPE)
    await attachOptimOutcome('user-a', 'legacy-v1', OUTCOME)
    const payload = JSON.parse(asyncStorage.get(USER_A_KEY) ?? '')
    payload.records[0].plan.estimatorVersion = 1
    delete payload.records[0].plan.guidedProjectedMinutes
    delete payload.records[0].startedShape.guidedProjectedMinutes
    delete payload.records[0].outcome.autoCompletedSetCount
    delete payload.records[0].outcome.removedEmptySetCount
    asyncStorage.set(USER_A_KEY, JSON.stringify(payload))

    const [record] = await readOptimPlanRecords('user-a')
    expect(record?.plan.estimatorVersion).toBe(1)
    expect(record?.plan).not.toHaveProperty('guidedProjectedMinutes')
    expect(record?.startedShape).not.toHaveProperty('guidedProjectedMinutes')
    expect(record?.outcome).not.toHaveProperty('autoCompletedSetCount')
    expect(record?.outcome).not.toHaveProperty('removedEmptySetCount')
  })

  it('ignores a finish whose workout id was never recorded by Forge', async () => {
    // Why: rejecting unknown ids is the core guard against learning from normal
    // templates, scratch logs, remote workouts, and other devices.
    expect(await attachOptimOutcome('user-a', 'not-forge', OUTCOME)).toBe(false)
    expect(await readOptimPlanRecords('user-a')).toEqual([])
  })

  it('serializes a start and immediate finish so the outcome cannot outrun its row', async () => {
    // Both calls intentionally begin without awaiting. AsyncStorage has no
    // transaction; without the store queue, finish can read before start writes.
    const start = recordOptimPlanStarted(
      'user-a',
      'forge-1',
      PLAN,
      STARTED_SHAPE,
      '2026-07-19T07:01:00.000Z',
    )
    const finish = attachOptimOutcome('user-a', 'forge-1', OUTCOME)
    await Promise.all([start, finish])

    const records = await readOptimPlanRecords('user-a')
    expect(records).toHaveLength(1)
    expect(records[0]?.outcome).toEqual(OUTCOME)
  })

  it('consumes zero, wall-clock-fallback, and implausibly long durations', async () => {
    // Why: no-timer finishes and runaway timers would poison a future
    // seconds-per-set model. Consuming the row prevents repeated attachment.
    for (const [workoutId, outcome] of [
      ['zero', { ...OUTCOME, durationSeconds: 0 }],
      ['too-short', { ...OUTCOME, durationSeconds: 59 }],
      ['fallback', { ...OUTCOME, durationSource: 'wallClockFallback' as const }],
      ['runaway', { ...OUTCOME, durationSeconds: 6 * 60 * 60 + 1 }],
    ] as const) {
      await recordOptimPlanStarted('user-a', workoutId, PLAN, STARTED_SHAPE)
      expect(await attachOptimOutcome('user-a', workoutId, outcome)).toBe(false)
    }
    expect(await readOptimPlanRecords('user-a')).toEqual([])
  })

  it('retains adjusted-time provenance but never relabels it as measured timer time', async () => {
    await recordOptimPlanStarted('user-a', 'adjusted', PLAN, STARTED_SHAPE)
    await attachOptimOutcome('user-a', 'adjusted', {
      ...OUTCOME,
      durationSource: 'adjustedTimes',
    })
    expect((await readOptimPlanRecords('user-a'))[0]?.outcome?.durationSource)
      .toBe('adjustedTimes')
  })

  it('upserts pending starts and keeps completed rows immutable', async () => {
    await recordOptimPlanStarted('user-a', 'same-id', PLAN, STARTED_SHAPE)
    await recordOptimPlanStarted(
      'user-a',
      'same-id',
      { ...PLAN, requestedMinutes: 60 },
      { ...STARTED_SHAPE, exerciseCount: 6 },
    )
    expect(await readOptimPlanRecords('user-a')).toEqual([
      expect.objectContaining({
        plan: expect.objectContaining({ requestedMinutes: 60 }),
        startedShape: expect.objectContaining({ exerciseCount: 6 }),
      }),
    ])

    await attachOptimOutcome('user-a', 'same-id', OUTCOME)
    await recordOptimPlanStarted(
      'user-a',
      'same-id',
      { ...PLAN, requestedMinutes: 90 },
      STARTED_SHAPE,
    )
    await attachOptimOutcome('user-a', 'same-id', {
      ...OUTCOME,
      durationSeconds: 5_000,
    })
    const completed = (await readOptimPlanRecords('user-a'))[0]
    expect(completed?.plan.requestedMinutes).toBe(60)
    expect(completed?.outcome?.durationSeconds).toBe(2_520)
  })

  it('caps pending rows so repeated replacement cannot grow storage forever', async () => {
    for (let index = 0; index < 9; index += 1) {
      await recordOptimPlanStarted(
        'user-a',
        `pending-${index}`,
        PLAN,
        STARTED_SHAPE,
        new Date(NOW.getTime() - (8 - index) * 1_000).toISOString(),
      )
    }
    const records = await readOptimPlanRecords('user-a')
    expect(records).toHaveLength(8)
    expect(records[0]?.workoutId).toBe('pending-8')
    expect(records.some((record) => record.workoutId === 'pending-0')).toBe(false)
  })

  it('expires abandoned pending rows and caps completed samples newest-first', async () => {
    await recordOptimPlanStarted(
      'user-a',
      'expired',
      PLAN,
      STARTED_SHAPE,
      '2026-06-01T00:00:00.000Z',
    )
    expect(await readOptimPlanRecords('user-a')).toEqual([])

    for (let index = 0; index < 41; index += 1) {
      const completedAt = new Date(NOW.getTime() - (40 - index) * 1_000).toISOString()
      await recordOptimPlanStarted(
        'user-a',
        `completed-${index}`,
        PLAN,
        STARTED_SHAPE,
        completedAt,
      )
      await attachOptimOutcome('user-a', `completed-${index}`, {
        ...OUTCOME,
        completedAt,
      })
    }
    const records = await readOptimPlanRecords('user-a')
    expect(records).toHaveLength(40)
    expect(records[0]?.workoutId).toBe('completed-40')
    expect(records.some((record) => record.workoutId === 'completed-0')).toBe(false)
  })

  it('normalizes corrupt payloads and persists an explicit privacy whitelist', async () => {
    asyncStorage.set(USER_A_KEY, '{bad json')
    await expect(readOptimPlanRecords('user-a')).resolves.toEqual([])
    expect(asyncStorage.has(USER_A_KEY)).toBe(false)

    asyncStorage.set(USER_A_KEY, JSON.stringify({ version: 999, records: [PLAN] }))
    await expect(readOptimPlanRecords('user-a')).resolves.toEqual([])
    expect(asyncStorage.has(USER_A_KEY)).toBe(false)

    await recordOptimPlanStarted('user-a', 'forge-private', PLAN, STARTED_SHAPE)
    await attachOptimOutcome('user-a', 'forge-private', OUTCOME)
    const serialized = asyncStorage.get(USER_A_KEY) ?? ''
    const payload = JSON.parse(serialized)
    expect(Object.keys(payload)).toEqual(['version', 'records'])
    expect(Object.keys(payload.records[0]).sort()).toEqual([
      'outcome',
      'plan',
      'startedAt',
      'startedShape',
      'workoutId',
    ])
    expect(serialized).not.toContain('exerciseCode')
    expect(serialized).not.toContain('BENCH_PRESS')
    expect(serialized).not.toContain('measurement')
    expect(serialized).not.toContain('injury')
    expect(serialized).not.toContain('weight')
  })

  it('isolates accounts, clears only the requested key, and swallows storage failures', async () => {
    await recordOptimPlanStarted('user-a', 'a', PLAN, STARTED_SHAPE)
    await recordOptimPlanStarted('user-b', 'b', PLAN, STARTED_SHAPE)
    expect((await readOptimPlanRecords('user-a')).map((record) => record.workoutId))
      .toEqual(['a'])
    expect((await readOptimPlanRecords('user-b')).map((record) => record.workoutId))
      .toEqual(['b'])

    await clearOptimPlanRecords('user-a')
    expect(await readOptimPlanRecords('user-a')).toEqual([])
    expect(await readOptimPlanRecords('user-b')).toHaveLength(1)

    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('disk unavailable'))
    await expect(readOptimPlanRecords('user-b')).resolves.toEqual([])
  })
})
