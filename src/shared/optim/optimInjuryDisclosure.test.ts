import { describe, expect, it } from 'vitest'

import {
  buildOptimInjuryReviewDescription,
  OPTIM_INJURY_DISCLOSURE,
} from './optimInjuryDisclosure'

describe('Optim injury disclosure', () => {
  it('never promises injury-aware filtering that the engine does not perform', () => {
    // Why: false reassurance is more dangerous than an explicit manual-review
    // boundary when saved injury labels lack severity and movement tolerance.
    expect(OPTIM_INJURY_DISCLOSURE).toContain('does not automatically filter')
    expect(OPTIM_INJURY_DISCLOSURE).toContain('Swap or Adjust')
    expect(OPTIM_INJURY_DISCLOSURE).toContain('healthcare professional')
    expect(OPTIM_INJURY_DISCLOSURE).not.toMatch(/avoid aggravating|safer alternatives/i)
  })

  it('puts normalized saved labels in the manual-review message', () => {
    expect(buildOptimInjuryReviewDescription([' ACL Tear ', 'Custom limitation', 'ACL Tear', '']))
      .toBe(
        `Saved injuries / limitations: ACL Tear, Custom limitation. ${OPTIM_INJURY_DISCLOSURE}`,
      )
  })
})
