import {
  generateOptimDemo,
  type OptimDemoInputs,
  type OptimDemoResult,
  type OptimDemoSplit,
  type OptimDemoUserContext,
} from './optimDemoEngine'
import {
  OPTIM_DURATION_FILL_TARGET_UTILIZATION,
  estimateOptimGuidedSessionMinutes,
  estimateOptimStrengthStageUtilization,
  fillOptimExtraWorkingSetsToSessionTarget,
  fitOptimOptionalStagesToSessionTarget,
  isOptimDurationFillImprovement,
  isOptimCoreRestoreImprovement,
  optimWorkingSetCount,
  optimDurationFillCounts,
  resolveOptimCoreRestoreTarget,
  trimOptimWarmupsToSessionTarget,
  trimOptimWorkingSetsToGuidedTarget,
  withOptimSessionEstimate,
} from './optimDurationPolicy'

export type OptimGeneratorGroupingMode = 'straight' | 'supersets' | 'circuits'
export type OptimWorkoutNotice =
  | 'circuitFallback'
  | 'circuitLoadsGuided'
  | 'circuitLoadsOpen'
  | 'supersetUnavailable'
  | 'cardioOmitted'
  | 'cooldownOmitted'
  | 'durationOverrun'
  | 'durationShortfall'

const materialDurationOverrunMinutes = (requestedMinutes: number) =>
  Math.max(1, requestedMinutes * 0.02)
const materialDurationShortfallUtilization = 0.75

export function resolveOptimUserSplit(
  requestedSplit: OptimDemoSplit,
  completedWorkoutCount: number,
): OptimDemoSplit {
  // With no recovery history, "fresh" has no signal and can collapse into
  // two popular buckets. The engine's full-body path already reserves lower,
  // push, and pull roles; once history exists, fresh resumes doing its real job.
  return requestedSplit === 'fresh' && completedWorkoutCount === 0
    ? 'fullBody'
    : requestedSplit
}

export function optimResultHasGroup(
  result: OptimDemoResult,
  groupType: 'superset' | 'circuit',
): boolean {
  return result.exercises.some((exercise) => exercise.groupId != null && exercise.groupType === groupType)
}

export function shouldUseStraightSetFallback(
  grouping: OptimGeneratorGroupingMode,
  result: OptimDemoResult,
): boolean {
  return grouping === 'circuits' && !optimResultHasGroup(result, 'circuit')
}

export function classifyOptimWorkoutNotices(options: {
  grouping: OptimGeneratorGroupingMode
  result: OptimDemoResult
  circuitFallback: boolean
  cardioRequested: boolean
  cooldownRequested: boolean
}): OptimWorkoutNotice[] {
  const notices: OptimWorkoutNotice[] = []
  const guidedSessionMinutes = estimateOptimGuidedSessionMinutes(options.result)
  const finalHasCircuit = optimResultHasGroup(options.result, 'circuit')
  if (options.grouping === 'circuits' && (options.circuitFallback || !finalHasCircuit)) {
    notices.push('circuitFallback')
  } else if (options.grouping === 'circuits') {
    const guidedLoadExists = options.result.exercises.some((exercise) =>
      exercise.groupType === 'circuit' &&
      exercise.groupId != null &&
      exercise.sets.some((set) => set.setType === 'normal' && set.weightKg != null))
    notices.push(guidedLoadExists ? 'circuitLoadsGuided' : 'circuitLoadsOpen')
  }
  if (
    options.grouping === 'supersets' &&
    !optimResultHasGroup(options.result, 'superset')
  ) notices.push('supersetUnavailable')
  if (
    options.cardioRequested &&
    !options.result.exercises.some((exercise) => exercise.phase === 'cardio')
  ) notices.push('cardioOmitted')
  if (
    options.cooldownRequested &&
    !options.result.exercises.some((exercise) => exercise.phase === 'mobilityCooldown')
  ) notices.push('cooldownOmitted')
  if (
    options.result.exercises.length > 0 &&
    options.result.durationEstimate != null &&
    guidedSessionMinutes != null &&
    guidedSessionMinutes >
      options.result.durationEstimate.requestedMinutes +
        materialDurationOverrunMinutes(options.result.durationEstimate.requestedMinutes)
  ) notices.push('durationOverrun')
  else if (
    options.result.exercises.length > 0 &&
    options.result.durationEstimate != null &&
    guidedSessionMinutes != null &&
    guidedSessionMinutes / options.result.durationEstimate.requestedMinutes <
      materialDurationShortfallUtilization
  ) notices.push('durationShortfall')
  return notices
}

