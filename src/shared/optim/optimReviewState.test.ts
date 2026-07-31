import { describe, expect, it } from 'vitest'

import {
  resolveOptimReviewState,
  shouldConfirmOptimRegeneration,
  shouldReturnOptimReviewToSetup,
} from './optimReviewState'

const SETUP_KEY = '[45,"fresh","full",true,false,false,"straight"]'

describe('Optim generated review state', () => {
  it('keeps a pristine generated review reachable without arming the exit guard', () => {
    // Why: a suggestion Optim just generated is not a user-authored unsaved
    // change. Adjusting setup and returning must still reuse it, though.
    expect(resolveOptimReviewState({
      hasGeneratedReview: true,
      reviewDirty: false,
      exerciseCount: 4,
      generatedSetupKey: SETUP_KEY,
      currentSetupKey: SETUP_KEY,
      userEdited: false,
    })).toEqual({
      hasReview: true,
      shouldGuardNavigation: false,
      canReturnToReview: true,
      canKeepEditedReview: false,
    })
  })

  it('protects real edits and keeps them reachable after setup changes', () => {
    // Why: title, set, exercise, group, and reorder edits are the work the
    // discard guard and the secondary Keep my edits path exist to protect.
    expect(resolveOptimReviewState({
      hasGeneratedReview: true,
      reviewDirty: true,
      exerciseCount: 4,
      generatedSetupKey: SETUP_KEY,
      currentSetupKey: '[60,"fresh","full",true,false,false,"straight"]',
      userEdited: true,
    })).toEqual({
      hasReview: true,
      shouldGuardNavigation: true,
      canReturnToReview: false,
      canKeepEditedReview: true,
    })
  })

  it('treats a consumed or empty review as unavailable', () => {
    // Why: after Start commits the active workout, stale editor data must not
    // re-arm navigation or masquerade as a review the user can return to.
    expect(resolveOptimReviewState({
      hasGeneratedReview: false,
      reviewDirty: false,
      exerciseCount: 4,
      generatedSetupKey: SETUP_KEY,
      currentSetupKey: SETUP_KEY,
      userEdited: false,
    }).hasReview).toBe(false)
    expect(resolveOptimReviewState({
      hasGeneratedReview: true,
      reviewDirty: false,
      exerciseCount: 0,
      generatedSetupKey: SETUP_KEY,
      currentSetupKey: SETUP_KEY,
      userEdited: false,
    }).hasReview).toBe(false)
  })

  it('warns only when regeneration would discard workout content', () => {
    // Why: a custom title survives regeneration, so presenting it as lost set
    // or exercise work is a false destructive warning.
    expect(shouldConfirmOptimRegeneration(false, 4)).toBe(false)
    expect(shouldConfirmOptimRegeneration(true, 4)).toBe(true)
    expect(shouldConfirmOptimRegeneration(true, 0)).toBe(false)
  })

  it('turns the first review back action into Adjust without blocking Start replacement', () => {
    // Why: a shuffled review lives in route-local state. Back should reveal
    // setup first, while REPLACE/RESET actions must still leave after Start.
    expect(shouldReturnOptimReviewToSetup('review', 'GO_BACK')).toBe(true)
    expect(shouldReturnOptimReviewToSetup('review', 'POP')).toBe(true)
    expect(shouldReturnOptimReviewToSetup('review', 'REPLACE')).toBe(false)
    expect(shouldReturnOptimReviewToSetup('review', 'RESET')).toBe(false)
    expect(shouldReturnOptimReviewToSetup('setup', 'GO_BACK')).toBe(false)
  })
})
