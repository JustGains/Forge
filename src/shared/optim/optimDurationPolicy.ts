import {
  calculateOptimExerciseCounts,
  estimatedExerciseSeconds,
  type OptimDemoInputs,
  type OptimDemoResult,
} from './optimDemoEngine'

type GeneratedExercise = OptimDemoResult['exercises'][number]

const phaseExercises = (
  result: OptimDemoResult,
  phase: GeneratedExercise['phase'],
) => result.exercises.filter((exercise) => exercise.phase === phase)

const sameCodes = (left: GeneratedExercise[], right: GeneratedExercise[]) =>
  left.length === right.length && left.every((exercise, index) => exercise.code === right[index]?.code)

const normalSetCount = (exercise: GeneratedExercise) =>
  exercise.sets.filter((set) => set.setType === 'normal').length

const sameGroup = (left: GeneratedExercise, right: GeneratedExercise) =>
  left.groupId === right.groupId && left.groupType === right.groupType

const carriedExerciseCompatible = (
  base: GeneratedExercise,
  candidate: GeneratedExercise,
) => candidate.maxEffort === base.maxEffort &&
  normalSetCount(candidate) >= Math.max(2, normalSetCount(base) - 1)

const durationCarriedStrengthCompatible = (
  base: GeneratedExercise,
  candidate: GeneratedExercise,
) => candidate.maxEffort === base.maxEffort &&
  normalSetCount(candidate) >= Math.max(2, normalSetCount(base) - 2)

export const optimWorkingSetCount = (result: OptimDemoResult) => result.exercises.reduce(
  (count, exercise) => count + exercise.sets.filter((set) => set.setType === 'normal').length,
  0,
)

const exerciseCodesAreUnique = (result: OptimDemoResult) => {
  const codes = result.exercises.map((exercise) => exercise.code)
  return new Set(codes).size === codes.length
}

const optionalExercises = (result: OptimDemoResult) => result.exercises.filter((exercise) =>
  exercise.phase !== 'strength' && exercise.phase !== 'core')

const optionalStagesCompatible = (
  base: OptimDemoResult,
  candidate: OptimDemoResult,
) => {
  const baseOptional = optionalExercises(base)
  const candidateOptional = optionalExercises(candidate)
  return baseOptional.length === candidateOptional.length &&
    baseOptional.every((exercise, index) => {
      const next = candidateOptional[index]
      if (
        next == null ||
        next.phase !== exercise.phase ||
        JSON.stringify(next.sets) !== JSON.stringify(exercise.sets)
      ) return false
      // Cardio may be explicitly selected and keeps its exact identity.
      // Mobility can rotate to the newly trained buckets when its stage and
      // prescription are unchanged.
      return exercise.phase !== 'cardio' || next.code === exercise.code
    })
}

// The engine's strength budget is intentionally conservative. Product fill may
// use up to 75% of that stage, while whole-session candidate acceptance still
// reserves the remaining real-world time and enforces the user's hard ceiling.
export const OPTIM_DURATION_FILL_TARGET_UTILIZATION = 0.75
export const OPTIM_DURATION_FILL_MAX_EXTRA_EXERCISES = 3
export const OPTIM_RESTRICTED_DURATION_FILL_MAX_EXTRA_EXERCISES = 1
export const OPTIM_TRANSITION_SECONDS_PER_EXERCISE = 30
/** Extra-set fill stops once the guided session reaches this share of the request. */
export const OPTIM_EXTRA_SET_TARGET_UTILIZATION = 0.9
export const OPTIM_EXTRA_SETS_PER_EXERCISE = 1
/** Hour-plus windows may take a second copied set per lift; shorter windows stay at one. */
export const OPTIM_LONG_WINDOW_EXTRA_SETS_PER_EXERCISE = 2
export const OPTIM_LONG_WINDOW_EXTRA_SET_MINUTES = 45

const estimatedSubtotalSeconds = (exercises: GeneratedExercise[]): number =>
  exercises.reduce((seconds, exercise) => seconds + estimatedExerciseSeconds(exercise), 0)

const isFullyTimedExercise = (exercise: GeneratedExercise) =>
  exercise.sets.length > 0 &&
  exercise.sets.every((set) => set.durationSeconds != null)