/**
 * When a requested grouping formed nothing, one extra core movement often
 * unlocks a core pair (specialized sessions are mostly protected primary
 * lifts with a single core finisher). Accept the candidate only when the
 * duration ceiling still holds, every strength lift is unchanged, and total
 * working sets do not fall. Returns null when the restore does not help.
 */
function resolveOptimGroupingCoreRestore(
  inputs: OptimDemoInputs,
  context: OptimDemoUserContext,
  groupType: 'superset' | 'circuit',
  base: OptimDemoResult,
): OptimDemoResult | null {
  if (base.counts.generatedCore < 1) return null
  // A caller-supplied manual count override is never rewritten.
  if (inputs.coreCountOverride != null) return null
  if (optimResultHasGroup(base, groupType)) return null
  const candidate = trimOptimWarmupsToSessionTarget(generateOptimDemo({
    ...inputs,
    coreCountOverride: base.counts.generatedCore + 1,
  }, context))
  if (!optimResultHasGroup(candidate, groupType)) return null
  const guided = estimateOptimGuidedSessionMinutes(candidate)
  if (
    guided != null &&
    guided > inputs.durationMinutes + Math.max(1, inputs.durationMinutes * 0.02)
  ) return null
  const liftCodes = (result: OptimDemoResult) => result.exercises
    .filter((exercise) => exercise.phase === 'strength')
    .map((exercise) => exercise.code)
    .join('|')
  if (liftCodes(candidate) !== liftCodes(base)) return null
  if (optimWorkingSetCount(candidate) < optimWorkingSetCount(base)) return null
  candidate.events.push(
    `Product grouping policy added one core movement so the requested ${groupType} mode could actually form; the duration ceiling, every strength lift, and total working sets were preserved.`,
  )
  return candidate
}

