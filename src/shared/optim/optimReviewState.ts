export type OptimReviewStateInput = {
  hasGeneratedReview: boolean
  reviewDirty: boolean
  exerciseCount: number
  generatedSetupKey: string | null
  currentSetupKey: string
  userEdited: boolean
}

export function resolveOptimReviewState(input: OptimReviewStateInput) {
  const hasReview = input.hasGeneratedReview && input.exerciseCount > 0
  const setupMatchesReview = input.generatedSetupKey === input.currentSetupKey
  return {
    hasReview,
    shouldGuardNavigation: input.reviewDirty,
    canReturnToReview: hasReview && setupMatchesReview,
    canKeepEditedReview: hasReview && !setupMatchesReview && input.userEdited,
  }
}

export function shouldConfirmOptimRegeneration(contentEdited: boolean, exerciseCount: number): boolean {
  return contentEdited && exerciseCount > 0
}

export function shouldReturnOptimReviewToSetup(
  phase: 'setup' | 'review',
  navigationActionType: string,
): boolean {
  return phase === 'review' && (
    navigationActionType === 'GO_BACK' || navigationActionType === 'POP'
  )
}
