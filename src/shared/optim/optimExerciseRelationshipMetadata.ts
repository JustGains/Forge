import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'

import generatedMetadata from './optimExerciseRelationshipMetadata.generated.json'
import generatedProductMetadata from './optimExerciseProductRelationshipMetadata.generated.json'

export type OptimExerciseRelationshipMetadata = {
  referenceExerciseCode: string
  relativeWeight: number
}

type OptimRelationshipDataset = {
  schemaVersion: number
  sourceExerciseCount: number
  sourceReferenceCount: number
  mappingCount: number
  ambiguousMappingIdCount: number
  mappedLiveSourceCount: number
  mappedLiveCodeCount: number
  eligibleRelationshipRowCount: number
  relationshipRecordCount: number
  reviewCodeCount: number
  noRelationshipCodeCount: number
  relationships: Record<string, OptimExerciseRelationshipMetadata>
}

type OptimProductRelationshipDataset = {
  schemaVersion: number
  productOnly: true
  legacyRelationshipDatasetUnchanged: true
  reviewedRedirectCount: number
  relationshipRecordCount: number
  relationships: Record<string, OptimExerciseRelationshipMetadata>
}

const dataset = generatedMetadata as unknown as OptimRelationshipDataset
const productDataset = generatedProductMetadata as unknown as OptimProductRelationshipDataset

export const OPTIM_RELATIONSHIP_METADATA_STATS = {
  schemaVersion: dataset.schemaVersion,
  sourceExerciseCount: dataset.sourceExerciseCount,
  sourceReferenceCount: dataset.sourceReferenceCount,
  mappingCount: dataset.mappingCount,
  ambiguousMappingIdCount: dataset.ambiguousMappingIdCount,
  mappedLiveSourceCount: dataset.mappedLiveSourceCount,
  mappedLiveCodeCount: dataset.mappedLiveCodeCount,
  eligibleRelationshipRowCount: dataset.eligibleRelationshipRowCount,
  relationshipRecordCount: dataset.relationshipRecordCount,
  reviewCodeCount: dataset.reviewCodeCount,
  noRelationshipCodeCount: dataset.noRelationshipCodeCount,
}

export const OPTIM_PRODUCT_RELATIONSHIP_METADATA_STATS = {
  schemaVersion: productDataset.schemaVersion,
  productOnly: productDataset.productOnly,
  legacyRelationshipDatasetUnchanged: productDataset.legacyRelationshipDatasetUnchanged,
  reviewedRedirectCount: productDataset.reviewedRedirectCount,
  relationshipRecordCount: productDataset.relationshipRecordCount,
}

export function getOptimExerciseRelationshipMetadata(
  exercise: Pick<ExerciseListItem, 'exerciseCode' | 'exerciseName'>,
): OptimExerciseRelationshipMetadata | null {
  const code = exercise.exerciseCode?.trim().toUpperCase()
  return code ? dataset.relationships[code] ?? null : null
}

export function getOptimExerciseProductAwareRelationshipMetadata(
  exercise: Pick<ExerciseListItem, 'exerciseCode' | 'exerciseName'>,
): OptimExerciseRelationshipMetadata | null {
  const code = exercise.exerciseCode?.trim().toUpperCase()
  return code
    ? productDataset.relationships[code] ?? dataset.relationships[code] ?? null
    : null
}
