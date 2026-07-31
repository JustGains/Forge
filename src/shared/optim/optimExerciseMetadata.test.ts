import { describe, expect, it } from 'vitest'

import {
  getOptimExerciseMetadata,
  OPTIM_METADATA_STATS,
} from './optimExerciseMetadata'
import generatedMetadata from './optimExerciseMetadata.generated.json'

describe('Optim exercise metadata overlay', () => {
  it('is generated from the complete recovered source without ambiguous-name guesses', () => {
    expect(OPTIM_METADATA_STATS).toEqual({
      schemaVersion: 3,
      sourceExerciseCount: 1103,
      mappingCount: 1103,
      mappedSourceCount: 798,
      recordCount: 671,
      ambiguousCodeCount: 99,
      reviewedRedirectCount: 1,
      deferredRedirectCount: 2,
    })
    expect(getOptimExerciseMetadata({ exerciseCode: 'HIP.THRUSTS' }))
      .toEqual(expect.objectContaining({ isBodyweight: true }))
    expect(getOptimExerciseMetadata({ exerciseCode: 'HIP.THRUSTS' })).not.toHaveProperty('tier')
  })

  it('applies only composition-safe canonical redirects and keeps incomplete families deferred', () => {
    expect(getOptimExerciseMetadata({ exerciseCode: 'BARBELL.BENCH.PRESS' })).toBeNull()
    expect(getOptimExerciseMetadata({ exerciseCode: 'BARBELL.SQUAT' })).toBeNull()
    expect(getOptimExerciseMetadata({ exerciseCode: 'LUNGE' }))
      .toEqual(getOptimExerciseMetadata({ exerciseCode: 'FORWARD.LUNGE' }))
    expect(getOptimExerciseMetadata({ exerciseCode: 'LUNGE' }))
      .toEqual(expect.objectContaining({ level: 0, bodyTier: 2, powerTier: 2, isBodyweight: true, isUnilateral: true }))

    expect(generatedMetadata.reviewedRedirects).toEqual([
      expect.objectContaining({ exerciseCode: 'LUNGE', externalResourceId: 234, sourceName: 'Lunge', mappingAssignedCode: 'FORWARD.LUNGE' }),
    ])
    expect(generatedMetadata.deferredRedirects).toEqual([
      expect.objectContaining({ exerciseCode: 'BARBELL.BENCH.PRESS', externalResourceId: 29, mappingAssignedCode: 'BARBELL.WIDE.BENCH.PRESS', deferredReason: expect.stringContaining('beginner composition') }),
      expect.objectContaining({ exerciseCode: 'BARBELL.SQUAT', externalResourceId: 26, mappingAssignedCode: 'BARBELL.HIGH.BAR.SQUAT', deferredReason: expect.stringContaining('beginner composition') }),
    ])
    expect(generatedMetadata.exercises['BARBELL.WIDE.BENCH.PRESS']).not.toHaveProperty('level')
    expect(generatedMetadata.exercises['BARBELL.WIDE.BENCH.PRESS']).not.toHaveProperty('rating')
  })

  it('normalizes canonical catalog codes and returns goal-specific recovered fields', () => {
    expect(getOptimExerciseMetadata({ exerciseCode: '  chin-up  ' }))
      .toEqual(expect.objectContaining({
        level: 1,
        tier: 1,
        bodyTier: 1,
        powerTier: 2,
        rating: 4,
        toneRating: 4,
        isBodyweight: true,
      }))
  })

  it('leaves custom exercises on the catalog-derived fallback path', () => {
    expect(getOptimExerciseMetadata({
      exerciseCode: 'CUSTOM_PRESS',
      exerciseName: 'My Custom Press',
    })).toBeNull()
  })
})