/** User-facing policies over the backwards-compatible engine: cold start, circuit guidance, fallbacks, and notices. */
export function generateOptimUserWorkout(
  inputs: OptimDemoInputs,
  context: OptimDemoUserContext,
  grouping: OptimGeneratorGroupingMode,
): { result: OptimDemoResult; notices: OptimWorkoutNotice[]; circuitFallback: boolean } {
  const resolvedInputs = {
    ...inputs,
    split: resolveOptimUserSplit(inputs.split, context.completedWorkouts.length),
    circuitLoadGuidanceEnabled: grouping === 'circuits',
    bodyweightCircuitPatternGroupingEnabled: grouping === 'circuits',
    generalAccessoryCircuitGroupingEnabled: grouping === 'circuits',
    timedCircuitSequentialRestEnabled: grouping === 'circuits',
    supersetStationSharingEnabled: grouping === 'supersets',
    corePhasePairGroupingEnabled: grouping !== 'straight',
    inferredAccessoryPairGroupingEnabled: grouping !== 'straight',
    groupPartnerReorderEnabled: grouping !== 'straight',
    olympicTechnicalPrescriptionsEnabled: true,
    prescriptionRepCapsEnabled: true,
    rpeAwareHistoryEnabled: true,
    measuredEffortCapabilityHoldEnabled: true,
    loggedEffortCatchUpEnabled: true,
    relationshipWarmStartEnabled: true,
    productRelationshipOverlayEnabled: true,
    productWarmStartOverlayEnabled: true,
    bodyweightOnlyLoadExclusionEnabled: true,
    cardioReservationMatchesEmittedEnabled: true,
    durationFillExtraSetsEnabled: true,
  }
  let effectiveInputs = resolvedInputs
  let result = generateOptimDemo(effectiveInputs, context)
  if (grouping === 'circuits' && !optimResultHasGroup(result, 'circuit')) {
    const restored = resolveOptimGroupingCoreRestore(effectiveInputs, context, 'circuit', result)
    if (restored) {
      effectiveInputs = { ...effectiveInputs, coreCountOverride: result.counts.generatedCore + 1 }
      result = restored
    }
  }
  const circuitFallback = shouldUseStraightSetFallback(grouping, result)
  if (circuitFallback) {
    effectiveInputs = { ...resolvedInputs, circuitsEnabled: false }
    result = generateOptimDemo(effectiveInputs, context)
  }
  if (grouping === 'supersets' && !optimResultHasGroup(result, 'superset')) {
    const restored = resolveOptimGroupingCoreRestore(effectiveInputs, context, 'superset', result)
    if (restored) {
      effectiveInputs = { ...effectiveInputs, coreCountOverride: result.counts.generatedCore + 1 }
      result = restored
    }
  }
  result = trimOptimWarmupsToSessionTarget(result)
  const restoredCoreCount = resolveOptimCoreRestoreTarget(effectiveInputs, result)
  if (restoredCoreCount != null) {
    const candidateInputs = {
      ...effectiveInputs,
      coreCountOverride: restoredCoreCount,
    }
    const candidate = trimOptimWarmupsToSessionTarget(
      generateOptimDemo(candidateInputs, context),
    )
    if (isOptimCoreRestoreImprovement(result, candidate, effectiveInputs.durationMinutes)) {
      candidate.events.push(
        `Product duration policy restored one core movement across the recovered ${candidate.durationEstimate?.strengthBudgetMinutes}-minute strength-budget gap while keeping every movement and ceding at most one working set from an existing lift.`,
      )
      result = candidate
      effectiveInputs = candidateInputs
    }
  }
  const durationFillCounts = optimDurationFillCounts(resolvedInputs, result)
  if (durationFillCounts.length > 0) {
    const base = result
    for (const nonCoreCountOverride of durationFillCounts) {
      const candidate = trimOptimWarmupsToSessionTarget(
        generateOptimDemo({
          ...effectiveInputs,
          nonCoreCountOverride,
        }, context),
      )
      if (
        isOptimDurationFillImprovement(base, candidate, effectiveInputs.durationMinutes) &&
        (candidate.durationEstimate?.projectedMinutes ?? 0) >
          (result.durationEstimate?.projectedMinutes ?? 0) &&
        optimWorkingSetCount(candidate) >= optimWorkingSetCount(result)
      ) {
        result = candidate
        if (
          (estimateOptimStrengthStageUtilization(result) ?? 0) >=
          OPTIM_DURATION_FILL_TARGET_UTILIZATION
        ) break
      }
    }
    if (result !== base) {
      result.events.push(
        `Product duration policy added ${result.counts.requestedNonCore - base.counts.requestedNonCore} compatible strength movement${result.counts.requestedNonCore - base.counts.requestedNonCore === 1 ? '' : 's'} to better match the requested ${effectiveInputs.durationMinutes}-minute window without exceeding it; retained strength movements kept at least two working sets and aggregate core work did not fall.`,
      )
    }
  }
  result = withOptimSessionEstimate(trimOptimWorkingSetsToGuidedTarget(
    fillOptimExtraWorkingSetsToSessionTarget(
      fitOptimOptionalStagesToSessionTarget(result),
      effectiveInputs,
    ),
  ))
  const finalCircuitFallback = shouldUseStraightSetFallback(grouping, result)
  return {
    result,
    circuitFallback: finalCircuitFallback,
    notices: classifyOptimWorkoutNotices({
      grouping,
      result,
      circuitFallback: finalCircuitFallback,
      cardioRequested: resolvedInputs.cardioEnabled,
      cooldownRequested: resolvedInputs.mobilityCooldownEnabled,
    }),
  }
}