const guidedFinalRestExcessSeconds = (exercises: GeneratedExercise[]): number => {
  const intervalGroups = new Map<string, number[]>()
  exercises.forEach((exercise, index) => {
    if (
      exercise.groupId == null ||
      (exercise.groupType !== 'superset' && exercise.groupType !== 'circuit')
    ) return
    const key = `${exercise.groupType}:${exercise.groupId}`
    intervalGroups.set(key, [...(intervalGroups.get(key) ?? []), index])
  })

  const intervalGroupIndexes = new Set<number>()
  const unguidedFinalRestIndexes = new Set<number>()
  for (const indexes of intervalGroups.values()) {
    if (
      indexes.length < 2 ||
      !indexes.every((index) => isFullyTimedExercise(exercises[index]!))
    ) continue
    indexes.forEach((index) => intervalGroupIndexes.add(index))
    const groupType = exercises[indexes[0]!]!.groupType
    if (groupType === 'circuit') {
      unguidedFinalRestIndexes.add(indexes.at(-1)!)
      continue
    }
    const maximumSetCount = Math.max(...indexes.map((index) => exercises[index]!.sets.length))
    for (let setIndex = maximumSetCount - 1; setIndex >= 0; setIndex -= 1) {
      const terminalIndex = [...indexes].reverse().find(
        (index) => exercises[index]!.sets[setIndex] != null,
      )
      if (terminalIndex != null) {
        unguidedFinalRestIndexes.add(terminalIndex)
        break
      }
    }
  }

  const finalExerciseIndex = exercises.length - 1
  if (!intervalGroupIndexes.has(finalExerciseIndex)) {
    unguidedFinalRestIndexes.add(finalExerciseIndex)
  }

  return exercises.reduce((seconds, exercise, index) => (
    unguidedFinalRestIndexes.has(index)
      ? seconds
      : seconds + Math.max(
          (exercise.sets.at(-1)?.restSeconds ?? 0) -
            OPTIM_TRANSITION_SECONDS_PER_EXERCISE,
          0,
        )
  ), 0)
}

const estimatedGuidedSessionSeconds = (exercises: GeneratedExercise[]) =>
  estimatedSubtotalSeconds(exercises) +
  exercises.length * OPTIM_TRANSITION_SECONDS_PER_EXERCISE +
  guidedFinalRestExcessSeconds(exercises)

export function estimateOptimSessionMinutes(result: OptimDemoResult): number | null {
  const projectedMinutes = result.durationEstimate?.projectedMinutes
  if (projectedMinutes == null) return null
  return Math.round((
    projectedMinutes + result.exercises.length * OPTIM_TRANSITION_SECONDS_PER_EXERCISE / 60
  ) * 10) / 10
}

/**
 * Estimates the time the workout UI actively guides.
 *
 * The engine excludes each exercise's final rest, while the workout player
 * offers that rest before the next exercise. The existing transition allowance
 * already covers the first 30 seconds, so only the non-overlapping remainder
 * is added. The final exercise's rest is intentionally excluded because the
 * workout is complete at that point.
 */
export function estimateOptimGuidedSessionMinutes(result: OptimDemoResult): number | null {
  const sessionMinutes = result.durationEstimate?.sessionProjectedMinutes ??
    estimateOptimSessionMinutes(result)
  if (sessionMinutes == null) return null

  return Math.round((
    sessionMinutes + guidedFinalRestExcessSeconds(result.exercises) / 60
  ) * 10) / 10
}

