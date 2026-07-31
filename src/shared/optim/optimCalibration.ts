import {
  OPTIM_ESTIMATOR_VERSION,
  type OptimPlanRecord,
} from './optimOutcomeStore'

type OptimPaceCohortSummary = {
  sampleCount: number
  medianActiveTimeRatio: number | null
}

export type OptimCalibrationSummary = {
  estimatorVersion: number
  startedCount: number
  completedCount: number
  planFitSampleCount: number
  underfilledStartedCount: number
  cleanActiveTimeSampleCount: number
  medianActiveTimeRatio: number | null
  activeTimeRatioIqr: number | null
  paceCohorts: {
    noUnilateralReps: OptimPaceCohortSummary
    underTwentyPercentUnilateral: OptimPaceCohortSummary
    atLeastTwentyPercentUnilateral: OptimPaceCohortSummary
  }
  excluded: {
    timingUnavailable: number
    pauseAttributionUnavailable: number
    manualPauseObserved: number
    estimatorVersionMismatch: number
    legacyAttribution: number
    normalizedAtFinish: number
    shapeChanged: number
    missingStartedEstimate: number
  }
}

const quantile = (sorted: number[], fraction: number): number | null => {
  if (sorted.length === 0) return null
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const weight = position - lower
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight
}

const roundedRatio = (value: number | null): number | null =>
  value == null ? null : Math.round(value * 1000) / 1000

const summarizePaceCohort = (ratios: number[]): OptimPaceCohortSummary => {
  ratios.sort((left, right) => left - right)
  return {
    sampleCount: ratios.length,
    medianActiveTimeRatio: roundedRatio(quantile(ratios, 0.5)),
  }
}

const startedGuidedMinutes = (record: OptimPlanRecord): number | null => {
  const startedEstimate = record.startedShape.guidedProjectedMinutes
  if (startedEstimate != null && startedEstimate > 0) return startedEstimate
  if (record.plan.contentEdited) return null
  const generatedEstimate = record.plan.guidedProjectedMinutes
  return generatedEstimate != null && generatedEstimate > 0
    ? generatedEstimate
    : null
}

/**
 * Produces privacy-safe local calibration aggregates.
 *
 * Active-time ratios remain diagnostic only. Samples fail closed when manual
 * pause history is missing or a previously-started timer was restored.
 */
export function deriveOptimCalibration(
  records: OptimPlanRecord[],
): OptimCalibrationSummary {
  const excluded = {
    timingUnavailable: 0,
    pauseAttributionUnavailable: 0,
    manualPauseObserved: 0,
    estimatorVersionMismatch: 0,
    legacyAttribution: 0,
    normalizedAtFinish: 0,
    shapeChanged: 0,
    missingStartedEstimate: 0,
  }
  let planFitSampleCount = 0
  let underfilledStartedCount = 0
  const activeTimeRatios: number[] = []
  const noUnilateralRatios: number[] = []
  const underTwentyPercentUnilateralRatios: number[] = []
  const atLeastTwentyPercentUnilateralRatios: number[] = []

  for (const record of records) {
    const estimatorCompatible =
      record.plan.estimatorVersion === OPTIM_ESTIMATOR_VERSION
    const estimate = estimatorCompatible ? startedGuidedMinutes(record) : null
    if (estimate != null) {
      planFitSampleCount += 1
      if (estimate / record.plan.requestedMinutes < 0.85) {
        underfilledStartedCount += 1
      }
    }

    const outcome = record.outcome
    if (!outcome) continue
    if (outcome.durationSource !== 'timer' || outcome.autoPaused) {
      excluded.timingUnavailable += 1
      continue
    }
    if (
      outcome.pauseAttributionComplete !== true ||
      outcome.manualPaused == null
    ) {
      excluded.pauseAttributionUnavailable += 1
      continue
    }
    if (outcome.manualPaused) {
      excluded.manualPauseObserved += 1
      continue
    }
    if (!estimatorCompatible) {
      excluded.estimatorVersionMismatch += 1
      continue
    }
    if (
      outcome.autoCompletedSetCount == null ||
      outcome.removedEmptySetCount == null
    ) {
      excluded.legacyAttribution += 1
      continue
    }
    if (
      outcome.autoCompletedSetCount > 0 ||
      outcome.removedEmptySetCount > 0
    ) {
      excluded.normalizedAtFinish += 1
      continue
    }
    if (
      outcome.finalExerciseCount !== record.startedShape.exerciseCount ||
      outcome.finalSetCount !== record.startedShape.plannedSetCount
    ) {
      excluded.shapeChanged += 1
      continue
    }
    if (estimate == null) {
      excluded.missingStartedEstimate += 1
      continue
    }
    const activeTimeRatio = outcome.durationSeconds / (estimate * 60)
    activeTimeRatios.push(activeTimeRatio)
    const totalReps = record.plan.generatedRepCount
    const unilateralReps = Math.min(
      totalReps,
      record.plan.generatedUnilateralRepCount,
    )
    // Twenty percent is an interpretable diagnostic boundary: roughly one
    // per-side movement in a five-movement plan, not a tuning coefficient.
    if (totalReps <= 0 || unilateralReps <= 0) {
      noUnilateralRatios.push(activeTimeRatio)
    } else if (unilateralReps / totalReps < 0.2) {
      underTwentyPercentUnilateralRatios.push(activeTimeRatio)
    } else {
      atLeastTwentyPercentUnilateralRatios.push(activeTimeRatio)
    }
  }

  activeTimeRatios.sort((left, right) => left - right)
  const median = quantile(activeTimeRatios, 0.5)
  const firstQuartile = quantile(activeTimeRatios, 0.25)
  const thirdQuartile = quantile(activeTimeRatios, 0.75)
  return {
    estimatorVersion: OPTIM_ESTIMATOR_VERSION,
    startedCount: records.length,
    completedCount: records.filter((record) => record.outcome != null).length,
    planFitSampleCount,
    underfilledStartedCount,
    cleanActiveTimeSampleCount: activeTimeRatios.length,
    medianActiveTimeRatio: roundedRatio(median),
    activeTimeRatioIqr:
      firstQuartile == null || thirdQuartile == null
        ? null
        : Math.round((thirdQuartile - firstQuartile) * 1000) / 1000,
    paceCohorts: {
      noUnilateralReps: summarizePaceCohort(noUnilateralRatios),
      underTwentyPercentUnilateral: summarizePaceCohort(
        underTwentyPercentUnilateralRatios,
      ),
      atLeastTwentyPercentUnilateral: summarizePaceCohort(
        atLeastTwentyPercentUnilateralRatios,
      ),
    },
    excluded,
  }
}
