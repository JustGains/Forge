import { describe, expect, it } from 'vitest'

import { isOptimHomeEquipmentCode } from './optimEquipmentPresets'

describe('Optim home equipment preset', () => {
  it('includes common compact home gear users reasonably expect', () => {
    // Why: "Home gym" promises more than a substring match for BENCH and MAT.
    for (const code of [
      'DUMBBELLS', 'RESISTANCE_BANDS', 'EXERCISE_BENCH', 'CHAIR', 'TOWEL',
      'DIP_BARS', 'PUSH_UP_BARS', 'AB_ROLLER', 'WEIGHTED_VEST', 'GYMNASTIC_RINGS',
    ]) {
      expect(isOptimHomeEquipmentCode(code), code).toBe(true)
    }
  })

  it('does not smuggle specialized commercial benches into the preset', () => {
    // Why: a user who selected dumbbells, bands, and a bench cannot execute
    // preacher-curl or hyperextension-machine work merely because it says BENCH.
    for (const code of [
      'PREACHER_CURL_BENCH', 'HYPEREXTENSION_BENCH',
      'INCLINE_HYPEREXTENSION_BENCH', 'DECLINE_SITUP_BENCH',
    ]) {
      expect(isOptimHomeEquipmentCode(code), code).toBe(false)
    }
  })
})