export function trimOptimWarmupsToSessionTarget(result: OptimDemoResult): OptimDemoResult {
  const durationEstimate = result.durationEstimate
  if (durationEstimate == null || durationEstimate.requestedMinutes <= 0) return result
  const requestedMinutes = durationEstimate.requestedMinutes
  const exercises = result.exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({ ...set })),
    trace: [...exercise.trace],
  }))
  const sessionSeconds = () =>
    estimatedSubtotalSeconds(exercises) +
    exercises.length * OPTIM_TRANSITION_SECONDS_PER_EXERCISE
  const guidedSessionSeconds = () => estimatedGuidedSessionSeconds(exercises)
  let removed = 0

  for (
    let index = exercises.length - 1;
    index >= 0 && guidedSessionSeconds() > requestedMinutes * 60;
    index -= 1
  ) {
    const exercise = exercises[index]
    if (!exercise || exercise.phase !== 'strength') continue
    let removedFromExercise = 0
    while (guidedSessionSeconds() > requestedMinutes * 60) {
      const warmupIndex = exercise.sets.findIndex((set) => set.setType === 'warmup')
      if (warmupIndex < 0) break
      exercise.sets.splice(warmupIndex, 1)
      removed += 1
      removedFromExercise += 1
    }
    if (removedFromExercise > 0) {
      exercise.sets = exercise.sets.map((set, setIndex) => ({
        ...set,
        setNumber: setIndex + 1,
      }))
      exercise.trace.push(
        `Product duration fit removed ${removedFromExercise} lower-priority ramp set${removedFromExercise === 1 ? '' : 's'} before touching working volume.`,
      )
    }
  }
  if (removed === 0) return result

  const projectedSeconds = estimatedSubtotalSeconds(exercises)
  const projectedMinutes = Math.round(projectedSeconds / 60 * 10) / 10
  const sessionProjectedMinutes = Math.round((
    projectedSeconds + exercises.length * OPTIM_TRANSITION_SECONDS_PER_EXERCISE
  ) / 60 * 10) / 10
  return {
    ...result,
    durationEstimate: {
      ...durationEstimate,
      projectedMinutes,
      utilization: Math.round(projectedSeconds / (requestedMinutes * 60) * 1000) / 1000,
      sessionProjectedMinutes,
      sessionUtilization: Math.round(sessionProjectedMinutes / requestedMinutes * 1000) / 1000,
    },
    exercises,
    events: [
      ...result.events,
      `Product duration fit removed ${removed} lower-priority ramp set${removed === 1 ? '' : 's'} so work, rest, and transitions stay inside the requested window.`,
    ],
  }
}

