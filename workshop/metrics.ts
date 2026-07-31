/**
 * ForgeWorkshop validators and quality metrics.
 *
 * Violations are hard invariants: any hit is a bug (or a mirror drift worth
 * understanding). Warnings are quality smells worth aggregating. Metrics are
 * neutral measurements the report layer aggregates and ranks.
 */
import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'
import type {
  OptimDemoResult,
  OptimDemoSplit,
} from '@justgains/shared/src/optim'
import type { MuscleBucketKey } from '@justgains/shared/src/utils/muscleUsage'

import type { GenerationOutcome, GenerationRequest, JourneySessionRecord, WorkshopCatalog } from './simulate'

const UPPER_BUCKETS = new Set<MuscleBucketKey>(['chest', 'shoulders', 'arms', 'back'])
const PHASE_RANK = {
  mobilityWarmup: 0,
  strength: 1,
  core: 1,
  cardio: 2,
  mobilityCooldown: 3,
} as const

export type ScenarioEvaluation = {
  violations: string[]
  warnings: string[]
  metrics: Record<string, number>
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

/** Mirror of the engine's split gate, driven by the emitted result + catalog tags. */
function splitViolation(
  split: OptimDemoSplit,
  goal: GenerationRequest['goal'],
  exercise: OptimDemoResult['exercises'][number],
  catalogItem: ExerciseListItem | undefined,
): string | null {
  if (exercise.phase !== 'strength') return null
  const bucket = exercise.primaryBucket
  if (!bucket || bucket === 'core' || split === 'fresh' || split === 'fullBody') return null
  if (split === 'upper') {
    return UPPER_BUCKETS.has(bucket) ? null : `upper split got ${bucket} (${exercise.code})`
  }
  if (split === 'lower') {
    return bucket === 'legs' ? null : `lower split got ${bucket} (${exercise.code})`
  }
  const tags = (catalogItem?.exerciseTags ?? []).map(normalize)
  const authored = tags.filter((tag) => tag === 'PUSH_SPLIT' || tag === 'PULL_SPLIT' || tag === 'LEGS_SPLIT')
  const trustAuthored = goal === 'powerlifting' || goal === 'olympic'
  if (authored.length > 0) {
    if (split === 'push' && authored.includes('PUSH_SPLIT') && (trustAuthored || UPPER_BUCKETS.has(bucket))) return null
    if (split === 'pull' && authored.includes('PULL_SPLIT') && (trustAuthored || UPPER_BUCKETS.has(bucket))) return null
  }
  const primaryMuscles = exercise.primaryMuscles.map(normalize)
  if (bucket === 'arms') {
    const isPushArm = primaryMuscles.some((muscle) => muscle.includes('TRICEPS'))
    const isPullArm = primaryMuscles.some((muscle) => /BICEPS|BRACHIAL|BRACHIORADIAL|FOREARM|WRIST/.test(muscle))
    if (isPushArm || isPullArm) {
      const allowed = split === 'push' ? isPushArm : isPullArm
      return allowed ? null : `${split} split got wrong-arm ${exercise.code}`
    }
  }
  if (split === 'push') {
    return bucket === 'chest' || bucket === 'shoulders' || bucket === 'arms'
      ? null
      : `push split got ${bucket} (${exercise.code})`
  }
  return bucket === 'back' || bucket === 'arms'
    ? null
    : `pull split got ${bucket} (${exercise.code})`
}

function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0)
  if (total <= 0) return 0
  let entropy = 0
  for (const count of counts) {
    if (count <= 0) continue
    const p = count / total
    entropy -= p * Math.log2(p)
  }
  return entropy
}

