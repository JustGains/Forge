import { describe, expect, it } from 'vitest'

import generatedMetadata from './optimExerciseBodyweightMetadata.generated.json'
import {
  getOptimExerciseBodyweightMetadata,
  OPTIM_BODYWEIGHT_METADATA_STATS,
} from './optimExerciseBodyweightMetadata'

describe('Optim bodyweight metadata overlay', () => {
  it('accounts for every catalog bodyweight measurement without inventing ambiguous factors', () => {
    const stats = OPTIM_BODYWEIGHT_METADATA_STATS
    expect(stats.recordCount + stats.reviewCodeCount + stats.uncoveredCodeCount)
      .toBe(stats.bodyweightMeasurementCodeCount)
    expect(stats.schemaVersion).toBe(1)
    expect(stats.sourceExerciseCount).toBe(6282)
    expect(stats.bodyweightMeasurementCodeCount).toBe(124)
  })

  it('keeps fully suspended added and assisted movements in whole-body load space', () => {
    expect(getOptimExerciseBodyweightMetadata({ exerciseCode: ' weighted.pull.up ' }))
      .toMatchObject({ loadMode: 'added', bodyweightContribution: 1, confidence: 'high' })
    expect(getOptimExerciseBodyweightMetadata({ exerciseCode: 'ASSISTED.PULL.UP' }))
      .toMatchObject({ loadMode: 'assisted', bodyweightContribution: 1, confidence: 'high' })
  })

  it('leaves supported and custom exercises unresolved', () => {
    expect(getOptimExerciseBodyweightMetadata({ exerciseCode: 'SEATED.PULL-UP' })).toBeNull()
    expect(getOptimExerciseBodyweightMetadata({ exerciseCode: 'CUSTOM_WEIGHTED_MOVE' })).toBeNull()
  })

  it('keeps every emitted contribution finite and mechanically bounded', () => {
    const records = generatedMetadata.records as Record<string, { bodyweightContribution: number }>
    expect(Object.values(records).every(({ bodyweightContribution }) =>
      Number.isFinite(bodyweightContribution) && bodyweightContribution > 0 && bodyweightContribution <= 1.5)).toBe(true)
  })
})