export function fitOptimOptionalStagesToSessionTarget(result: OptimDemoResult): OptimDemoResult {
  const durationEstimate = result.durationEstimate
  if (durationEstimate == null || durationEstimate.requestedMinutes <= 0) return result
  const requestedSeconds = durationEstimate.requestedMinutes * 60
  const exercises = result.exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({ ...set })),
    trace: [...exercise.trace],
  }))
  const sessionSeconds = () =>
    estimatedSubtotalSeconds(exercises) +
    exercises.length * OPTIM_TRANSITION_SECONDS_PER_EXERCISE
  const guidedSessionSeconds = () => estimatedGuidedSessionSeconds(exercises)
  if (guidedSessionSeconds() <= requestedSeconds) return result

  let shortenedCooldownSeconds = 0
  for (let index = exercises.length - 1; index >= 0 && guidedSessionSeconds() > requestedSeconds; index -= 1) {
    const exercise = exercises[index]
    if (!exercise || exercise.phase !== 'mobilityCooldown') continue
    let shortenedExerciseSeconds = 0
    for (let setIndex = exercise.sets.length - 1; setIndex >= 0 && guidedSessionSeconds() > requestedSeconds; setIndex -= 1) {
      const set = exercise.sets[setIndex]
      if (!set || set.durationSeconds == null || set.durationSeconds <= 30) continue
      const reduction = Math.min(
        set.durationSeconds - 30,
        Math.ceil(guidedSessionSeconds() - requestedSeconds),
      )
      set.durationSeconds -= reduction
      shortenedCooldownSeconds += reduction
      shortenedExerciseSeconds += reduction
    }
    if (shortenedExerciseSeconds > 0) {
      exercise.trace.push(
        `Product duration fit shortened cooldown holds by ${shortenedExerciseSeconds} seconds to honor the selected window.`,
      )
    }
  }

  let removedCooldowns = 0
  for (let index = exercises.length - 1; index >= 0 && guidedSessionSeconds() > requestedSeconds; index -= 1) {
    if (exercises[index]!.phase !== 'mobilityCooldown') continue
    exercises.splice(index, 1)
    removedCooldowns += 1
  }

  let shortenedCardioSeconds = 0
  for (let index = exercises.length - 1; index >= 0 && guidedSessionSeconds() > requestedSeconds; index -= 1) {
    const exercise = exercises[index]
    if (!exercise || exercise.phase !== 'cardio') continue
    let shortenedExerciseSeconds = 0
    for (let setIndex = exercise.sets.length - 1; setIndex >= 0 && guidedSessionSeconds() > requestedSeconds; setIndex -= 1) {
      const set = exercise.sets[setIndex]
      if (!set || set.durationSeconds == null || set.durationSeconds <= 60) continue
      const reduction = Math.min(
        set.durationSeconds - 60,
        Math.ceil(guidedSessionSeconds() - requestedSeconds),
      )
      set.durationSeconds -= reduction
      shortenedCardioSeconds += reduction
      shortenedExerciseSeconds += reduction
    }
    if (shortenedExerciseSeconds > 0) {
      exercise.trace.push(
        `Product duration fit shortened timed cardio by ${shortenedExerciseSeconds} seconds to honor the selected window.`,
      )
    }
  }

  let removedCardio = 0
  for (let index = exercises.length - 1; index >= 0 && guidedSessionSeconds() > requestedSeconds; index -= 1) {
    if (exercises[index]!.phase !== 'cardio') continue
    exercises.splice(index, 1)
    removedCardio += 1
  }

  const projectedSeconds = estimatedSubtotalSeconds(exercises)
  const projectedMinutes = Math.round(projectedSeconds / 60 * 10) / 10
  const sessionProjectedMinutes = Math.round(sessionSeconds() / 60 * 10) / 10
  const changes = [
    shortenedCooldownSeconds > 0 ? `shortened cooldown by ${shortenedCooldownSeconds}s` : null,
    removedCooldowns > 0 ? `omitted ${removedCooldowns} cooldown movement${removedCooldowns === 1 ? '' : 's'}` : null,
    shortenedCardioSeconds > 0 ? `shortened timed cardio by ${shortenedCardioSeconds}s` : null,
    removedCardio > 0 ? `omitted ${removedCardio} cardio movement${removedCardio === 1 ? '' : 's'}` : null,
  ].filter((change): change is string => change != null)
  if (changes.length === 0) return result
  return {
    ...result,
    durationEstimate: {
      ...durationEstimate,
      projectedMinutes,
      utilization: Math.round(projectedSeconds / requestedSeconds * 1000) / 1000,
      sessionProjectedMinutes,
      sessionUtilization: Math.round(sessionProjectedMinutes / durationEstimate.requestedMinutes * 1000) / 1000,
    },
    counts: {
      ...result.counts,
      generatedCardio: exercises.filter((exercise) => exercise.phase === 'cardio').length,
      generatedMobility: exercises.filter((exercise) =>
        exercise.phase === 'mobilityWarmup' || exercise.phase === 'mobilityCooldown').length,
    },
    exercises,
    events: [
      ...result.events,
      `Product duration fit ${changes.join(', ')} after preserving every strength and core working set.`,
    ],
  }
}

