import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'

import generatedMetadata from './optimExerciseLoadModeMetadata.generated.json'

export type OptimExerciseLoadModeMetadata = {
  mode: 'none' | 'single'
  confidence: 'high'
  provenance: {
    source: 'catalog_derived'
    rule: 'fixed_implement' | 'loose_plates_no_two_sided_bar' | 'power_sled' | 'selectorized_cable'
    catalogName: string
    sharedMode: 'barbell'
    equipment: string[]
    tags: string[]
  }
}

type OptimLoadModeDataset = {
  schemaVersion: number
  sourceExerciseCount: number
  auditedCandidateCount: number
  recordCount: number
  reviewCandidateCount: number
  records: Record<string, OptimExerciseLoadModeMetadata>
}

const dataset = generatedMetadata as unknown as OptimLoadModeDataset

export const OPTIM_LOAD_MODE_METADATA_STATS = {
  schemaVersion: dataset.schemaVersion,
  sourceExerciseCount: dataset.sourceExerciseCount,
  auditedCandidateCount: dataset.auditedCandidateCount,
  recordCount: dataset.recordCount,
  reviewCandidateCount: dataset.reviewCandidateCount,
}

export function getOptimExerciseLoadModeMetadata(
  exercise: Pick<ExerciseListItem, 'exerciseCode'>,
): OptimExerciseLoadModeMetadata | null {
  const code = exercise.exerciseCode?.trim().toUpperCase()
  return code ? dataset.records[code] ?? null : null
}