export function evaluateGeneration(
  catalog: WorkshopCatalog,
  request: GenerationRequest,
  outcome: GenerationOutcome,
): ScenarioEvaluation {
  const violations: string[] = []
  const warnings: string[] = []
  const metrics: Record<string, number> = {}
  const { result } = outcome
  const strength = result.exercises.filter((exercise) => exercise.phase === 'strength')
  const core = result.exercises.filter((exercise) => exercise.phase === 'core')
  const lifts = [...strength, ...core]

  if (result.exercises.length === 0) violations.push('empty workout')

  // Duplicates within the lifting phases.
  const seenCodes = new Set<string>()
  for (const exercise of lifts) {
    const code = normalize(exercise.code)
    if (seenCodes.has(code)) violations.push(`duplicate lift ${code}`)
    seenCodes.add(code)
  }

  // Phase ordering must be warmup → lifts → cardio → cooldown.
  let lastRank = -1
  for (const exercise of result.exercises) {
    const rank = PHASE_RANK[exercise.phase]
    if (rank < lastRank) {
      violations.push(`phase order broke at ${exercise.code} (${exercise.phase})`)
      break
    }
    lastRank = rank
  }

  for (const exercise of result.exercises) {
    const catalogItem = catalog.byCode.get(normalize(exercise.code))
    if (!catalogItem && exercise.phase !== 'mobilityWarmup' && exercise.phase !== 'mobilityCooldown') {
      violations.push(`selected exercise missing from catalog: ${exercise.code}`)
      continue
    }

    const splitProblem = splitViolation(request.split, request.goal, exercise, catalogItem)
    if (splitProblem) violations.push(splitProblem)

    // Equipment feasibility for restricted gear.
    if (request.gear !== 'full' && catalogItem) {
      const availableEquipment = new Set(
        request.gear === 'bodyweight' ? [] : catalog.homeEquipmentCodes,
      )
      const requiredCodes = (catalogItem.exerciseEquipment?.required ?? [])
        .flat()
        .map(normalize)
        .filter(Boolean)
      const missing = requiredCodes.filter((code) => !availableEquipment.has(code))
      if (missing.length > 0) {
        violations.push(`${exercise.code} needs unavailable equipment ${missing.join('+')}`)
      }
    }

    let topWorkingWeight = 0
    let topWarmupWeight = 0
    for (const set of exercise.sets) {
      if (set.restSeconds < 0 || set.restSeconds > 300) {
        violations.push(`${exercise.code} rest ${set.restSeconds}s out of range`)
      }
      if (set.reps != null && (set.reps < 1 || set.reps > 40)) {
        violations.push(`${exercise.code} reps ${set.reps} out of range`)
      }
      if (set.reps != null && set.reps > 25) warnings.push(`${exercise.code} high reps ${set.reps}`)
      if (set.targetRpe != null && (set.targetRpe < 6 || set.targetRpe > 10)) {
        violations.push(`${exercise.code} target RPE ${set.targetRpe} out of range`)
      }
      if (set.weightKg != null) {
        if (set.weightKg <= 0 || set.weightKg > 500) {
          violations.push(`${exercise.code} weight ${set.weightKg}kg out of range`)
        }
        if (Math.abs(set.weightKg * 4 - Math.round(set.weightKg * 4)) > 1e-6) {
          warnings.push(`${exercise.code} unrounded weight ${set.weightKg}kg`)
        }
        if (request.gear === 'bodyweight') {
          violations.push(`bodyweight-only plan prescribed ${set.weightKg}kg on ${exercise.code}`)
        }
        if (set.setType === 'warmup') topWarmupWeight = Math.max(topWarmupWeight, set.weightKg)
        else topWorkingWeight = Math.max(topWorkingWeight, set.weightKg)
      }
    }
    if (topWarmupWeight > 0 && topWorkingWeight > 0 && topWarmupWeight >= topWorkingWeight) {
      violations.push(`${exercise.code} warmup ${topWarmupWeight}kg >= working ${topWorkingWeight}kg`)
    }
  }

  // Grouping integrity on the adapted output (what the editor actually gets).
  let runLength = 0
  let runType: string | null = null
  let runId: number | null = null
  const closeRun = () => {
    if (runId == null) return
    if (runLength < 2) violations.push(`stranded ${runType} group ${runId}`)
    if (runType === 'SUPERSET' && runLength !== 2) {
      violations.push(`superset group ${runId} has ${runLength} members`)
    }
    if (runType === 'CIRCUIT' && runLength > 4) {
      warnings.push(`circuit group ${runId} has ${runLength} members`)
    }
  }
  for (const entry of outcome.workoutData) {
    const id = entry.exerciseGroupId ?? null
    const type = entry.exerciseGroupType ?? null
    if (id !== runId || type !== runType) {
      closeRun()
      runId = id
      runType = type
      runLength = id == null ? 0 : 1
    } else if (id != null) {
      runLength += 1
    }
  }
  closeRun()

  if (outcome.missingCatalogCodes.length > 0) {
    violations.push(`adapter missing catalog codes: ${outcome.missingCatalogCodes.join(', ')}`)
  }
  for (const entry of outcome.workoutData) {
    for (const set of entry.exerciseData ?? []) {
      if (set.setCompleted) violations.push(`${entry.exerciseCode} emitted a completed set`)
      for (const measurement of set.setMeasurements ?? []) {
        if (measurement.measurementValue != null) {
          violations.push(`${entry.exerciseCode} emitted a logged value (${measurement.measurementCode})`)
        }
      }
    }
  }

  // Duration honesty: overruns must be confessed via notice.
  const requested = request.durationMinutes
  const guided = outcome.guidedMinutes
  if (guided != null) {
    const allowance = Math.max(1, requested * 0.02)
    if (guided > requested + allowance && !outcome.notices.includes('durationOverrun')) {
      violations.push(`silent overrun: guided ${guided.toFixed(1)}m for ${requested}m target`)
    }
    metrics.utilization = guided / requested
  }
  if (request.cardio && !result.exercises.some((exercise) => exercise.phase === 'cardio') &&
    !outcome.notices.includes('cardioOmitted')) {
    violations.push('cardio requested, absent, and unconfessed')
  }
  if (request.cooldown && !result.exercises.some((exercise) => exercise.phase === 'mobilityCooldown') &&
    !outcome.notices.includes('cooldownOmitted')) {
    violations.push('cooldown requested, absent, and unconfessed')
  }

  // Quality metrics.
  metrics.strengthCount = strength.length
  metrics.coreCount = core.length
  metrics.cardioCount = result.exercises.filter((exercise) => exercise.phase === 'cardio').length
  metrics.mobilityCount = result.exercises.filter(
    (exercise) => exercise.phase === 'mobilityWarmup' || exercise.phase === 'mobilityCooldown',
  ).length
  metrics.fillRatio = (result.counts.requestedNonCore + result.counts.requestedCore) > 0
    ? (result.counts.generatedStrength + result.counts.generatedCore) /
      (result.counts.requestedNonCore + result.counts.requestedCore)
    : 1
  metrics.elapsedMs = outcome.elapsedMs
  metrics.noticeCount = outcome.notices.length

  const weightCapable = lifts.filter((exercise) => {
    const item = catalog.byCode.get(normalize(exercise.code))
    return (item?.exerciseMeasurements ?? []).map((m) => normalize(String(m))).includes('WEIGHT')
  })
  metrics.loadCoverage = weightCapable.length === 0
    ? 1
    : weightCapable.filter((exercise) =>
        exercise.sets.some((set) => set.setType === 'normal' && set.weightKg != null),
      ).length / weightCapable.length

  const bucketSetCounts = new Map<string, number>()
  for (const exercise of lifts) {
    if (!exercise.primaryBucket) continue
    const workingSets = exercise.sets.filter((set) => set.setType === 'normal').length
    bucketSetCounts.set(
      exercise.primaryBucket,
      (bucketSetCounts.get(exercise.primaryBucket) ?? 0) + workingSets,
    )
  }
  metrics.uniqueBuckets = bucketSetCounts.size
  metrics.bucketEntropy = shannonEntropy([...bucketSetCounts.values()])

  let equipmentSwitches = 0
  for (let index = 1; index < strength.length; index += 1) {
    const previous = new Set(strength[index - 1]!.equipmentCodes)
    const current = strength[index]!.equipmentCodes
    if (current.length > 0 && previous.size > 0 && !current.some((code) => previous.has(code))) {
      equipmentSwitches += 1
    }
  }
  metrics.equipmentSwitches = equipmentSwitches

  if (metrics.fillRatio < 0.75 && request.gear === 'full' &&
    !outcome.notices.includes('durationShortfall')) {
    warnings.push(`quiet underfill: ${result.counts.generatedStrength + result.counts.generatedCore} of ${result.counts.requestedNonCore + result.counts.requestedCore} lifts`)
  }

  return { violations, warnings, metrics }
}

