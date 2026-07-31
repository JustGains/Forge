import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'

import generatedSafetyMetadata from './optimExerciseSafetyMetadata.generated.json'

export type OptimExerciseSafetyMetadata = {
  level: 1 | 2
  rule: string
  reason: string
  sourceName: string
}

type OptimSafetyMetadataDataset = {
  schemaVersion: number
  sourceExerciseCount: number
  appliedRuleCount: number
  reviewRuleCount: number
  applied: Record<string, OptimExerciseSafetyMetadata>
  reviewCandidates: Record<string, OptimExerciseSafetyMetadata>
}

const dataset = generatedSafetyMetadata as unknown as OptimSafetyMetadataDataset

export const OPTIM_SAFETY_METADATA_STATS = {
  schemaVersion: dataset.schemaVersion,
  sourceExerciseCount: dataset.sourceExerciseCount,
  appliedRuleCount: dataset.appliedRuleCount,
  reviewRuleCount: dataset.reviewRuleCount,
  appliedCount: Object.keys(dataset.applied).length,
  reviewCandidateCount: Object.keys(dataset.reviewCandidates).length,
}

function canonicalCode(exercise: Pick<ExerciseListItem, 'exerciseCode'>): string {
  return exercise.exerciseCode?.trim().toUpperCase() ?? ''
}

export function getOptimExerciseSafetyMetadata(
  exercise: Pick<ExerciseListItem, 'exerciseCode'>,
): OptimExerciseSafetyMetadata | null {
  const code = canonicalCode(exercise)
  return code ? dataset.applied[code] ?? null : null
}

export function getOptimExerciseSafetyReviewCandidate(
  exercise: Pick<ExerciseListItem, 'exerciseCode'>,
): OptimExerciseSafetyMetadata | null {
  const code = canonicalCode(exercise)
  return code ? dataset.reviewCandidates[code] ?? null : null
}
