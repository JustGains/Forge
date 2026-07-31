import { describe, expect, it } from 'vitest'

import generatedMetadata from './optimExerciseLoadModeMetadata.generated.json'
import {
  getOptimExerciseLoadModeMetadata,
  OPTIM_LOAD_MODE_METADATA_STATS,
} from './optimExerciseLoadModeMetadata'

describe('Optim load-mode metadata overlay', () => {
  it('accounts for every barbell-classified WEIGHT row without guessing ambiguous mechanics', () => {
    const stats = OPTIM_LOAD_MODE_METADATA_STATS
    expect(stats.recordCount + stats.reviewCandidateCount).toBe(stats.auditedCandidateCount)
    expect(stats.schemaVersion).toBe(1)
    expect(stats.sourceExerciseCount).toBe(6282)
    expect(stats.auditedCandidateCount).toBe(69)
    expect(stats.recordCount).toBe(55)
    expect(stats.reviewCandidateCount).toBe(14)
  })

  it('only narrows stale barbell classifications to safer existing modes', () => {
    const records = generatedMetadata.records as Record<string, {
      mode: string
      confidence: string
      provenance: { sharedMode: string }
    }>
    expect(Object.values(records).every(record =>
      (record.mode === 'single' || record.mode === 'none')
      && record.confidence === 'high'
      && record.provenance.sharedMode === 'barbell')).toBe(true)
  })

  it('covers proven held-plate, sled, cable-stack, and fixed-implement mechanics', () => {
    expect(getOptimExerciseLoadModeMetadata({ exerciseCode: ' weighted.decline.sit.up ' }))
      .toMatchObject({ mode: 'single', provenance: { rule: 'loose_plates_no_two_sided_bar' } })
    expect(getOptimExerciseLoadModeMetadata({ exerciseCode: 'POWER.SLED.PUSH' }))
      .toMatchObject({ mode: 'single', provenance: { rule: 'power_sled' } })
    expect(getOptimExerciseLoadModeMetadata({ exerciseCode: 'CABLE-ROPE-BICEP-CURL' }))
      .toMatchObject({ mode: 'none', provenance: { rule: 'selectorized_cable' } })
    expect(getOptimExerciseLoadModeMetadata({ exerciseCode: 'WEIGHTED-BAG-GOOD-MORNING' }))
      .toMatchObject({ mode: 'none', provenance: { rule: 'fixed_implement' } })
  })

  it('leaves ambiguous machines, magnetic resistance, and unknown exercises unresolved', () => {
    expect(getOptimExerciseLoadModeMetadata({ exerciseCode: 'LEVER.BELT.SQUAT' })).toBeNull()
    expect(getOptimExerciseLoadModeMetadata({ exerciseCode: 'TORQUE-TANK-PUSH' })).toBeNull()
    expect(getOptimExerciseLoadModeMetadata({ exerciseCode: 'CUSTOM_WEIGHTED_MOVE' })).toBeNull()
  })
})
