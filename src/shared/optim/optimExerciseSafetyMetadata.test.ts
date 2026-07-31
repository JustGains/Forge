import { describe, expect, it } from 'vitest'

import {
  getOptimExerciseSafetyMetadata,
  getOptimExerciseSafetyReviewCandidate,
  OPTIM_SAFETY_METADATA_STATS,
} from './optimExerciseSafetyMetadata'

describe('Optim exercise safety metadata overlay', () => {
  it('keeps high-confidence difficulty overrides separate and reproducible', () => {
    expect(OPTIM_SAFETY_METADATA_STATS).toEqual({
      schemaVersion: 1,
      sourceExerciseCount: 6282,
      appliedRuleCount: 10,
      reviewRuleCount: 1,
      appliedCount: 83,
      reviewCandidateCount: 7,
    })
    expect(getOptimExerciseSafetyMetadata({ exerciseCode: '  handstand.hold.on.wall  ' }))
      .toEqual(expect.objectContaining({ level: 1, rule: 'handstand_foundation' }))
    expect(getOptimExerciseSafetyMetadata({ exerciseCode: 'HANDSTAND.PUSH-UP' }))
      .toEqual(expect.objectContaining({ level: 2, rule: 'handstand_advanced' }))
    expect(getOptimExerciseSafetyMetadata({ exerciseCode: 'POWER.CLEAN' }))
      .toEqual(expect.objectContaining({ level: 1, rule: 'olympic_lifting_minimum' }))
  })

  it('does not turn ambiguous names into applied safety metadata', () => {
    expect(getOptimExerciseSafetyMetadata({ exerciseCode: 'IRON.CROSS.STRETCH' })).toBeNull()
    expect(getOptimExerciseSafetyMetadata({ exerciseCode: 'ASSISTED.INVERSE.LEG.CURL' })).toBeNull()
    expect(getOptimExerciseSafetyReviewCandidate({ exerciseCode: 'ASSISTED.INVERSE.LEG.CURL' }))
      .toEqual(expect.objectContaining({ rule: 'nordic_assisted_review' }))
  })
})