export function trimOptimWorkingSetsToGuidedTarget(result: OptimDemoResult): OptimDemoResult {
  const durationEstimate = result.durationEstimate
  if (durationEstimate == null || durationEstimate.requestedMinutes <= 0) return result
  const requestedSeconds = durationEstimate.requestedMinutes * 60
  let exercises = result.exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({ ...set })),
    trace: [...exercise.trace],
  }))
  let currentSeconds = estimatedGuidedSessionSeconds(exercises)
  if (currentSeconds <= requestedSeconds) return result

  let removed = 0
  while (currentSeconds > requestedSeconds) {
    const claimedGroups = new Set<string>()
    const units: number[][] = []
    for (let index = exercises.length - 1; index >= 0; index -= 1) {
      const exercise = exercises[index]
      if (!exercise) continue
      if (exercise.phase !== 'strength' && exercise.phase !== 'core') continue
      if (exercise.groupId == null || exercise.groupType == null) {
        units.push([index])
        continue
      }
      const key = `${exercise.groupType}:${exercise.groupId}`
      if (claimedGroups.has(key)) continue
      claimedGroups.add(key)
      units.push(exercises
        .map((item, itemIndex) => ({ item, itemIndex }))
        .filter(({ item }) =>
          item.groupId === exercise.groupId && item.groupType === exercise.groupType)
        .map(({ itemIndex }) => itemIndex))
    }

    let best: { exercises: GeneratedExercise[]; seconds: number; indexes: number[] } | null = null
    for (const indexes of units) {
      if (indexes.some((index) => normalSetCount(exercises[index]!) <= 2)) continue
      const candidate = exercises.map((exercise, index) => {
        if (!indexes.includes(index)) return exercise
        const lastNormalIndex = exercise.sets.findLastIndex((set) => set.setType === 'normal')
        return {
          ...exercise,
          sets: exercise.sets
            .filter((_, setIndex) => setIndex !== lastNormalIndex)
            .map((set, setIndex) => ({ ...set, setNumber: setIndex + 1 })),
          trace: [...exercise.trace],
        }
      })
      const candidateSeconds = estimatedGuidedSessionSeconds(candidate)
      if (
        Math.abs(candidateSeconds - requestedSeconds) >=
          Math.abs(currentSeconds - requestedSeconds) ||
        (best != null &&
          Math.abs(candidateSeconds - requestedSeconds) >=
            Math.abs(best.seconds - requestedSeconds))
      ) continue
      best = { exercises: candidate, seconds: candidateSeconds, indexes }
    }
    if (best == null) break

    exercises = best.exercises
    currentSeconds = best.seconds
    removed += best.indexes.length
    best.indexes.forEach((index) => {
      exercises[index]!.trace.push(
        'Product guided duration fit removed one lower-priority working set because it produced a closer match to the selected window.',
      )
    })
  }
  if (removed === 0) return result

  const projectedSeconds = estimatedSubtotalSeconds(exercises)
  const projectedMinutes = Math.round(projectedSeconds / 60 * 10) / 10
  const sessionProjectedMinutes = Math.round((
    projectedSeconds + exercises.length * OPTIM_TRANSITION_SECONDS_PER_EXERCISE
  ) / 60 * 10) / 10
  return {
    ...result,
    durationEstimate: {
      ...durationEstimate,
      projectedMinutes,
      utilization: Math.round(projectedSeconds / requestedSeconds * 1000) / 1000,
      sessionProjectedMinutes,
      sessionUtilization: Math.round(
        sessionProjectedMinutes / durationEstimate.requestedMinutes * 1000,
      ) / 1000,
    },
    exercises,
    events: [
      ...result.events,
      `Product guided duration fit removed ${removed} lower-priority working set${removed === 1 ? '' : 's'} because that was closer to the selected window while preserving at least two sets per movement.`,
    ],
  }
}

export function estimateOptimSessionUtilization(result: OptimDemoResult): number | null {
  const sessionMinutes = estimateOptimSessionMinutes(result)
  const requestedMinutes = result.durationEstimate?.requestedMinutes
  if (sessionMinutes == null || requestedMinutes == null || requestedMinutes <= 0) return null
  return Math.round(sessionMinutes / requestedMinutes * 1000) / 1000
}

export function estimateOptimStrengthStageUtilization(result: OptimDemoResult): number | null {
  const strengthBudgetMinutes = result.durationEstimate?.strengthBudgetMinutes
  if (strengthBudgetMinutes == null || strengthBudgetMinutes <= 0) return null
  const strengthAndCore = result.exercises.filter((exercise) =>
    exercise.phase === 'strength' || exercise.phase === 'core')
  if (strengthAndCore.length === result.exercises.length) {
    // Preserve the established product path byte-for-byte when there is no
    // optional stage to decouple. Its rounded subtotal is the prior gate's
    // source of truth; recomputing raw seconds can move threshold-edge plans.
    return estimateOptimSessionUtilization(result)
  }
  const strengthStageSeconds =
    estimatedSubtotalSeconds(strengthAndCore) +
    strengthAndCore.length * OPTIM_TRANSITION_SECONDS_PER_EXERCISE
  return Math.round(strengthStageSeconds / (strengthBudgetMinutes * 60) * 1000) / 1000
}