/** Jaccard distance between the lift selections of two results — the shuffle payoff. */
export function selectionJaccard(first: OptimDemoResult, second: OptimDemoResult): number {
  const firstCodes = new Set(
    first.exercises.filter((e) => e.phase === 'strength' || e.phase === 'core').map((e) => normalize(e.code)),
  )
  const secondCodes = new Set(
    second.exercises.filter((e) => e.phase === 'strength' || e.phase === 'core').map((e) => normalize(e.code)),
  )
  if (firstCodes.size === 0 && secondCodes.size === 0) return 1
  let intersection = 0
  for (const code of firstCodes) if (secondCodes.has(code)) intersection += 1
  const union = firstCodes.size + secondCodes.size - intersection
  return union === 0 ? 1 : intersection / union
}

export type JourneyEvaluation = {
  key: string
  personaKey: string
  sessionCount: number
  violationCount: number
  warningCount: number
  perSession: ScenarioEvaluation[]
  /** Working sets per bucket across the whole journey. */
  bucketTotals: Record<string, number>
  /** min/max working-set share across trained buckets over the journey (1 = perfectly even). */
  bucketBalance: number
  /** Buckets receiving under 8% of working sets while gear allowed them. */
  neglectedBuckets: string[]
  /** Mean usage of the buckets the generator picked minus mean usage overall (negative = fresher picks). */
  freshRecoveryRespect: number | null
  /** Mean lift-selection overlap with the previous 3 sessions (lower = more variety). */
  repeatRatio: number | null
  /** Accessory-only overlap: pattern lifts repeat by design, accessories should rotate. */
  accessoryRepeatRatio: number | null
  /** Exact same lift set as an earlier session within the window. */
  exactRepeatCount: number
  /** Same-day/next-morning sessions: primary-bucket overlap with the previous session. */
  doubleDayBucketOverlap: number | null
  /** Median |prescribed − ideal| / ideal for returning exercises with history. */
  prescriptionError: number | null
  /** Fraction of returning weighted lifts whose prescribed load rose across the journey. */
  progressionShare: number | null
}

