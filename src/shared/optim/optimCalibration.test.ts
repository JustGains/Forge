import { describe, expect, it } from 'vitest'

import {
  deriveOptimCalibration,
} from './optimCalibration'
import {
  OPTIM_ESTIMATOR_VERSION,
  type OptimPlanRecord,
} from './optimOutcomeStore'

const record = (
  workoutId: string,
  overrides: {
    guidedMinutes?: number
    requestedMinutes?: number
    estimatorVersion?: number
    unilateralRepCount?: number
    durationSeconds?: number
    durationSource?: 'timer' | 'adjustedTimes' | 'wallClockFallback'
    autoPaused?: boolean
    manualPaused?: boolean
    pauseAttributionComplete?: boolean
    autoCompletedSetCount?: number
    removedEmptySetCount?: number
    finalExerciseCount?: number
    finalSetCount?: number
    contentEdited?: boolean
    completed?: boolean
  } = {},
): OptimPlanRecord => ({
  workoutId,
  startedAt: '2026-07-19T08:00:00.000Z',
  plan: {
    estimatorVersion: overrides.estimatorVersion ?? OPTIM_ESTIMATOR_VERSION,
    seed: 1,
    generatedAt: '2026-07-19T07:59:00.000Z',
    requestedMinutes: overrides.requestedMinutes ?? 60,
    rawProjectedMinutes: 50,
    sessionProjectedMinutes: 55,
    guidedProjectedMinutes: overrides.guidedMinutes ?? 60,
    strengthBudgetMinutes: 46,
    grouping: 'straight',
    goal: 'general',
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
    generatedRepCount: 100,
    generatedUnilateralRepCount: overrides.unilateralRepCount ?? 0,
    contentEdited: overrides.contentEdited ?? false,
    titleEdited: false,
  },
  startedShape: {
    exerciseCount: 5,
    plannedSetCount: 15,
    repWorkingSetCount: 12,
    warmupSetCount: 3,
    timedSetCount: 0,
    plannedTimedSeconds: 0,
    plannedRestSeconds: 900,
    plannedRepCount: 100,
    plannedRepWorkingCount: 80,
    guidedProjectedMinutes: overrides.guidedMinutes,
  },
  ...(overrides.completed === false ? {} : {
    outcome: {
      completedAt: '2026-07-19T09:00:00.000Z',
      durationSeconds: overrides.durationSeconds ?? 3_600,
      durationSource: overrides.durationSource ?? 'timer',
      autoPaused: overrides.autoPaused ?? false,
      manualPaused: overrides.manualPaused ?? false,
      pauseAttributionComplete: overrides.pauseAttributionComplete ?? true,
      finalExerciseCount: overrides.finalExerciseCount ?? 5,
      finalSetCount: overrides.finalSetCount ?? 15,
      completedSetCount: 15,
      completedRepWorkingSetCount: 12,
      completedWarmupSetCount: 3,
      loggedTimedSeconds: 0,
      completedRepCount: 100,
      completedRepWorkingCount: 80,
      autoCompletedSetCount: overrides.autoCompletedSetCount,
      removedEmptySetCount: overrides.removedEmptySetCount,
    },
  }),
})

describe('Optim calibration aggregates', () => {
  it('separates plan underfill from clean active-time pace without identities', () => {
    const summary = deriveOptimCalibration([
      record('normal', {
        guidedMinutes: 60,
        durationSeconds: 3_600,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
      record('fast', {
        guidedMinutes: 60,
        durationSeconds: 2_880,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
      record('underfilled', {
        guidedMinutes: 45,
        requestedMinutes: 60,
        durationSeconds: 2_700,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
      record('pending', { guidedMinutes: 40, completed: false }),
    ])

    expect(summary).toMatchObject({
      estimatorVersion: OPTIM_ESTIMATOR_VERSION,
      startedCount: 4,
      completedCount: 3,
      planFitSampleCount: 4,
      underfilledStartedCount: 2,
      cleanActiveTimeSampleCount: 3,
      medianActiveTimeRatio: 1,
      activeTimeRatioIqr: 0.1,
      paceCohorts: {
        noUnilateralReps: {
          sampleCount: 3,
          medianActiveTimeRatio: 1,
        },
        underTwentyPercentUnilateral: {
          sampleCount: 0,
          medianActiveTimeRatio: null,
        },
        atLeastTwentyPercentUnilateral: {
          sampleCount: 0,
          medianActiveTimeRatio: null,
        },
      },
    })
  })

  it('isolates estimator versions and reports privacy-safe unilateral pace cohorts', () => {
    // Why: a future guided clock may price per-side work differently. Mixing
    // versions or exercise identities into one pace median would teach Optim
    // from incompatible semantics and leak more detail than calibration needs.
    const summary = deriveOptimCalibration([
      record('none', {
        durationSeconds: 3_600,
        unilateralRepCount: 0,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
      record('light', {
        durationSeconds: 3_300,
        unilateralRepCount: 10,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
      record('heavy', {
        durationSeconds: 3_900,
        unilateralRepCount: 30,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
      record('old-estimator', {
        estimatorVersion: Math.max(1, OPTIM_ESTIMATOR_VERSION - 1),
        durationSeconds: 7_200,
        unilateralRepCount: 50,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
    ])

    expect(summary.cleanActiveTimeSampleCount).toBe(3)
    expect(summary.medianActiveTimeRatio).toBe(1)
    expect(summary.paceCohorts).toEqual({
      noUnilateralReps: {
        sampleCount: 1,
        medianActiveTimeRatio: 1,
      },
      underTwentyPercentUnilateral: {
        sampleCount: 1,
        medianActiveTimeRatio: 0.917,
      },
      atLeastTwentyPercentUnilateral: {
        sampleCount: 1,
        medianActiveTimeRatio: 1.083,
      },
    })
    expect(summary.excluded.estimatorVersionMismatch).toBe(1)
    expect(summary.planFitSampleCount).toBe(3)
  })

  it('excludes biased finish shapes in a deterministic priority order', () => {
    const summary = deriveOptimCalibration([
      record('adjusted', {
        durationSource: 'adjustedTimes',
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
      record('auto-paused', {
        autoPaused: true,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
      record('pause-attribution-unavailable', {
        pauseAttributionComplete: false,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
      record('manually-paused', {
        manualPaused: true,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
      record('legacy'),
      record('normalized', {
        autoCompletedSetCount: 1,
        removedEmptySetCount: 0,
      }),
      record('changed', {
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
        finalSetCount: 14,
      }),
      record('edited-missing-estimate', {
        contentEdited: true,
        autoCompletedSetCount: 0,
        removedEmptySetCount: 0,
      }),
    ])

    expect(summary.cleanActiveTimeSampleCount).toBe(0)
    expect(summary.excluded).toEqual({
      timingUnavailable: 2,
      pauseAttributionUnavailable: 1,
      manualPauseObserved: 1,
      estimatorVersionMismatch: 0,
      legacyAttribution: 1,
      normalizedAtFinish: 1,
      shapeChanged: 1,
      missingStartedEstimate: 1,
    })
  })
})