export function withOptimSessionEstimate(result: OptimDemoResult): OptimDemoResult {
  if (result.durationEstimate == null) return result
  const sessionProjectedMinutes = estimateOptimSessionMinutes(result)
  const sessionUtilization = estimateOptimSessionUtilization(result)
  if (sessionProjectedMinutes == null || sessionUtilization == null) return result
  return {
    ...result,
    durationEstimate: {
      ...result.durationEstimate,
      sessionProjectedMinutes,
      sessionUtilization,
    },
  }
}

const groupSignature = (result: OptimDemoResult, exercise: GeneratedExercise): string => {
  if (exercise.groupId == null || exercise.groupType == null) return 'ungrouped'
  const members = result.exercises
    .filter((item) => item.groupId === exercise.groupId && item.groupType === exercise.groupType)
    .map((item) => item.code)
  return `${exercise.groupType}:${members.join('|')}`
}

const isSubsequence = (needles: string[], haystack: string[]): boolean => {
  let cursor = 0
  for (const code of haystack) {
    if (code === needles[cursor]) cursor += 1
    if (cursor === needles.length) return true
  }
  return needles.length === 0
}

/**
 * Product-only accessory volume top-up: when exercise-count fill has done all
 * it can and the guided session still leaves a long requested window mostly
 * unused, copy each eligible lift's own final working set (same load, reps,
 * and rest) until the session reaches 90% of the request or the ceiling would
 * break. Grouped work, max-effort work, distance work, Olympic strength work,
 * and manually overridden counts are never touched, and each lift gains at
 * most one set. Recovered working sets are only ever added to, never edited.
 */
export function fillOptimExtraWorkingSetsToSessionTarget(
  result: OptimDemoResult,
  inputs: OptimDemoInputs,
): OptimDemoResult {
  if (inputs.durationFillExtraSetsEnabled !== true) return result
  if (inputs.nonCoreCountOverride != null || inputs.coreCountOverride != null) return result
  if (result.durationEstimate == null) return result
  const requestedMinutes = result.durationEstimate.requestedMinutes
  const guidedMinutes = estimateOptimGuidedSessionMinutes(result)
  if (
    guidedMinutes == null ||
    guidedMinutes >= requestedMinutes * OPTIM_EXTRA_SET_TARGET_UTILIZATION
  ) return result

  const working: OptimDemoResult = {
    ...result,
    exercises: result.exercises.map((exercise) => ({
      ...exercise,
      sets: [...exercise.sets],
      trace: [...exercise.trace],
    })),
    events: [...result.events],
  }
  const additions = new Map<string, number>()
  const ineligible = new Set<string>()
  const extraSetLimit = requestedMinutes >= OPTIM_LONG_WINDOW_EXTRA_SET_MINUTES
    ? OPTIM_LONG_WINDOW_EXTRA_SETS_PER_EXERCISE
    : OPTIM_EXTRA_SETS_PER_EXERCISE
  let addedSetCount = 0
  let currentGuided = guidedMinutes
  let progressed = true
  while (progressed && currentGuided < requestedMinutes * OPTIM_EXTRA_SET_TARGET_UTILIZATION) {
    progressed = false
    // Later lifts first: the top-up is accessory volume, not main-lift volume.
    for (let index = working.exercises.length - 1; index >= 0; index -= 1) {
      const exercise = working.exercises[index]!
      if (exercise.phase !== 'strength' && exercise.phase !== 'core') continue
      if (exercise.groupId != null || exercise.maxEffort) continue
      if (inputs.goal === 'olympic' && exercise.phase === 'strength') continue
      if (ineligible.has(exercise.code)) continue
      if ((additions.get(exercise.code) ?? 0) >= extraSetLimit) continue
      const lastNormal = [...exercise.sets].reverse().find((set) => set.setType === 'normal')
      if (!lastNormal || lastNormal.distanceMeters != null) continue

      const lastSetNumber = exercise.sets.at(-1)?.setNumber ?? exercise.sets.length
      exercise.sets.push({ ...lastNormal, setNumber: lastSetNumber + 1 })
      const nextGuided = estimateOptimGuidedSessionMinutes(working)
      if (nextGuided == null || nextGuided > requestedMinutes) {
        exercise.sets.pop()
        ineligible.add(exercise.code)
        continue
      }
      additions.set(exercise.code, (additions.get(exercise.code) ?? 0) + 1)
      exercise.trace.push('Product duration policy added one working set copied from this lift\'s own final working set to better use the requested window; load, reps, and rest are unchanged.')
      addedSetCount += 1
      currentGuided = nextGuided
      progressed = true
      if (currentGuided >= requestedMinutes * OPTIM_EXTRA_SET_TARGET_UTILIZATION) break
    }
  }
  if (addedSetCount === 0) return result
  working.events.push(
    `Product duration policy added ${addedSetCount} working set${addedSetCount === 1 ? '' : 's'} of accessory volume toward the requested ${requestedMinutes}-minute window; every added set copies its lift's own final working set and the hard ceiling was preserved.`,
  )
  return working
}

