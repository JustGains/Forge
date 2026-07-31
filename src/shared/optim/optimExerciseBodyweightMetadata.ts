import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'

import generatedMetadata from './optimExerciseBodyweightMetadata.generated.json'

export type OptimExerciseBodyweightMetadata = {
  loadMode: 'added' | 'assisted'
  bodyweightContribution: number
  confidence: 'high'
  provenance: {
    source: 'authored'
    rule: 'fully_suspended_whole_body'
    catalogName: string
    catalogExerciseType: string
  }
}

type OptimBodyweightDataset = {
  schemaVersion: number
  sourceExerciseCount: number
  bodyweightMeasurementCodeCount: number
  recordCount: number
  reviewCodeCount: number
  uncoveredCodeCount: number
  records: Record<string, OptimExerciseBodyweightMetadata>
}

const dataset = generatedMetadata as unknown as OptimBodyweightDataset

export const OPTIM_BODYWEIGHT_METADATA_STATS = {
  schemaVersion: dataset.schemaVersion,
  sourceExerciseCount: dataset.sourceExerciseCount,
  bodyweightMeasurementCodeCount: dataset.bodyweightMeasurementCodeCount,
  recordCount: dataset.recordCount,
  reviewCodeCount: dataset.reviewCodeCount,
  uncoveredCodeCount: dataset.uncoveredCodeCount,
}

export function getOptimExerciseBodyweightMetadata(
  exercise: Pick<ExerciseListItem, 'exerciseCode' | 'exerciseName'>,
): OptimExerciseBodyweightMetadata | null {
  const code = exercise.exerciseCode?.trim().toUpperCase()
  return code ? dataset.records[code] ?? null : null
}