export function evaluateJourney(
  catalog: WorkshopCatalog,
  key: string,
  personaKey: string,
  records: JourneySessionRecord[],
): JourneyEvaluation {
  const perSession = records.map((record) =>
    evaluateGeneration(catalog, record.request, record.outcome),
  )

  const bucketTotals: Record<string, number> = {}
  for (const record of records) {
    for (const exercise of record.outcome.result.exercises) {
      if (exercise.phase !== 'strength' && exercise.phase !== 'core') continue
      if (!exercise.primaryBucket) continue
      const workingSets = exercise.sets.filter((set) => set.setType === 'normal').length
      bucketTotals[exercise.primaryBucket] =
        (bucketTotals[exercise.primaryBucket] ?? 0) + workingSets
    }
  }
  const totals = Object.values(bucketTotals)
  const totalSets = totals.reduce((sum, value) => sum + value, 0)
  const bucketBalance = totals.length > 1 ? Math.min(...totals) / Math.max(...totals) : 1
  const neglectedBuckets = totalSets > 0
    ? Object.entries(bucketTotals)
        .filter(([, sets]) => sets / totalSets < 0.08)
        .map(([bucket]) => bucket)
    : []

  // Fresh-split recovery respect, skipping the cold first session. Specialized
  // goals train the same sport patterns by definition, so they are excluded
  // rather than reported as recovery disrespect.
  const freshDeltas: number[] = []
  for (const record of records) {
    if (record.request.split !== 'fresh' || record.index === 0) continue
    if (record.request.goal === 'olympic' || record.request.goal === 'powerlifting') continue
    const usage = record.muscleUsageAtGeneration
    const usageValues = Object.values(usage)
    if (usageValues.length === 0) continue
    const overallMean = usageValues.reduce((sum, value) => sum + value, 0) / usageValues.length
    const picked = record.outcome.result.exercises
      .filter((exercise) => exercise.phase === 'strength' && exercise.primaryBucket && exercise.primaryBucket !== 'core')
      .map((exercise) => usage[exercise.primaryBucket!] ?? 0)
    if (picked.length === 0) continue
    const pickedMean = picked.reduce((sum, value) => sum + value, 0) / picked.length
    freshDeltas.push(pickedMean - overallMean)
  }

  const liftSetOf = (record: JourneySessionRecord) => new Set(
    record.outcome.result.exercises
      .filter((exercise) => exercise.phase === 'strength' || exercise.phase === 'core')
      .map((exercise) => normalize(exercise.code)),
  )
  // Mirrors the engine's name-derived movement patterns: pattern lifts are
  // deliberately repeated for progression continuity, so only accessory
  // repetition counts against variety.
  const isPatternLift = (name: string) =>
    /SNATCH|CLEAN|JERK|DEADLIFT|SQUAT|BENCH.*PRESS|CHEST.*PRESS|OVERHEAD.*PRESS|SHOULDER.*PRESS|MILITARY.*PRESS|PUSH.?PRESS|PULL.?UP|CHIN.?UP|LUNGE|HIP.?THRUST/.test(name) ||
    /(?:^|[^A-Z])ROW(?:$|[^A-Z])/.test(name)
  const accessorySetOf = (record: JourneySessionRecord) => new Set(
    record.outcome.result.exercises
      .filter((exercise) =>
        (exercise.phase === 'strength' || exercise.phase === 'core') &&
        !isPatternLift(normalize(exercise.name || exercise.code)))
      .map((exercise) => normalize(exercise.code)),
  )
  const repeatRatios: number[] = []
  const accessoryRepeatRatios: number[] = []
  let exactRepeatCount = 0
  for (let index = 1; index < records.length; index += 1) {
    const current = liftSetOf(records[index]!)
    if (current.size === 0) continue
    const window = new Set<string>()
    const accessoryWindow = new Set<string>()
    for (let back = Math.max(0, index - 3); back < index; back += 1) {
      for (const code of liftSetOf(records[back]!)) window.add(code)
      for (const code of accessorySetOf(records[back]!)) accessoryWindow.add(code)
    }
    let overlap = 0
    for (const code of current) if (window.has(code)) overlap += 1
    repeatRatios.push(overlap / current.size)
    const currentAccessories = accessorySetOf(records[index]!)
    if (currentAccessories.size > 0) {
      let accessoryOverlap = 0
      for (const code of currentAccessories) if (accessoryWindow.has(code)) accessoryOverlap += 1
      accessoryRepeatRatios.push(accessoryOverlap / currentAccessories.size)
    }
    for (let back = Math.max(0, index - 3); back < index; back += 1) {
      const earlier = liftSetOf(records[back]!)
      if (earlier.size === current.size && [...current].every((code) => earlier.has(code))) {
        exactRepeatCount += 1
        break
      }
    }
  }

  const doubleDayOverlaps: number[] = []
  for (let index = 1; index < records.length; index += 1) {
    const record = records[index]!
    if (record.daysSincePrevious == null || record.daysSincePrevious > 0.5) continue
    const previousBuckets = new Set(
      records[index - 1]!.outcome.result.exercises
        .filter((exercise) => exercise.phase === 'strength' && exercise.primaryBucket)
        .map((exercise) => exercise.primaryBucket!),
    )
    const currentBuckets = records[index]!.outcome.result.exercises
      .filter((exercise) => exercise.phase === 'strength' && exercise.primaryBucket)
      .map((exercise) => exercise.primaryBucket!)
    if (currentBuckets.length === 0) continue
    const overlap = currentBuckets.filter((bucket) => previousBuckets.has(bucket)).length
    doubleDayOverlaps.push(overlap / currentBuckets.length)
  }

  // Prescription accuracy for lifts the athlete has already trained.
  const firstSeenSession = new Map<string, number>()
  const errors: number[] = []
  const loadSeries = new Map<string, number[]>()
  for (const record of records) {
    for (const sample of record.completion.loadAccuracy) {
      if (!firstSeenSession.has(sample.code)) {
        firstSeenSession.set(sample.code, record.index)
      } else {
        errors.push(Math.abs(sample.relativeError))
      }
      const series = loadSeries.get(sample.code) ?? []
      series.push(sample.prescribedKg)
      loadSeries.set(sample.code, series)
    }
  }
  errors.sort((left, right) => left - right)
  const prescriptionError = errors.length > 0
    ? errors[Math.floor(errors.length / 2)]!
    : null
  let progressed = 0
  let returning = 0
  for (const series of loadSeries.values()) {
    if (series.length < 2) continue
    returning += 1
    if (series[series.length - 1]! > series[0]!) progressed += 1
  }

  const mean = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length

  return {
    key,
    personaKey,
    sessionCount: records.length,
    violationCount: perSession.reduce((sum, evaluation) => sum + evaluation.violations.length, 0),
    warningCount: perSession.reduce((sum, evaluation) => sum + evaluation.warnings.length, 0),
    perSession,
    bucketTotals,
    bucketBalance,
    neglectedBuckets,
    freshRecoveryRespect: mean(freshDeltas),
    repeatRatio: mean(repeatRatios),
    accessoryRepeatRatio: mean(accessoryRepeatRatios),
    exactRepeatCount,
    doubleDayBucketOverlap: mean(doubleDayOverlaps),
    prescriptionError,
    progressionShare: returning > 0 ? progressed / returning : null,
  }
}