export function optimDurationFillCounts(
  inputs: OptimDemoInputs,
  result: OptimDemoResult,
): number[] {
  const strengthStageUtilization = estimateOptimStrengthStageUtilization(result)
  if (
    inputs.nonCoreCountOverride != null ||
    inputs.coreCountOverride != null ||
    inputs.goal === 'powerlifting' ||
    inputs.goal === 'olympic' ||
    result.durationEstimate == null ||
    strengthStageUtilization == null ||
    strengthStageUtilization >= OPTIM_DURATION_FILL_TARGET_UTILIZATION
  ) return []

  const availableNonCore = result.rankedCandidates.filter((candidate) => !candidate.isCore).length
  const hasCircuitGroup = inputs.circuitsEnabled && result.exercises.some((exercise) =>
    exercise.groupType === 'circuit' && exercise.groupId != null)
  const durationScaledLimit =
    !hasCircuitGroup && (inputs.bodyweightOnly || inputs.circuitsEnabled)
    ? OPTIM_RESTRICTED_DURATION_FILL_MAX_EXTRA_EXERCISES
    : Math.min(
        OPTIM_DURATION_FILL_MAX_EXTRA_EXERCISES,
        Math.max(1, Math.ceil(inputs.durationMinutes / 30)),
      )
  const maximum = Math.min(
    availableNonCore,
    result.counts.requestedNonCore + durationScaledLimit,
  )
  return Array.from(
    { length: Math.max(0, maximum - result.counts.requestedNonCore) },
    (_, index) => result.counts.requestedNonCore + index + 1,
  )
}

export function isOptimDurationFillImprovement(
  base: OptimDemoResult,
  candidate: OptimDemoResult,
  requestedMinutes: number,
): boolean {
  const baseDuration = base.durationEstimate?.projectedMinutes
  const candidateDuration = candidate.durationEstimate?.projectedMinutes
  const baseGuidedDuration = estimateOptimGuidedSessionMinutes(base)
  const candidateGuidedDuration = estimateOptimGuidedSessionMinutes(candidate)
  if (
    baseDuration == null ||
    candidateDuration == null ||
    baseGuidedDuration == null ||
    candidateGuidedDuration == null ||
    candidateGuidedDuration > requestedMinutes ||
    Math.abs(candidateGuidedDuration - requestedMinutes) >=
      Math.abs(baseGuidedDuration - requestedMinutes) ||
    candidateDuration <= baseDuration ||
    candidate.counts.generatedStrength < candidate.counts.requestedNonCore ||
    candidate.counts.generatedCore < candidate.counts.requestedCore ||
    optimWorkingSetCount(candidate) <= optimWorkingSetCount(base) ||
    !exerciseCodesAreUnique(candidate) ||
    !optionalStagesCompatible(base, candidate)
  ) return false

  const baseCore = base.exercises.filter((exercise) => exercise.phase === 'core')
  const candidateCore = candidate.exercises.filter((exercise) => exercise.phase === 'core')
  if (
    candidateCore.length < baseCore.length ||
    candidateCore.reduce((count, exercise) => count + normalSetCount(exercise), 0) <
      baseCore.reduce((count, exercise) => count + normalSetCount(exercise), 0)
  ) return false

  for (const groupType of ['superset', 'circuit'] as const) {
    if (
      base.exercises.some((exercise) => exercise.groupType === groupType) &&
      !candidate.exercises.some((exercise) => exercise.groupType === groupType)
    ) return false
  }

  const baseStrength = base.exercises.filter((exercise) => exercise.phase === 'strength')
  const candidateStrength = candidate.exercises.filter((exercise) => exercise.phase === 'strength')
  const protectedStrength = baseStrength.filter((exercise, index) =>
    index < 2 ||
    exercise.maxEffort ||
    exercise.trace.includes('Pinned by starting-exercise input'))
  if (!isSubsequence(
    protectedStrength.map((exercise) => exercise.code),
    candidateStrength.map((exercise) => exercise.code),
  )) return false

  return protectedStrength.every((exercise) => {
      const carried = candidate.exercises.find((item) =>
        item.code === exercise.code && item.phase === exercise.phase)
      return carried != null &&
        durationCarriedStrengthCompatible(exercise, carried) &&
        groupSignature(base, exercise) === groupSignature(candidate, carried)
    })
}

