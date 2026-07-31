import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'

import generatedMetadata from './optimExerciseMetadata.generated.json'

export type OptimExerciseMetadata = {
  externalResourceId?: number
  level?: number
  tier?: number
  bodyTier?: number
  powerTier?: number
  olympicTier?: number
  rating?: number
  toneRating?: number
  olympicRating?: number
  coefficient?: number
  repsScale?: number | null
  relativeWeight?: number | null
  mobilityType?: string
  isAssisted?: boolean
  isBodyweight?: boolean
  isCardio?: boolean
  isDistance?: boolean
  isTimed?: boolean
  isUnilateral?: boolean
}

type OptimMetadataDataset = {
  schemaVersion: number
  sourceExerciseCount: number
  mappingCount: number
  mappedSourceCount: number
  ambiguousCodeCount: number
  reviewedRedirectCount: number
  deferredRedirectCount: number
  exercises: Record<string, OptimExerciseMetadata>
}

const dataset = generatedMetadata as unknown as OptimMetadataDataset

export const OPTIM_METADATA_STATS = {
  schemaVersion: dataset.schemaVersion,
  sourceExerciseCount: dataset.sourceExerciseCount,
  mappingCount: dataset.mappingCount,
  mappedSourceCount: dataset.mappedSourceCount,
  recordCount: Object.keys(dataset.exercises).length,
  ambiguousCodeCount: dataset.ambiguousCodeCount,
  reviewedRedirectCount: dataset.reviewedRedirectCount,
  deferredRedirectCount: dataset.deferredRedirectCount,
}

export function getOptimExerciseMetadata(
  exercise: Pick<ExerciseListItem, 'exerciseCode' | 'exerciseName'>,
): OptimExerciseMetadata | null {
  const code = exercise.exerciseCode?.trim().toUpperCase()
  return code ? dataset.exercises[code] ?? null : null
}
