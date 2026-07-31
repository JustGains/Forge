import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'

import generatedProductMetadata from './optimExerciseProductWarmStartMetadata.generated.json'
import generatedMetadata from './optimExerciseWarmStartMetadata.generated.json'

type WarmStartGender = 'female' | 'male'
type WarmStartGoal = 'strength' | 'bodybuilding' | 'tone' | 'general' | 'powerlifting' | 'olympic'
type WarmStartExperience = 'beginner' | 'intermediate' | 'expert'

type WarmStartRecord = {
  sourceRowId: string
  sourceName: string
  medianPredictedMaxKg: number
  predictions: Record<string, number>
}

type WarmStartDataset = {
  schemaVersion: number
  ageBucketInterpretation: string
  ageBuckets: number[]
  sourceCsvRowCount: number
  sourceExerciseCount: number
  mappingCount: number
  mappedLiveCodeCount: number
  strictSourceCodeCount: number
  sourceExcludedModalityCodeCount: number
  canonicalExcludedModalityCodeCount: number
  compatibilityExclusionCount: number
  reviewedRedirectCount: number
  reviewedResolutionCount: number
  warmStartRecordCount: number
  predictionCellCount: number
  rejectedCellCount: number
  reviewCodeCount: number
  records: Record<string, WarmStartRecord>
}

type ProductWarmStartDataset = {
  schemaVersion: number
  productOnly: true
  legacyWarmStartDatasetUnchanged: true
  reviewedRedirectCount: number
  reviewedResolutionCount: number
  legacyExclusionCount: number
  warmStartRecordCount: number
  predictionCellCount: number
  records: Record<string, WarmStartRecord>
  legacyExclusions: Array<{ exerciseCode: string }>
}

export type OptimWarmStartProfile = {
  gender?: string | null
  goal: 'strength' | 'bodybuilding' | 'general' | 'muscleTone' | 'powerlifting' | 'olympic'
  experience: 'beginner' | 'intermediate' | 'advanced'
  ageYears?: number | null
}

export type OptimExerciseWarmStartPrediction = {
  predictedMaxKg: number
  gender: WarmStartGender
  goal: WarmStartGoal
  experience: WarmStartExperience
  ageBucket: number
  sourceRowId: string
  sourceName: string
  productOnly?: true
}

const dataset = generatedMetadata as unknown as WarmStartDataset
const productDataset = generatedProductMetadata as unknown as ProductWarmStartDataset
const productLegacyExclusionCodes = new Set(
  productDataset.legacyExclusions.map(exclusion => exclusion.exerciseCode.trim().toUpperCase()),
)

export const OPTIM_WARM_START_METADATA_STATS = {
  schemaVersion: dataset.schemaVersion,
  ageBucketInterpretation: dataset.ageBucketInterpretation,
  ageBuckets: dataset.ageBuckets,
  sourceCsvRowCount: dataset.sourceCsvRowCount,
  sourceExerciseCount: dataset.sourceExerciseCount,
  mappingCount: dataset.mappingCount,
  mappedLiveCodeCount: dataset.mappedLiveCodeCount,
  strictSourceCodeCount: dataset.strictSourceCodeCount,
  sourceExcludedModalityCodeCount: dataset.sourceExcludedModalityCodeCount,
  canonicalExcludedModalityCodeCount: dataset.canonicalExcludedModalityCodeCount,
  compatibilityExclusionCount: dataset.compatibilityExclusionCount,
  reviewedRedirectCount: dataset.reviewedRedirectCount,
  reviewedResolutionCount: dataset.reviewedResolutionCount,
  warmStartRecordCount: dataset.warmStartRecordCount,
  predictionCellCount: dataset.predictionCellCount,
  rejectedCellCount: dataset.rejectedCellCount,
  reviewCodeCount: dataset.reviewCodeCount,
}

export const OPTIM_PRODUCT_WARM_START_METADATA_STATS = {
  schemaVersion: productDataset.schemaVersion,
  productOnly: productDataset.productOnly,
  legacyWarmStartDatasetUnchanged: productDataset.legacyWarmStartDatasetUnchanged,
  reviewedRedirectCount: productDataset.reviewedRedirectCount,
  reviewedResolutionCount: productDataset.reviewedResolutionCount,
  legacyExclusionCount: productDataset.legacyExclusionCount,
  warmStartRecordCount: productDataset.warmStartRecordCount,
  predictionCellCount: productDataset.predictionCellCount,
}

function warmStartGender(value: string | null | undefined): WarmStartGender | null {
  const normalized = value?.trim().toUpperCase()
  if (normalized === 'FEMALE' || normalized === 'MTF') return 'female'
  if (normalized === 'MALE' || normalized === 'FTM') return 'male'
  return null
}

function warmStartAgeBucket(ageYears: number | null | undefined): number | null {
  if (ageYears == null || !Number.isFinite(ageYears)) return null
  const clamped = Math.min(60, Math.max(20, ageYears))
  return 20 + Math.round((clamped - 20) / 10) * 10
}

function getWarmStartPrediction(
  records: Record<string, WarmStartRecord>,
  exercise: Pick<ExerciseListItem, 'exerciseCode'>,
  profile: OptimWarmStartProfile,
): OptimExerciseWarmStartPrediction | null {
  const code = exercise.exerciseCode?.trim().toUpperCase()
  const record = code ? records[code] : null
  const gender = warmStartGender(profile.gender)
  const ageBucket = warmStartAgeBucket(profile.ageYears)
  if (!record || !gender || ageBucket == null) return null
  const goal: WarmStartGoal = profile.goal === 'muscleTone' ? 'tone' : profile.goal
  const experience: WarmStartExperience = profile.experience === 'advanced' ? 'expert' : profile.experience
  const predictedMaxKg = record.predictions[`${gender}.${goal}.${experience}.${ageBucket}`]
  if (predictedMaxKg == null) return null
  return {
    predictedMaxKg,
    gender,
    goal,
    experience,
    ageBucket,
    sourceRowId: record.sourceRowId,
    sourceName: record.sourceName,
  }
}

export function getOptimExerciseWarmStartPrediction(
  exercise: Pick<ExerciseListItem, 'exerciseCode'>,
  profile: OptimWarmStartProfile,
): OptimExerciseWarmStartPrediction | null {
  return getWarmStartPrediction(dataset.records, exercise, profile)
}

export function getOptimExerciseProductWarmStartPrediction(
  exercise: Pick<ExerciseListItem, 'exerciseCode'>,
  profile: OptimWarmStartProfile,
): OptimExerciseWarmStartPrediction | null {
  const prediction = getWarmStartPrediction(productDataset.records, exercise, profile)
  return prediction ? { ...prediction, productOnly: true } : null
}

export function getOptimExerciseProductAwareWarmStartPrediction(
  exercise: Pick<ExerciseListItem, 'exerciseCode'>,
  profile: OptimWarmStartProfile,
): OptimExerciseWarmStartPrediction | null {
  const code = exercise.exerciseCode?.trim().toUpperCase()
  const productPrediction = getOptimExerciseProductWarmStartPrediction(exercise, profile)
  if (code && productLegacyExclusionCodes.has(code)) return productPrediction
  return getOptimExerciseWarmStartPrediction(exercise, profile) ?? productPrediction
}