export function resolveOptimCoreRestoreTarget(
  inputs: OptimDemoInputs,
  result: OptimDemoResult,
): number | null {
  if (inputs.nonCoreCountOverride != null || inputs.coreCountOverride != null) return null
  const strengthBudget = result.durationEstimate?.strengthBudgetMinutes
  if (strengthBudget == null || strengthBudget <= 0) return null

  const computedNonCore = result.counts.computedNonCore
  const computedCore = result.counts.computedCore
  let priorCoreMaximum = computedCore
  for (let duration = 0; duration < strengthBudget; duration += 1) {
    const counts = calculateOptimExerciseCounts(duration, inputs.goal)
    if (counts.nonCore === computedNonCore) priorCoreMaximum = Math.max(priorCoreMaximum, counts.core)
  }
  return priorCoreMaximum > computedCore ? computedCore + 1 : null
}

export function isOptimCoreRestoreImprovement(
  base: OptimDemoResult,
  candidate: OptimDemoResult,
  requestedMinutes: number,
): boolean {
  const baseDuration = base.durationEstimate?.projectedMinutes
  const candidateDuration = candidate.durationEstimate?.projectedMinutes
  const candidateGuidedDuration = estimateOptimGuidedSessionMinutes(candidate)
  if (
    baseDuration == null ||
    candidateDuration == null ||
    candidateGuidedDuration == null ||
    candidateGuidedDuration > requestedMinutes ||
    candidateDuration <= baseDuration ||
    optimWorkingSetCount(candidate) <= optimWorkingSetCount(base)
  ) return false

  const baseStrength = phaseExercises(base, 'strength')
  const candidateStrength = phaseExercises(candidate, 'strength')
  const baseCore = phaseExercises(base, 'core')
  const candidateCore = phaseExercises(candidate, 'core')
  if (!sameCodes(baseStrength, candidateStrength)) return false
  if (
    candidateCore.length !== baseCore.length + 1 ||
    !baseCore.every((exercise, index) => exercise.code === candidateCore[index]?.code)
  ) return false

  const baseOptional = base.exercises.filter((exercise) =>
    exercise.phase !== 'strength' && exercise.phase !== 'core')
  const candidateOptional = candidate.exercises.filter((exercise) =>
    exercise.phase !== 'strength' && exercise.phase !== 'core')
  if (JSON.stringify(baseOptional) !== JSON.stringify(candidateOptional)) return false

  if (!baseStrength.every((exercise, index) => {
    const next = candidateStrength[index]
    return next != null && sameGroup(exercise, next) && carriedExerciseCompatible(exercise, next)
  })) return false

  const appendedCore = candidateCore.at(-1)
  return baseCore.every((exercise, index) => {
    const next = candidateCore[index]
    if (next == null || !carriedExerciseCompatible(exercise, next)) return false
    if (sameGroup(exercise, next)) return true
    if (
      exercise.groupId != null ||
      exercise.groupType != null ||
      next.groupId == null ||
      (next.groupType !== 'superset' && next.groupType !== 'circuit') ||
      appendedCore?.groupId !== next.groupId ||
      appendedCore.groupType !== next.groupType
    ) return false
    return candidate.exercises.filter((item) =>
      item.groupId === next.groupId && item.groupType === next.groupType).length === 2
  })
}
