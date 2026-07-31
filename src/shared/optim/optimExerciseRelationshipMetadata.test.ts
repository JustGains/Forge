import { describe, expect, it } from 'vitest'

import {
  getOptimExerciseRelationshipMetadata,
  getOptimExerciseProductAwareRelationshipMetadata,
  OPTIM_RELATIONSHIP_METADATA_STATS,
  OPTIM_PRODUCT_RELATIONSHIP_METADATA_STATS,
} from './optimExerciseRelationshipMetadata'

describe('Optim exercise relationship metadata overlay', () => {
  it('keeps only complete relationships shared by every live collapsed source row', () => {
    expect(OPTIM_RELATIONSHIP_METADATA_STATS).toEqual({
      schemaVersion: 1,
      sourceExerciseCount: 1406,
      sourceReferenceCount: 350,
      mappingCount: 1103,
      ambiguousMappingIdCount: 0,
      mappedLiveSourceCount: 742,
      mappedLiveCodeCount: 644,
      eligibleRelationshipRowCount: 258,
      relationshipRecordCount: 203,
      reviewCodeCount: 34,
      noRelationshipCodeCount: 407,
    })
    expect(getOptimExerciseRelationshipMetadata({ exerciseCode: 'DUMBBELL.BENT.OVER.ROW' }))
      .toBeNull()
    expect(getOptimExerciseRelationshipMetadata({ exerciseCode: 'BARBELL.POWER.CLEAN' }))
      .toBeNull()
  })

  it('resolves reference row ids before mapping both exercises to canonical codes', () => {
    expect(getOptimExerciseRelationshipMetadata({ exerciseCode: '  barbell.romanian.deadlift  ' }))
      .toEqual({
        referenceExerciseCode: 'BARBELL.DEADLIFT',
        relativeWeight: 0.837877465,
      })
    expect(getOptimExerciseRelationshipMetadata({ exerciseCode: 'DUMBBELL.KICKBACK' }))
      .toEqual({
        referenceExerciseCode: 'BARBELL.WIDE.BENCH.PRESS',
        relativeWeight: 0.14369977,
      })
  })

  it('leaves custom and unmapped exercises without an invented relationship', () => {
    expect(getOptimExerciseRelationshipMetadata({
      exerciseCode: 'CUSTOM_PRESS',
      exerciseName: 'My Custom Press',
    })).toBeNull()
  })

  it('keeps the exact renamed lateral-raise relationship product-only', () => {
    // Why: the live LATERAL.RAISE row is the renamed catalog identity, but
    // direct debug callers must retain the legacy generated dataset byte-for-byte.
    expect(OPTIM_PRODUCT_RELATIONSHIP_METADATA_STATS).toEqual({
      schemaVersion: 1,
      productOnly: true,
      legacyRelationshipDatasetUnchanged: true,
      reviewedRedirectCount: 1,
      relationshipRecordCount: 1,
    })
    expect(getOptimExerciseRelationshipMetadata({ exerciseCode: 'LATERAL.RAISE' }))
      .toBeNull()
    expect(getOptimExerciseProductAwareRelationshipMetadata({ exerciseCode: 'LATERAL.RAISE' }))
      .toEqual({
        referenceExerciseCode: 'BARBELL.BENCH.PRESS',
        relativeWeight: 0.134558991,
      })
  })
})
