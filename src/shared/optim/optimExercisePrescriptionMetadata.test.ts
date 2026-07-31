import { describe, expect, it } from 'vitest'

import {
  getOptimExercisePrescriptionMetadata,
  OPTIM_PRESCRIPTION_METADATA_STATS,
} from './optimExercisePrescriptionMetadata'

describe('Optim exercise prescription metadata', () => {
  it('caps only identity-guarded loaded trunk flexion and complex technical work', () => {
    // Why: loaded trunk flexion cannot be easier than its bodyweight sibling,
    // and a multi-phase devil press cannot use an isolation-movement cadence.
    expect(OPTIM_PRESCRIPTION_METADATA_STATS.recordCount).toBe(4)
    expect(getOptimExercisePrescriptionMetadata({
      exerciseCode: 'DUMBBELL.DECLINE.SIT.UP',
      exerciseTags: ['ABS_CORE', 'ENDURANCE'],
      exerciseMeasurements: ['REPS', 'WEIGHT'],
    })?.maxReps).toBe(20)
    expect(getOptimExercisePrescriptionMetadata({
      exerciseCode: 'DUMBBELL.DECLINE.SIT.UP',
      exerciseTags: ['ABS_CORE', 'BODYWEIGHT_ONLY'],
      exerciseMeasurements: ['REPS', 'WEIGHT'],
    })).toBeNull()
    expect(getOptimExercisePrescriptionMetadata({
      exerciseCode: 'LATERAL.RAISE',
      exerciseTags: ['ENDURANCE'],
      exerciseMeasurements: ['REPS', 'WEIGHT'],
    })).toBeNull()
    expect(getOptimExercisePrescriptionMetadata({
      exerciseCode: 'DUMBBELL.DEVILS.PRESS',
      exerciseTags: ['ENDURANCE', 'PLYOMETRIC'],
      exerciseMeasurements: ['REPS', 'WEIGHT'],
    })?.maxReps).toBe(20)
    expect(getOptimExercisePrescriptionMetadata({
      exerciseCode: 'CLUSTER',
      exerciseTags: ['OLYMPIC_LIFTING', 'POWERLIFTING', 'PLATE_LOADED', 'COMPOUND'],
      exerciseMeasurements: ['REPS', 'WEIGHT'],
    })?.maxReps).toBe(5)
    expect(getOptimExercisePrescriptionMetadata({
      exerciseCode: 'CLUSTER',
      exerciseTags: ['OLYMPIC_LIFTING', 'COMPOUND'],
      exerciseMeasurements: ['REPS', 'WEIGHT'],
    })).toBeNull()
  })
})
