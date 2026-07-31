import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'

export type OptimExercisePrescriptionMetadata = {
  maxReps: number
  confidence: 'high'
  provenance: {
    rule:
      | 'loaded_trunk_flexion_bodyweight_floor'
      | 'complex_conditioning_cadence_floor'
      | 'opaque_olympic_complex_technical_ceiling'
    sourceName: string
    requiredTags: string[]
    requiredMeasurements: string[]
  }
}

const RECORDS: Record<string, OptimExercisePrescriptionMetadata> = {
  'WEIGHTED.DECLINE.SIT.UP': {
    maxReps: 20,
    confidence: 'high',
    provenance: {
      rule: 'loaded_trunk_flexion_bodyweight_floor',
      sourceName: 'Decline Weighted Sit-Up',
      requiredTags: ['ABS_CORE', 'ENDURANCE'],
      requiredMeasurements: ['REPS', 'WEIGHT'],
    },
  },
  'DUMBBELL.DECLINE.SIT.UP': {
    maxReps: 20,
    confidence: 'high',
    provenance: {
      rule: 'loaded_trunk_flexion_bodyweight_floor',
      sourceName: 'Dumbbell Decline Sit-Up',
      requiredTags: ['ABS_CORE', 'ENDURANCE'],
      requiredMeasurements: ['REPS', 'WEIGHT'],
    },
  },
  'DUMBBELL.DEVILS.PRESS': {
    maxReps: 20,
    confidence: 'high',
    provenance: {
      rule: 'complex_conditioning_cadence_floor',
      sourceName: 'Dumbbell Devil Press',
      requiredTags: ['ENDURANCE', 'PLYOMETRIC'],
      requiredMeasurements: ['REPS', 'WEIGHT'],
    },
  },
  'CLUSTER': {
    maxReps: 5,
    confidence: 'high',
    provenance: {
      rule: 'opaque_olympic_complex_technical_ceiling',
      sourceName: 'Cluster',
      requiredTags: ['OLYMPIC_LIFTING', 'POWERLIFTING', 'PLATE_LOADED', 'COMPOUND'],
      requiredMeasurements: ['REPS', 'WEIGHT'],
    },
  },
}

const normalized = (values: string[] | null | undefined) =>
  new Set((values ?? []).map((value) => value.trim().toUpperCase()))

export const OPTIM_PRESCRIPTION_METADATA_STATS = {
  schemaVersion: 1,
  recordCount: Object.keys(RECORDS).length,
}

export function getOptimExercisePrescriptionMetadata(
  exercise: Pick<ExerciseListItem, 'exerciseCode' | 'exerciseTags' | 'exerciseMeasurements'>,
): OptimExercisePrescriptionMetadata | null {
  const code = exercise.exerciseCode?.trim().toUpperCase()
  const metadata = code ? RECORDS[code] : null
  if (!metadata) return null
  const tags = normalized(exercise.exerciseTags)
  const measurements = normalized(exercise.exerciseMeasurements)
  if (
    !metadata.provenance.requiredTags.every((tag) => tags.has(tag)) ||
    !metadata.provenance.requiredMeasurements.every((measurement) => measurements.has(measurement)) ||
    tags.has('BODYWEIGHT_ONLY')
  ) return null
  return metadata
}
