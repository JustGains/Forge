import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'
import type { ExerciseSet } from '@justgains/shared/src/api/types/ExerciseSet'
import type { Workout } from '@justgains/shared/src/api/types/Workout'
import {
  convertGymLbsToKg,
  convertKgToGymLbs,
} from '@justgains/shared/src/utils/measurementUtils'
import {
  resolvePlateLoadingMode,
  type PlateLoadingMode,
} from '@justgains/shared/src/utils/plateLoading'

import {
  calculatePlatesForWeight,
  WEIGHT_CONFIGS,
  type MeasurementSystem,
} from '../utils/WeightConfig'
import {
  MUSCLE_BUCKETS,
  getMuscleBucket,
  type MuscleBucketKey,
  type MuscleUsageStats,
} from '../utils/muscleUsage'

import schemeTablesJson from './optimSchemeTables.json'
import {
  getOptimExerciseBodyweightMetadata,
  type OptimExerciseBodyweightMetadata,
} from './optimExerciseBodyweightMetadata'
import {
  getOptimExerciseMetadata,
  type OptimExerciseMetadata,
} from './optimExerciseMetadata'
import {
  getOptimExerciseLoadModeMetadata,
  type OptimExerciseLoadModeMetadata,
} from './optimExerciseLoadModeMetadata'
import {
  getOptimExerciseRelationshipMetadata,
  getOptimExerciseProductAwareRelationshipMetadata,
  type OptimExerciseRelationshipMetadata,
} from './optimExerciseRelationshipMetadata'
import { getOptimExercisePrescriptionMetadata } from './optimExercisePrescriptionMetadata'
import { getOptimExerciseSafetyMetadata } from './optimExerciseSafetyMetadata'
import {
  getOptimExerciseProductAwareWarmStartPrediction,
  getOptimExerciseWarmStartPrediction,
} from './optimExerciseWarmStartMetadata'

export type OptimDemoGoal =
  | 'strength'
  | 'bodybuilding'
  | 'general'
  | 'muscleTone'
  | 'powerlifting'
  | 'olympic'

export type OptimDemoExperience = 'beginner' | 'intermediate' | 'advanced'
export type OptimDemoSplit =
  | 'fresh'
  | 'fullBody'
  | 'upper'
  | 'lower'
  | 'push'
  | 'pull'

export type OptimDemoInputs = {
  durationMinutes: number
  goal: OptimDemoGoal
  experience: OptimDemoExperience
  split: OptimDemoSplit
  bodyweightOnly: boolean
  circuitsEnabled: boolean
  /** Opt-in product policy; absent/false retains recovered session-wide circuit load behavior. */
  circuitLoadGuidanceEnabled?: boolean
  /** Product-only classifier fix for safe unweighted bodyweight pattern circuits. */
  bodyweightCircuitPatternGroupingEnabled?: boolean
  /** Product-only classifier fix for guided loaded accessories under the general goal. */
  generalAccessoryCircuitGroupingEnabled?: boolean
  /** Product-only core-phase pairing; omitted/false preserves recovered tier restrictions on core work. */
  corePhasePairGroupingEnabled?: boolean
  /** Product-only pairing for accessories whose tier-one label is popularity-inferred; authored tiers keep the strict boundary. */
  inferredAccessoryPairGroupingEnabled?: boolean
  /** Product-only partner ordering: pull a compatible group partner adjacent instead of pairing only accidental neighbors. Prescriptions, pinned lifts, and phases are preserved. */
  groupPartnerReorderEnabled?: boolean
  /** Product-only timed-circuit rest policy for JustGains sequential interval order. */
  timedCircuitSequentialRestEnabled?: boolean
  supersetsEnabled?: boolean
  /** Product-only same-station policy; omitted/false preserves exact equipment matching. */
  supersetStationSharingEnabled?: boolean
  /** Product-only technical-lift policy; omitted/false preserves recovered Olympic schemes. */
  olympicTechnicalPrescriptionsEnabled?: boolean
  /** Product-only high-confidence rep caps; omitted/false preserves recovered schemes. */
  prescriptionRepCapsEnabled?: boolean
  /** Product-only logged-effort history; omitted/false preserves recovered max estimation. */
  rpeAwareHistoryEnabled?: boolean
  /** Product-only measured-effort hold; omitted/false preserves recovered capability scaling. */
  measuredEffortCapabilityHoldEnabled?: boolean
  /** Product-only bounded catch-up past the recovered 107% anticipation cap when a logged RPE proves the session was easy; omitted/false preserves the recovered cap. */
  loggedEffortCatchUpEnabled?: boolean
  /** Product-only one-hop cold start; omitted/false preserves direct warm-start behavior. */
  relationshipWarmStartEnabled?: boolean
  /** Product-only exact-identity relationship overlay; omitted/false preserves legacy adaptation. */
  productRelationshipOverlayEnabled?: boolean
  /** Product-only exact-source overlay; omitted/false preserves the legacy warm-start dataset. */
  productWarmStartOverlayEnabled?: boolean
  /** Product-only bodyweight gear honesty; omitted/false preserves recovered external-load cadence. */
  bodyweightOnlyLoadExclusionEnabled?: boolean
  /** Product-only truthful cardio budgeting; omitted/false preserves recovered minutes-based reservation. */
  cardioReservationMatchesEmittedEnabled?: boolean
  /** Product-only accessory volume top-up toward a long requested window; omitted/false keeps recovered working-set counts. */
  durationFillExtraSetsEnabled?: boolean
  warmupSetsEnabled: boolean
  mobilityWarmupEnabled: boolean
  mobilityCooldownEnabled: boolean
  cardioEnabled: boolean
  executableLoadsEnabled?: boolean
  /** Rack units used only for executable plate snapping; omitted legacy inputs remain metric. */
  executableLoadMeasurementSystem?: MeasurementSystem
  availableEquipmentCodes: string[]
  selectedMuscleBuckets: MuscleBucketKey[]
  selectedCardioExerciseCodes: string[]
  startingExerciseCodes: string[]
  focusExerciseCodes: string[]
  excludedExerciseCodes: string[]
  manualRecoveryPercent: Partial<Record<MuscleBucketKey, number>>
  seed: number
  generationDateIso: string
  nonCoreCountOverride?: number | null
  coreCountOverride?: number | null
}

function getWarmStartPrediction(
  exercise: Pick<ExerciseListItem, 'exerciseCode'>,
  inputs: OptimDemoInputs,
  gender: string | null,
  ageYears: number | null,
) {
  const profile = {
    gender,
    goal: inputs.goal,
    experience: inputs.experience,
    ageYears,
  }
  return inputs.productWarmStartOverlayEnabled === true
    ? getOptimExerciseProductAwareWarmStartPrediction(exercise, profile)
    : getOptimExerciseWarmStartPrediction(exercise, profile)
}

export type OptimDemoUserContext = {
  exercises: ExerciseListItem[]
  completedWorkouts: Workout[]
  muscleUsageStats: MuscleUsageStats
  bodyWeightKg?: number | null
  gender?: string | null
  ageYears?: number | null
  fitnessGoals?: string[] | null
  injuries?: string[] | null
}

export type OptimScoreBreakdown = {
  catalogRating: number
  muscleFreshness: number
  historyRecency: number
  primaryMuscleUtility: number
  focusUtility: number
  userRating: number
  sportFoundationUtility?: number
}

export type OptimDemoSet = {
  setNumber: number
  setType: 'warmup' | 'normal'
  reps?: number
  durationSeconds?: number
  distanceMeters?: number
  weightKg?: number
  /** Planned effort persisted through the canonical RPE measurement when present. */
  targetRpe?: number
  restSeconds: number
}

export type OptimDemoExercise = {
  code: string
  name: string
  isUnilateral?: true
  isWeightPerSide?: true
  phase: 'mobilityWarmup' | 'strength' | 'core' | 'cardio' | 'mobilityCooldown'
  primaryBucket: MuscleBucketKey | null
  primaryMuscles: string[]
  equipmentCodes: string[]
  score: number | null
  scoreBreakdown: OptimScoreBreakdown | null
  rank: number | null
  schemeSource: string
  maxEffort: boolean
  weightedBodyweight: boolean
  theoreticalMaxKg: number | null
  groupId: number | null
  groupType: 'circuit' | 'superset' | null
  sets: OptimDemoSet[]
  trace: string[]
}

export type OptimRejectedCandidate = {
  code: string
  name: string
  reasons: string[]
}

export type OptimRankedCandidate = {
  code: string
  name: string
  score: number
  primaryBucket: MuscleBucketKey | null
  isCore: boolean
  breakdown: OptimScoreBreakdown
  pool?: 'strengthFoundation'
}

export type OptimDemoResult = {
  generatedAt: string
  foundationFallback?: boolean
  durationEstimate?: {
    requestedMinutes: number
    projectedMinutes: number
    utilization: number
    /** Product-only estimate that adds the engine's transition allowance. */
    sessionProjectedMinutes?: number
    /** Product-only session estimate divided by the requested window. */
    sessionUtilization?: number
    /** Internal strength-stage budget exposed for additive product policies. */
    strengthBudgetMinutes?: number
  }
  counts: {
    computedNonCore: number
    computedCore: number
    requestedNonCore: number
    requestedCore: number
    generatedStrength: number
    generatedCore: number
    generatedCardio: number
    generatedMobility: number
    foundationNonCore?: number
  }
  muscleUsage: Record<MuscleBucketKey, number>
  recoveryWindowDays: number
  availabilityRatio: number
  exercises: OptimDemoExercise[]
  rankedCandidates: OptimRankedCandidate[]
  rejectedCandidates: OptimRejectedCandidate[]
  events: string[]
  dataNotes: string[]
}

type Scheme = { sets: number; reps: number; weight: number }
type SchemeTableName = keyof typeof schemeTablesJson
type MovementPattern =
  | 'bench'
  | 'clean'
  | 'deadlift'
  | 'hipThrust'
  | 'jerk'
  | 'lunge'
  | 'overheadPress'
  | 'pullUp'
  | 'row'
  | 'snatch'
  | 'squat'
const PRIMARY_LIFT_BUCKETS: Record<MovementPattern, ReadonlySet<MuscleBucketKey>> = {
  bench: new Set(['chest', 'arms']),
  clean: new Set(['legs', 'back', 'shoulders']),
  deadlift: new Set(['legs', 'back']),
  hipThrust: new Set(['legs']),
  jerk: new Set(['legs', 'back', 'shoulders']),
  lunge: new Set(['legs']),
  overheadPress: new Set(['shoulders', 'chest']),
  pullUp: new Set(['back', 'arms']),
  row: new Set(['back']),
  snatch: new Set(['legs', 'back', 'shoulders']),
  squat: new Set(['legs']),
}
type FullBodyRole = 'lower' | 'pull' | 'push'
type AdaptedExercise = {
  source: ExerciseListItem
  code: string
  name: string
  tags: string[]
  type: string
  measurements: string[]
  requiredEquipmentGroups: string[][]
  equipmentCodes: string[]
  hasUnresolvedDedicatedMachineEquipment: boolean
  variantKey: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  primaryBucket: MuscleBucketKey | null
  secondaryBuckets: MuscleBucketKey[]
  targetPercentage: number
  rating: number
  tier: number
  bodyTier: number
  powerTier: number
  olympicTier: number
  level: number
  repsScale: 0 | 1 | 2
  isBodyweight: boolean
  isCardio: boolean
  isMobility: boolean
  isTimed: boolean
  isDistance: boolean
  isAssisted: boolean
  isUnilateral: boolean
  isWeightPerSide: boolean
  isCore: boolean
  isBand: boolean
  isPrimaryLift: boolean
  isMainLift: boolean
  movementPattern: MovementPattern | null
  metadata: OptimExerciseMetadata | null
  relationship: OptimExerciseRelationshipMetadata | null
  bodyweightMetadata: OptimExerciseBodyweightMetadata | null
}

type HistoryObservation = {
  dateMs: number
  theoreticalMaxKg: number
  recommendedTheoreticalMaxKg: number | null
  actualRpeMeasured?: boolean
}
type RepObservation = {
  dateMs: number
  maxReps: number
  recommendedMaxReps: number | null
}
type ExerciseHistory = {
  lastUsedAtMs: number
  workoutCount: number
  completedSets: number
  observations: HistoryObservation[]
  repObservations: RepObservation[]
  observedWeightsKg: number[]
}

type ScoredExercise = {
  exercise: AdaptedExercise
  score: number
  breakdown: OptimScoreBreakdown
  rank: number
}

type SelectedExercise = {
  scored: ScoredExercise
  position: number
  core: boolean
  backup: boolean
  starting: boolean
  loadFallback: boolean
  selectionGoal: OptimDemoGoal
  strengthFoundation: boolean
}

const schemeTables = schemeTablesJson as Record<SchemeTableName, Scheme[]>
const DAY_MS = 24 * 60 * 60 * 1000
const BUCKETS = MUSCLE_BUCKETS.map(({ key }) => key)
const UPPER_BUCKETS = new Set<MuscleBucketKey>(['chest', 'shoulders', 'arms', 'back'])
const CARDIO_TYPES = new Set(['DISTANCE_DURATION', 'WALKING', 'CYCLING', 'TREADMILL', 'ROWING', 'SWIMMING', 'STEPS'])
const MOBILITY_TYPES = new Set(['STATIC_STRETCHES', 'YOGA'])
const CARDIO_NEAR_TIE_TOLERANCE = 0.1
const SCORE_COMPARISON_EPSILON = 1e-9
const MAX_STRENGTH_REORDER_EXERCISES = 24
const POWERLIFTING_FOUNDATION_HIGH_PATTERNS = new Set<MovementPattern>(['squat', 'deadlift', 'bench', 'overheadPress'])
const POWERLIFTING_FOUNDATION_MEDIUM_PATTERNS = new Set<MovementPattern>(['row', 'pullUp', 'lunge', 'hipThrust'])
const OLYMPIC_FOUNDATION_HIGH_PATTERNS = new Set<MovementPattern>(['clean', 'snatch', 'jerk', 'squat', 'deadlift', 'overheadPress'])
const OLYMPIC_FOUNDATION_MEDIUM_PATTERNS = new Set<MovementPattern>(['row', 'pullUp', 'lunge', 'hipThrust', 'bench'])

export const OPTIM_GOALS: { value: OptimDemoGoal; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'bodybuilding', label: 'Bodybuilding' },
  { value: 'general', label: 'General fitness' },
  { value: 'muscleTone', label: 'Muscle tone' },
  { value: 'powerlifting', label: 'Powerlifting' },
  { value: 'olympic', label: 'Olympic' },
]

export const OPTIM_EXPERIENCES: { value: OptimDemoExperience; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

export const OPTIM_SPLITS: { value: OptimDemoSplit; label: string }[] = [
  { value: 'fresh', label: 'Fresh' },
  { value: 'fullBody', label: 'Full body' },
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
]

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, places = 3): number {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

function normalizeCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / DAY_MS)
}

function tagsOf(exercise: ExerciseListItem): string[] {
  return (exercise.exerciseTags ?? []).map(normalizeCode).filter(Boolean)
}

const NAME_IMPLIED_EQUIPMENT: ReadonlyArray<{
  leadingNamePattern: RegExp
  code: string
  corroboratingCodePattern?: RegExp
  corroboratingNamePattern?: RegExp
}> = [
  { leadingNamePattern: /^DUMBBELL\b/, code: 'DUMBBELLS', corroboratingCodePattern: /^DUMBBELL(?:\b|[._-])/, corroboratingNamePattern: /\bDUMBBELL\b/ },
  { leadingNamePattern: /^KETTLEBELL\b/, code: 'KETTLEBELLS', corroboratingCodePattern: /^KETTLEBELL(?:\b|[._-])/, corroboratingNamePattern: /\bKETTLEBELL\b/ },
  { leadingNamePattern: /^BARBELL\b/, code: 'BARBELL', corroboratingCodePattern: /^BARBELL(?:\b|[._-])/, corroboratingNamePattern: /\bBARBELL\b/ },
  { leadingNamePattern: /^CABLE\b/, code: 'SINGLE_CABLE_MACHINE', corroboratingCodePattern: /^CABLE(?:\b|[._-])/, corroboratingNamePattern: /\bCABLE\b/ },
  { leadingNamePattern: /^EZ[ -]?BAR(?:BELL)?\b/, code: 'EZ_CURL_BAR', corroboratingCodePattern: /^EZ(?:[._ -]?BAR|[._-]?BARBELL)(?:\b|[._-])/, corroboratingNamePattern: /\bEZ[ -]?BAR(?:BELL)?\b/ },
  { leadingNamePattern: /^SMITH(?: MACHINE)?\b/, code: 'SMITH_MACHINE', corroboratingCodePattern: /^SMITH(?:\b|[._-])/, corroboratingNamePattern: /\bSMITH(?: MACHINE)?\b/ },
  { leadingNamePattern: /^(?:TRX|SUSPENSION|SUSPENDER)\b/, code: 'SUSPENSION_TRAINER_OR_TRX', corroboratingCodePattern: /^(?:TRX|SUSPENSION|SUSPENDER)(?:\b|[._-])/, corroboratingNamePattern: /\b(?:TRX|SUSPENSION|SUSPENDER)\b/ },
  { leadingNamePattern: /^(?:RESISTANCE[ -]?BAND|BAND)\b/, code: 'RESISTANCE_BANDS', corroboratingCodePattern: /^(?:RESISTANCE[._-]?BAND|BAND)(?:\b|[._-])/, corroboratingNamePattern: /\b(?:RESISTANCE[ -]?BAND|BAND)\b/ },
  { leadingNamePattern: /^LANDMINE\b/, code: 'LANDMINE_ATTACHMENT', corroboratingCodePattern: /^LANDMINE(?:\b|[._-])/, corroboratingNamePattern: /\bLANDMINE\b/ },
  { leadingNamePattern: /^MEDICINE[ -]?BALL\b/, code: 'MEDICINE_BALL', corroboratingCodePattern: /^MEDICINE[._-]?BALL(?:\b|[._-])/, corroboratingNamePattern: /\bMEDICINE[ -]?BALL\b/ },
  { leadingNamePattern: /^SKI[ -]?ERG(?:OMETER)?\b/, code: 'CARDIO_SKI_MACHINE', corroboratingCodePattern: /^SKI[._-]?ERG/, corroboratingNamePattern: /\bSKI\b/ },
  { leadingNamePattern: /^(?:FOAM[ -]?ROLL|ROLL\.)/, code: 'FOAM_ROLLER' },
  { leadingNamePattern: /^BOSU\b/, code: 'BOSU_OR_BALANCE_BALL' },
]

export function getOptimNameImpliedEquipmentCode(
  name: string | null | undefined,
  exerciseCode?: string | null,
): string | null {
  const normalizedName = normalizeCode(name)
  const normalizedExerciseCode = normalizeCode(exerciseCode)
  return NAME_IMPLIED_EQUIPMENT.find(({ leadingNamePattern, corroboratingCodePattern, corroboratingNamePattern }) =>
    leadingNamePattern.test(normalizedName)
    || Boolean(
      normalizedExerciseCode
      && corroboratingCodePattern?.test(normalizedExerciseCode)
      && corroboratingNamePattern?.test(normalizedName),
    ))?.code ?? null
}

function equipmentGroupsOf(exercise: ExerciseListItem): string[][] {
  const required = (exercise.exerciseEquipment?.required ?? [])
    .map((group) => group.map(normalizeCode).filter(Boolean))
    .filter((group) => group.length > 0)
  const implied = getOptimNameImpliedEquipmentCode(exercise.exerciseName, exercise.exerciseCode)
  if (!implied || required.some((group) => group.includes(implied))) return required
  const optionalCodes = new Set(
    (exercise.exerciseEquipment?.optional ?? []).flat().map(normalizeCode).filter(Boolean),
  )
  return optionalCodes.has(implied) ? [...required, [implied]] : required
}

function hasUnresolvedDedicatedMachineEquipment(
  exercise: ExerciseListItem,
  code: string,
  name: string,
  requiredEquipmentGroups: string[][],
  isBodyweight: boolean,
): boolean {
  const optionalCodes = (exercise.exerciseEquipment?.optional ?? []).flat().map(normalizeCode).filter(Boolean)
  if (isBodyweight || requiredEquipmentGroups.length > 0 || optionalCodes.length > 0) return false
  const structuralSignals = [
    /^(?:LEVER|MACHINE)(?:\b|[._-])/.test(code),
    /\bMACHINE\b/.test(normalizeCode(name)),
    /\bPLATE[ -]LOADED\b/.test(normalizeCode(name)),
  ]
  return structuralSignals.filter(Boolean).length >= 2
}

function inferLevel(tags: string[]): number {
  if (tags.some((tag) => tag.includes('ADVANCED') || tag.includes('EXPERT'))) return 2
  if (tags.some((tag) => tag.includes('INTERMEDIATE'))) return 1
  return 0
}

function inferTier(exercise: ExerciseListItem, tags: string[]): number {
  const explicit = tags.find((tag) => /(?:TIER|T)[_-]?[1-4]$/.test(tag))
  const explicitNumber = explicit?.match(/[1-4]$/)?.[0]
  if (explicitNumber) return Number(explicitNumber)
  if (tags.some((tag) => tag.includes('COMPOUND') || tag.includes('OLYMPIC'))) return 1
  const popularity = exercise.popularityRating ?? 0
  return popularity >= 8 ? 1 : popularity >= 5 ? 2 : popularity >= 2 ? 3 : 4
}

function inferMovementPattern(movementName: string): MovementPattern | null {
  if (/SNATCH/.test(movementName)) return 'snatch'
  if (/CLEAN/.test(movementName)) return 'clean'
  if (/JERK/.test(movementName)) return 'jerk'
  if (/DEADLIFT/.test(movementName)) return 'deadlift'
  if (/SQUAT/.test(movementName)) return 'squat'
  if (/BENCH.*PRESS|CHEST.*PRESS/.test(movementName)) return 'bench'
  if (/OVERHEAD.*PRESS|SHOULDER.*PRESS|MILITARY.*PRESS|PUSH.?PRESS/.test(movementName)) return 'overheadPress'
  if (/PULL.?UP|CHIN.?UP/.test(movementName)) return 'pullUp'
  if (/(?:^|[^A-Z])ROW(?:$|[^A-Z])/.test(movementName)) return 'row'
  if (/LUNGE/.test(movementName)) return 'lunge'
  if (/HIP.?THRUST/.test(movementName)) return 'hipThrust'
  return null
}

const IMPLEMENT_NAME_PREFIX = /^(?:BARBELL|DUMBBELL|CABLE|MACHINE|EZ-?BAR|SMITH MACHINE|SMITH|KETTLEBELL|BAND|RESISTANCE BAND|TRAP BAR|LANDMINE|BODYWEIGHT|TRX|PLATE|SLED|MEDICINE BALL|STABILITY BALL|BOSU)\s+/

function implementVariantKey(name: string): string {
  let value = name.trim().toUpperCase().replace(/\s+/g, ' ')
  let previous = ''
  while (previous !== value) {
    previous = value
    value = value.replace(IMPLEMENT_NAME_PREFIX, '')
  }
  return value
}

function primaryLiftPatternCompatible(
  pattern: MovementPattern,
  topPrimaryBuckets: ReadonlySet<MuscleBucketKey>,
): boolean {
  return [...topPrimaryBuckets].some((bucket) => PRIMARY_LIFT_BUCKETS[pattern].has(bucket))
}

function adaptExercise(
  exercise: ExerciseListItem,
  productRelationshipOverlayEnabled = false,
): AdaptedExercise | null {
  const code = normalizeCode(exercise.exerciseCode)
  if (!code) return null
  const name = exercise.exerciseName?.trim() || code
  const movementPattern = inferMovementPattern(`${code} ${name}`.toUpperCase())
  const tags = tagsOf(exercise)
  const metadata = getOptimExerciseMetadata(exercise)
  const relationship = productRelationshipOverlayEnabled
    ? getOptimExerciseProductAwareRelationshipMetadata(exercise)
    : getOptimExerciseRelationshipMetadata(exercise)
  const bodyweightMetadata = getOptimExerciseBodyweightMetadata(exercise)
  const safetyMetadata = getOptimExerciseSafetyMetadata(exercise)
  const type = normalizeCode(exercise.exerciseTypeCode)
  const measurements = (exercise.exerciseMeasurements ?? []).map(normalizeCode)
  const requiredEquipmentGroups = equipmentGroupsOf(exercise)
  const equipmentCodes = [...new Set(requiredEquipmentGroups.flat())]
  const primary = (exercise.exerciseMuscles ?? []).filter((muscle) => muscle.isPrimary)
  const muscles = (primary.length > 0
    ? [...primary]
    : [...(exercise.exerciseMuscles ?? [])]
        .sort((left, right) => (right.targetPercentage ?? 0) - (left.targetPercentage ?? 0))
        .slice(0, 1))
    .sort((left, right) => (right.targetPercentage ?? 0) - (left.targetPercentage ?? 0))
  const primaryMuscles = muscles.map((muscle) => normalizeCode(muscle.muscleCode)).filter(Boolean)
  const secondaryMuscles = (exercise.exerciseMuscles ?? [])
    .filter((muscle) => !muscle.isPrimary)
    .map((muscle) => normalizeCode(muscle.muscleCode))
    .filter(Boolean)
  const buckets = [...new Set(muscles
    .map((muscle) => getMuscleBucket(muscle.muscleCode))
    .filter((bucket): bucket is MuscleBucketKey => bucket != null))]
  const maximumPrimaryTarget = Math.max(...muscles.map((muscle) => muscle.targetPercentage ?? 0), 0)
  const topPrimaryBuckets = new Set(muscles
    .filter((muscle) => (muscle.targetPercentage ?? 0) === maximumPrimaryTarget)
    .map((muscle) => getMuscleBucket(muscle.muscleCode))
    .filter((bucket): bucket is MuscleBucketKey => bucket != null))
  const primaryBucket = movementPattern === 'overheadPress' &&
    topPrimaryBuckets.size > 1 && topPrimaryBuckets.has('shoulders')
    ? 'shoulders'
    : buckets[0] ?? null
  const secondaryBuckets = [...new Set([
    ...buckets.filter((bucket) => bucket !== primaryBucket),
    ...secondaryMuscles.map(getMuscleBucket).filter(Boolean),
  ])].filter((bucket): bucket is MuscleBucketKey => bucket !== primaryBucket)
  const inferredCardio =
    CARDIO_TYPES.has(type) ||
    tags.some((tag) => /CARDIO|RUNNING|CYCLING|ROWING|SWIMMING/.test(tag))
  const inferredMobility =
    MOBILITY_TYPES.has(type) ||
    type.includes('MOBILITY') ||
    tags.includes('STRETCHING')
  const isCardio = metadata?.isCardio ?? inferredCardio
  const isMobility = metadata?.mobilityType != null ? metadata.mobilityType !== 'none' : inferredMobility
  const catalogHasDistance = measurements.some((codeValue) => codeValue.includes('DISTANCE'))
  const catalogHasDuration = measurements.some((codeValue) => /DURATION|TIME/.test(codeValue))
  const catalogHasReps = measurements.includes('REPS')
  const isDistance = catalogHasDistance || metadata?.isDistance === true
  const isTimed = (catalogHasDuration && !catalogHasReps) || (metadata?.isTimed ?? catalogHasDuration)
  const isAssisted = bodyweightMetadata?.loadMode === 'assisted'
    || (metadata?.isAssisted ?? measurements.includes('BODYWEIGHT_MINUS_ASSISTANCE'))
  const inferredBodyweight =
    tags.includes('BODYWEIGHT') ||
    tags.includes('BODYWEIGHT_ONLY') ||
    tags.includes('BODYWEIGHT_WITH_EQUIPMENT') ||
    type.includes('BODYWEIGHT') ||
    measurements.includes('BODYWEIGHT_PLUS_WEIGHT') ||
    measurements.includes('BODYWEIGHT_MINUS_ASSISTANCE')
  const catalogRequiresExternalLoad =
    measurements.includes('WEIGHT') &&
    requiredEquipmentGroups.some((group) => group.length > 0) &&
    !inferredBodyweight
  const isBodyweight = catalogRequiresExternalLoad
    ? false
    : bodyweightMetadata != null || (metadata?.isBodyweight ?? inferredBodyweight)
  const inferredRepsScale: 0 | 1 | 2 = tags.some((tag) => /LOW_REP|STRENGTH|POWERLIFTING|OLYMPIC_LIFTING/.test(tag))
    ? 1
    : tags.some((tag) => /HIGH_REP|ENDURANCE/.test(tag))
      ? 2
      : 0
  const repsScale = metadata?.repsScale === 1 || metadata?.repsScale === 2
    ? metadata.repsScale
    : metadata?.repsScale === 0
      ? 0
      : inferredRepsScale
  const inferredTier = inferTier(exercise, tags)
  const isPrimaryLift = movementPattern != null && (movementPattern !== 'row' || primaryBucket === 'back')
  const isMainLift = movementPattern != null && primaryLiftPatternCompatible(movementPattern, topPrimaryBuckets)
  const unresolvedDedicatedMachineEquipment = hasUnresolvedDedicatedMachineEquipment(
    exercise,
    code,
    name,
    requiredEquipmentGroups,
    isBodyweight,
  )

  return {
    source: exercise,
    code,
    name,
    tags,
    type,
    measurements,
    requiredEquipmentGroups,
    equipmentCodes,
    hasUnresolvedDedicatedMachineEquipment: unresolvedDedicatedMachineEquipment,
    variantKey: implementVariantKey(name),
    primaryMuscles,
    secondaryMuscles,
    primaryBucket,
    secondaryBuckets,
    targetPercentage: Math.max(...muscles.map((muscle) => muscle.targetPercentage ?? 0), 0),
    rating: clamp((exercise.popularityRating ?? 0) / 10),
    tier: metadata?.tier ? metadata.tier : inferredTier,
    bodyTier: metadata?.bodyTier ? metadata.bodyTier : inferredTier,
    powerTier: metadata?.powerTier ? metadata.powerTier : inferredTier,
    olympicTier: metadata?.olympicTier ? metadata.olympicTier : inferredTier,
    level: Math.max(metadata?.level ?? inferLevel(tags), safetyMetadata?.level ?? 0),
    repsScale,
    isBodyweight,
    isCardio,
    isMobility,
    isTimed,
    isDistance,
    isAssisted,
    isUnilateral: metadata?.isUnilateral === true,
    isWeightPerSide: exercise.isWeightPerSide === true || tags.includes('WEIGHT_PER_SIDE'),
    isCore: primaryBucket === 'core',
    isBand: equipmentCodes.some((equipment) => equipment.includes('BAND')),
    isPrimaryLift,
    isMainLift,
    movementPattern,
    metadata,
    relationship,
    bodyweightMetadata,
  }
}

function getCompletedAtMs(workout: Workout): number | null {
  const raw = workout.workoutLogEndedAt
  if (!raw) return null
  const parsed = new Date(raw).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function measurementValue(
  set: ExerciseSet,
  codes: string[],
): number | null {
  const measurement = (set.setMeasurements ?? []).find((item) =>
    codes.includes(normalizeCode(item.measurementCode)),
  )
  return numeric(measurement?.measurementValue ?? measurement?.measurementPlaceholder)
}

function measurementTargetValue(
  set: ExerciseSet,
  codes: string[],
): number | null {
  const measurement = (set.setMeasurements ?? []).find((item) =>
    codes.includes(normalizeCode(item.measurementCode)),
  )
  return numeric(measurement?.measurementPlaceholder)
}

function measurementRecordedValue(
  set: ExerciseSet,
  codes: string[],
): number | null {
  const measurement = (set.setMeasurements ?? []).find((item) =>
    codes.includes(normalizeCode(item.measurementCode)),
  )
  return numeric(measurement?.measurementValue)
}

function theoreticalMax(weight: number, reps: number, sets: number): number {
  return ((1 + sets * 0.018) * weight) / (1.0278 - Math.min(reps, 20) * 0.0278)
}

function repeatableRepFactor(setCount: number): number {
  const sets = Math.max(1, setCount)
  return (1 + 1 / (sets + 10)) ** (sets - 1)
}

type OptimDemoHistoryOptions = {
  bodyWeightKg?: number | null
  bodyweightMetadataByCode?: ReadonlyMap<string, OptimExerciseBodyweightMetadata>
  rpeAwareEffort?: boolean
}

function rpeAdjustedReps(
  set: ExerciseSet,
  reps: number,
  target: boolean,
  enabled: boolean,
): number {
  if (!enabled) return reps
  const rpe = target
    ? measurementTargetValue(set, ['RPE'])
    : measurementValue(set, ['RPE'])
  if (rpe == null || !Number.isFinite(rpe) || rpe < 6 || rpe > 10) return reps
  return reps + (10 - rpe)
}

function effectiveBodyweightLoad(
  set: ExerciseSet,
  metadata: OptimExerciseBodyweightMetadata | undefined,
  bodyWeightKg: number | null | undefined,
  target: boolean,
): number | null {
  if (!metadata || bodyWeightKg == null || !Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) return null
  const baseLoad = bodyWeightKg * metadata.bodyweightContribution
  const value = target ? measurementTargetValue : measurementValue
  const externalLoad = metadata.loadMode === 'added'
    ? value(set, ['BODYWEIGHT_PLUS_WEIGHT', 'WEIGHT']) ?? 0
    : value(set, ['BODYWEIGHT_MINUS_ASSISTANCE']) ?? 0
  const effectiveLoad = metadata.loadMode === 'added'
    ? baseLoad + Math.max(0, externalLoad)
    : baseLoad - Math.max(0, externalLoad)
  return Number.isFinite(effectiveLoad) && effectiveLoad > 0 ? effectiveLoad : null
}

function isResolvedAddedBodyweightSet(
  set: ExerciseSet,
  metadata: OptimExerciseBodyweightMetadata | undefined,
  bodyWeightKg: number | null | undefined,
  target: boolean,
): boolean {
  if (metadata?.loadMode !== 'added') return false
  if (effectiveBodyweightLoad(set, metadata, bodyWeightKg, target) == null) return false
  const value = target ? measurementTargetValue : measurementValue
  return (value(set, ['BODYWEIGHT_PLUS_WEIGHT', 'WEIGHT']) ?? 0) > 0
}

export function buildOptimDemoHistory(
  workouts: Workout[],
  notAfterMs = Number.POSITIVE_INFINITY,
  options: OptimDemoHistoryOptions = {},
): Map<string, ExerciseHistory> {
  const histories = new Map<string, ExerciseHistory>()
  for (const workout of workouts) {
    const dateMs = getCompletedAtMs(workout)
    if (dateMs == null || dateMs > notAfterMs) continue
    const seenExerciseCodes = new Set<string>()
    for (const entry of workout.workoutData ?? []) {
      const code = normalizeCode(entry.exerciseCode)
      if (!code) continue
      const completedSets = (entry.exerciseData ?? []).filter(
        (set) => set.setCompleted && set.setType !== 'warmup',
      )
      if (completedSets.length === 0) continue
      const current = histories.get(code) ?? {
        lastUsedAtMs: dateMs,
        workoutCount: 0,
        completedSets: 0,
        observations: [],
        repObservations: [],
        observedWeightsKg: [],
      }
      current.lastUsedAtMs = Math.max(current.lastUsedAtMs, dateMs)
      if (!seenExerciseCodes.has(code)) current.workoutCount += 1
      seenExerciseCodes.add(code)
      current.completedSets += completedSets.length
      let workoutMax = 0
      let workoutMaxActualRpeMeasured = false
      let recommendedWorkoutMax = 0
      let workoutMaxReps = 0
      let recommendedWorkoutMaxReps = 0
      const bodyweightMetadata = options.bodyweightMetadataByCode?.get(code)
      for (const set of completedSets) {
        const reps = measurementValue(set, ['REPS']) ?? 0
        const ordinaryWeight = measurementValue(set, ['WEIGHT']) ?? 0
        const effectiveWeight = effectiveBodyweightLoad(
          set,
          bodyweightMetadata,
          options.bodyWeightKg,
          false,
        )
        const weight = effectiveWeight ?? ordinaryWeight
        const targetReps = measurementTargetValue(set, ['REPS']) ?? 0
        const ordinaryTargetWeight = measurementTargetValue(set, ['WEIGHT']) ?? 0
        const effectiveTargetWeight = effectiveBodyweightLoad(
          set,
          bodyweightMetadata,
          options.bodyWeightKg,
          true,
        )
        const targetWeight = effectiveTargetWeight ?? ordinaryTargetWeight
        if (!bodyweightMetadata && ordinaryWeight > 0) current.observedWeightsKg.push(ordinaryWeight)
        if (reps > 0 && !isResolvedAddedBodyweightSet(
          set,
          bodyweightMetadata,
          options.bodyWeightKg,
          false,
        )) {
          const sameOrHarderRepSets = completedSets.filter((candidate) =>
            !isResolvedAddedBodyweightSet(
              candidate,
              bodyweightMetadata,
              options.bodyWeightKg,
              false,
            ) &&
            (measurementValue(candidate, ['REPS']) ?? 0) >= reps,
          ).length
          workoutMaxReps = Math.max(
            workoutMaxReps,
            (reps - 0.5) * repeatableRepFactor(sameOrHarderRepSets),
          )
        }
        if (targetReps > 0 && !isResolvedAddedBodyweightSet(
          set,
          bodyweightMetadata,
          options.bodyWeightKg,
          true,
        )) {
          const sameOrHarderTargetRepSets = completedSets.filter((candidate) =>
            !isResolvedAddedBodyweightSet(
              candidate,
              bodyweightMetadata,
              options.bodyWeightKg,
              true,
            ) &&
            (measurementTargetValue(candidate, ['REPS']) ?? 0) >= targetReps,
          ).length
          recommendedWorkoutMaxReps = Math.max(
            recommendedWorkoutMaxReps,
            (targetReps - 0.5) * repeatableRepFactor(sameOrHarderTargetRepSets),
          )
        }
        if (weight > 0 && reps > 0) {
          const effectiveReps = rpeAdjustedReps(
            set,
            reps,
            false,
            options.rpeAwareEffort === true && bodyweightMetadata == null,
          )
          const sameOrHarderSets = completedSets.filter((candidate) => {
            const candidateWeight = effectiveBodyweightLoad(
              candidate,
              bodyweightMetadata,
              options.bodyWeightKg,
              false,
            ) ?? (measurementValue(candidate, ['WEIGHT']) ?? 0)
            const candidateReps = measurementValue(candidate, ['REPS']) ?? 0
            const candidateEffectiveReps = rpeAdjustedReps(
              candidate,
              candidateReps,
              false,
              options.rpeAwareEffort === true && bodyweightMetadata == null,
            )
            return candidateWeight === weight && candidateEffectiveReps >= effectiveReps
          }).length
          const candidateMax = theoreticalMax(weight, effectiveReps, sameOrHarderSets)
          if (candidateMax > workoutMax) {
            workoutMax = candidateMax
            const actualRpe = measurementRecordedValue(set, ['RPE'])
            workoutMaxActualRpeMeasured =
              options.rpeAwareEffort === true &&
              bodyweightMetadata == null &&
              actualRpe != null &&
              Number.isFinite(actualRpe) &&
              actualRpe >= 6 &&
              actualRpe <= 10
          }
        }
        if (targetWeight > 0 && targetReps > 0) {
          const effectiveTargetReps = rpeAdjustedReps(
            set,
            targetReps,
            true,
            options.rpeAwareEffort === true && bodyweightMetadata == null,
          )
          const sameOrHarderTargetSets = completedSets.filter((candidate) => {
            const candidateWeight = effectiveBodyweightLoad(
              candidate,
              bodyweightMetadata,
              options.bodyWeightKg,
              true,
            ) ?? (measurementTargetValue(candidate, ['WEIGHT']) ?? 0)
            const candidateReps = measurementTargetValue(candidate, ['REPS']) ?? 0
            const candidateEffectiveReps = rpeAdjustedReps(
              candidate,
              candidateReps,
              true,
              options.rpeAwareEffort === true && bodyweightMetadata == null,
            )
            return candidateWeight === targetWeight && candidateEffectiveReps >= effectiveTargetReps
          }).length
          recommendedWorkoutMax = Math.max(
            recommendedWorkoutMax,
            theoreticalMax(targetWeight, effectiveTargetReps, sameOrHarderTargetSets),
          )
        }
      }
      if (workoutMax > 0) {
        current.observations.push({
          dateMs,
          theoreticalMaxKg: workoutMax,
          recommendedTheoreticalMaxKg: recommendedWorkoutMax > 0 ? recommendedWorkoutMax : null,
          ...(workoutMaxActualRpeMeasured ? { actualRpeMeasured: true } : {}),
        })
      }
      if (workoutMaxReps > 0) {
        current.repObservations.push({
          dateMs,
          maxReps: workoutMaxReps,
          recommendedMaxReps: recommendedWorkoutMaxReps > 0 ? recommendedWorkoutMaxReps : null,
        })
      }
      histories.set(code, current)
    }
  }
  return histories
}

function recoveryWindowDays(inputs: OptimDemoInputs): number {
  const base = inputs.experience === 'beginner' ? 5.75 : inputs.experience === 'advanced' ? 6.25 : 6
  return base + (inputs.goal === 'strength' || inputs.goal === 'powerlifting' ? 0.25 : 0)
}

function emptyUsage(): Record<MuscleBucketKey, number> {
  return { chest: 0, shoulders: 0, arms: 0, legs: 0, core: 0, back: 0 }
}

function computeRecoveryUsage(
  exercisesByCode: Map<string, AdaptedExercise>,
  workouts: Workout[],
  inputs: OptimDemoInputs,
  nowMs: number,
): Record<MuscleBucketKey, number> {
  const result = emptyUsage()
  const windowDays = recoveryWindowDays(inputs)
  const recoveryMs = windowDays * DAY_MS
  for (const workout of workouts) {
    const completedAt = getCompletedAtMs(workout)
    if (completedAt == null) continue
    const elapsed = nowMs - completedAt
    if (elapsed < 0 || elapsed > recoveryMs) continue
    const timeUsage = clamp(1 - elapsed / recoveryMs)
    let completedPosition = 0
    for (const entry of workout.workoutData ?? []) {
      const exercise = exercisesByCode.get(normalizeCode(entry.exerciseCode))
      if (!exercise || exercise.isMobility || !exercise.primaryBucket) continue
      const completed = (entry.exerciseData ?? []).some(
        (set) => set.setCompleted && set.setType !== 'warmup',
      )
      if (!completed) continue
      const position = completedPosition
      completedPosition += 1
      let additional = position === 0 ? 0.075 : position === 1 ? 0.05 : position >= 4 ? -0.05 : 0
      if (exercise.isBodyweight) additional -= 0.05
      const primaryImpact = exercise.secondaryMuscles.length > 2 ? 0.25 : 0.4
      result[exercise.primaryBucket] += Math.max(0, primaryImpact + additional) * timeUsage
      for (const bucket of exercise.secondaryBuckets) {
        const secondaryImpact = exercise.secondaryMuscles.length > 2 ? 0.05 : 0.075
        result[bucket] += Math.max(0, secondaryImpact + additional / 5) * timeUsage
      }
    }
  }
  for (const bucket of BUCKETS) {
    const recovery = clamp(inputs.manualRecoveryPercent[bucket] ?? 0)
    result[bucket] = round(Math.max(0, result[bucket]) * (1 - recovery))
  }
  return result
}

function equipmentAvailable(exercise: AdaptedExercise, selected: Set<string>): boolean {
  return exercise.equipmentCodes.every((code) => selected.has(code))
}

function splitAllows(split: OptimDemoSplit, exercise: AdaptedExercise, goal: OptimDemoGoal): boolean {
  const bucket = exercise.primaryBucket
  if (!bucket || bucket === 'core' || split === 'fresh' || split === 'fullBody') return true
  if (split === 'upper') return UPPER_BUCKETS.has(bucket)
  if (split === 'lower') return bucket === 'legs'
  const authoredSplits = exercise.tags.filter((tag) =>
    tag === 'PUSH_SPLIT' || tag === 'PULL_SPLIT' || tag === 'LEGS_SPLIT',
  )
  if (authoredSplits.length > 0) {
    const trustFullBodyAuthoredSplit = goal === 'powerlifting' || goal === 'olympic'
    if (split === 'push') {
      return authoredSplits.includes('PUSH_SPLIT') && (trustFullBodyAuthoredSplit || UPPER_BUCKETS.has(bucket))
    }
    if (split === 'pull') {
      return authoredSplits.includes('PULL_SPLIT') && (trustFullBodyAuthoredSplit || UPPER_BUCKETS.has(bucket))
    }
  }
  if (split === 'push' && !['chest', 'shoulders', 'arms'].includes(bucket)) return false
  if (split === 'pull' && !['back', 'arms'].includes(bucket)) return false
  if (bucket === 'arms') {
    const isPushArm = exercise.primaryMuscles.some((muscle) => muscle.includes('TRICEPS'))
    const isPullArm = exercise.primaryMuscles.some((muscle) =>
      /BICEPS|BRACHIAL|BRACHIORADIAL|FOREARM|WRIST/.test(muscle),
    )
    if (isPushArm || isPullArm) return split === 'push' ? isPushArm : isPullArm
  }
  if (split === 'push') return bucket === 'chest' || bucket === 'shoulders' || bucket === 'arms'
  return split === 'pull' ? bucket === 'back' || bucket === 'arms' : true
}

function fullBodyRolesOf(exercise: AdaptedExercise): FullBodyRole[] {
  if (exercise.primaryBucket === 'legs') return ['lower']
  const roles = new Set<FullBodyRole>()
  if (exercise.tags.includes('PULL_SPLIT')) roles.add('pull')
  if (exercise.tags.includes('PUSH_SPLIT')) roles.add('push')
  if (roles.size > 0) return [...roles]
  if (exercise.primaryBucket === 'back') roles.add('pull')
  if (exercise.primaryBucket === 'chest' || exercise.primaryBucket === 'shoulders') roles.add('push')
  return [...roles]
}

function tierForGoal(exercise: AdaptedExercise, goal: OptimDemoGoal): number {
  if (goal === 'bodybuilding') return exercise.bodyTier
  if (goal === 'powerlifting') return exercise.powerTier
  if (goal === 'olympic') return exercise.olympicTier
  return exercise.tier
}

/**
 * Whether the goal tier came from recovered metadata or an explicit catalog
 * tier tag, as opposed to the popularity/compound-tag inference. The
 * inference labels popular core work and isolation accessories tier one,
 * which is grouping noise, not a recovered competition-lift boundary.
 */
function tierIsAuthored(exercise: AdaptedExercise, goal: OptimDemoGoal): boolean {
  const authoredMetadataTier = goal === 'bodybuilding'
    ? exercise.metadata?.bodyTier
    : goal === 'powerlifting'
      ? exercise.metadata?.powerTier
      : goal === 'olympic'
        ? exercise.metadata?.olympicTier
        : exercise.metadata?.tier
  if (authoredMetadataTier) return true
  return exercise.tags.some((tag) => /(?:TIER|T)[_-]?[1-4]$/.test(tag))
}

/** Safe pair member for the inferred-accessory policies: provably not a competition lift. */
function isInferredAccessory(exercise: AdaptedExercise, goal: OptimDemoGoal): boolean {
  return !tierIsAuthored(exercise, goal) &&
    !exercise.isPrimaryLift &&
    !exercise.isMainLift &&
    exercise.movementPattern == null
}

const OLYMPIC_TECHNICAL_MAX_REPS = 5

function isAuthenticOlympicLift(exercise: AdaptedExercise): boolean {
  return exercise.tags.includes('OLYMPIC_LIFTING') &&
    exercise.movementPattern != null &&
    ['clean', 'snatch', 'jerk'].includes(exercise.movementPattern)
}

function usesOlympicTechnicalPrescription(
  exercise: AdaptedExercise,
  inputs: OptimDemoInputs,
  core: boolean,
): boolean {
  return inputs.olympicTechnicalPrescriptionsEnabled === true &&
    !core &&
    !exercise.isBodyweight &&
    !exercise.isBand &&
    !exercise.isTimed &&
    isAuthenticOlympicLift(exercise)
}

function hardFilterReasons(
  exercise: AdaptedExercise,
  inputs: OptimDemoInputs,
  selectedEquipment: Set<string>,
  equipmentSelectionIsRestricted: boolean,
  excluded: Set<string>,
): string[] {
  const reasons: string[] = []
  const experienceLevel = inputs.experience === 'beginner' ? 0 : inputs.experience === 'intermediate' ? 1 : 2
  if (exercise.level > experienceLevel) reasons.push('experience level')
  if (inputs.goal === 'olympic' && exercise.metadata?.olympicRating === 1) reasons.push('low Olympic suitability')
  const isGoalLift = !exercise.isCore && !exercise.isCardio && !exercise.isMobility && !exercise.isDistance
  if (
    isGoalLift &&
    inputs.goal === 'olympic' &&
    !isAuthenticOlympicLift(exercise)
  ) reasons.push('outside Olympic lifting pool')
  if (
    isGoalLift &&
    inputs.goal === 'powerlifting' &&
    (!exercise.tags.includes('POWERLIFTING') || !exercise.movementPattern || !['squat', 'deadlift', 'bench', 'overheadPress'].includes(exercise.movementPattern))
  ) reasons.push('outside powerlifting pool')
  if (exercise.isCardio) reasons.push('cardio is selected in its own stage')
  if (exercise.isDistance) reasons.push('distance exercise is selected in its own stage')
  if (exercise.isMobility) reasons.push('mobility is selected in warm-up/cool-down stages')
  if (inputs.bodyweightOnly && !exercise.isBodyweight) reasons.push('bodyweight-only mode')
  if (!equipmentAvailable(exercise, selectedEquipment)) reasons.push('missing required equipment')
  if (equipmentSelectionIsRestricted && exercise.hasUnresolvedDedicatedMachineEquipment) {
    reasons.push('machine exercise has no canonical equipment mapping')
  }
  if (excluded.has(exercise.code)) reasons.push('manually excluded')
  if (inputs.selectedMuscleBuckets.length > 0 && !exercise.isCore && exercise.primaryBucket && !inputs.selectedMuscleBuckets.includes(exercise.primaryBucket)) {
    reasons.push('outside manually selected muscles')
  }
  if (!splitAllows(inputs.split, exercise, inputs.goal)) reasons.push('outside selected split')
  if (!exercise.primaryBucket) reasons.push('no mapped JustGains muscle bucket')
  return reasons
}

function scoreExercise(
  exercise: AdaptedExercise,
  history: ExerciseHistory | undefined,
  muscleUsage: Record<MuscleBucketKey, number>,
  inputs: OptimDemoInputs,
  availabilityRatio: number,
  nowMs: number,
): OptimScoreBreakdown {
  const metadataRating = inputs.goal === 'muscleTone'
    ? exercise.metadata?.toneRating
    : inputs.goal === 'olympic'
      ? exercise.metadata?.olympicRating
      : exercise.metadata?.rating
  const normalizedRating = metadataRating == null ? exercise.rating : clamp(metadataRating / 5)
  const baseRating = normalizedRating === 0 ? 0.2 : normalizedRating
  const catalogRating = baseRating
  const muscleFreshness = exercise.primaryBucket
    ? (1 - clamp(muscleUsage[exercise.primaryBucket])) * 4
    : 0
  let historyRecency = 0
  if (history) {
    const days = Math.floor(Math.max(0, nowMs - history.lastUsedAtMs) / DAY_MS) + 1
    const factor = days >= 90 ? 1 : 1 - 1 / Math.sqrt(days)
    historyRecency = (2 - availabilityRatio) * factor
  }
  const primaryMuscleUtility = clamp(exercise.targetPercentage / 100)
  const focusUtility = inputs.focusExerciseCodes.map(normalizeCode).includes(exercise.code) ? 0.6 : 0
  const userRating = exercise.source.isFavorited ? 0.5 : 0
  return {
    catalogRating: round(catalogRating),
    muscleFreshness: round(muscleFreshness),
    historyRecency: round(historyRecency),
    primaryMuscleUtility: round(primaryMuscleUtility),
    focusUtility,
    userRating,
  }
}

function sportFoundationUtility(exercise: AdaptedExercise, requestedGoal: 'olympic' | 'powerlifting'): number {
  const highPatterns = requestedGoal === 'powerlifting'
    ? POWERLIFTING_FOUNDATION_HIGH_PATTERNS
    : OLYMPIC_FOUNDATION_HIGH_PATTERNS
  const mediumPatterns = requestedGoal === 'powerlifting'
    ? POWERLIFTING_FOUNDATION_MEDIUM_PATTERNS
    : OLYMPIC_FOUNDATION_MEDIUM_PATTERNS
  const patternMatchesPrimaryBucket = (() => {
    if (!exercise.movementPattern) return false
    if (exercise.movementPattern === 'squat' || exercise.movementPattern === 'lunge' || exercise.movementPattern === 'hipThrust') {
      return exercise.primaryBucket === 'legs'
    }
    if (exercise.movementPattern === 'deadlift') return exercise.primaryBucket === 'legs' || exercise.primaryBucket === 'back'
    if (exercise.movementPattern === 'bench') return exercise.primaryBucket === 'chest'
    if (exercise.movementPattern === 'overheadPress') {
      return exercise.primaryBucket === 'shoulders' || exercise.primaryBucket === 'chest'
    }
    if (exercise.movementPattern === 'row' || exercise.movementPattern === 'pullUp') {
      return exercise.primaryBucket === 'back' || exercise.primaryBucket === 'arms' || exercise.primaryBucket === 'shoulders'
    }
    return exercise.primaryBucket === 'legs' || exercise.primaryBucket === 'back' || exercise.primaryBucket === 'shoulders'
  })()
  if (patternMatchesPrimaryBucket && exercise.movementPattern && highPatterns.has(exercise.movementPattern)) return 1.5
  if (patternMatchesPrimaryBucket && exercise.movementPattern && mediumPatterns.has(exercise.movementPattern)) return 0.75
  if (!exercise.movementPattern && exercise.tags.includes('COMPOUND') && !exercise.tags.includes('ISOLATION')) return 0.375
  return 0
}

function sumBreakdown(breakdown: OptimScoreBreakdown): number {
  return round(Object.values(breakdown).reduce((sum, value) => sum + value, 0))
}

function positionValid(exercise: AdaptedExercise, goal: OptimDemoGoal, position: number, count: number, backup: boolean): boolean {
  const tier = tierForGoal(exercise, goal)
  if (goal === 'bodybuilding') {
    const early = position < Math.min(4, Math.floor(count / 2))
    return early ? (tier === 1 && exercise.isMainLift) || (backup && tier <= 2) : tier === 2
  }
  if (goal === 'olympic') {
    if (position === 0) return tier === 1 || (backup && tier === 2)
    if (position === 1) return tier === 2
    if (position === 2) return tier === 3
    if (position === 3) return tier === 4
  }
  if (goal === 'powerlifting') {
    if (position === 0) return tier === 1 || (backup && tier === 2)
    if (position === 1) return tier === 2
  }
  if (goal === 'general') {
    const early = position < Math.min(3, count)
    return !early || (tier <= 2 && (exercise.isMainLift || backup))
  }
  if (goal === 'muscleTone') {
    const early = position < Math.min(2, count)
    return !early || exercise.isMainLift || backup
  }
  if (position === 0) return (tier === 1 && exercise.isMainLift) || (backup && tier <= 2)
  if (position === 1) return (tier <= 2 && exercise.isMainLift) || (backup && tier <= 2)
  if (position === 2 || position === 3) return tier !== 1
  return tier > 2
}

export function calculateOptimExerciseCounts(durationMinutes: number, goal: OptimDemoGoal): { nonCore: number; core: number } {
  const offset = durationMinutes < 31 ? 4 : durationMinutes <= 45 ? 2 : 0
  const tier1 = Math.max(15 - offset, 3)
  const tier2 = Math.max(12 - offset, 3)
  const tier3 = Math.max(10 - offset, 3)
  const tier4 = Math.max(7 - offset, 3)
  const coreTime = 5
  let core = 2
  let nonCore = durationMinutes > tier1 + tier2 + coreTime ? 3 : 2
  if (durationMinutes > tier1 + tier2 + tier3 + coreTime) nonCore += 1
  const firstFour = tier1 + tier2 + tier3 + tier4
  if (durationMinutes > firstFour + coreTime) {
    nonCore += Math.floor(Math.max(0, durationMinutes - (firstFour + coreTime * 2)) / tier4)
  } else {
    core = 1
  }
  if (goal === 'muscleTone') {
    nonCore += 2
    core += 1
  }
  return { nonCore, core }
}

function schemeTableFor(goal: OptimDemoGoal, position: number, core: boolean): SchemeTableName {
  if (core) {
    if (goal === 'powerlifting') return 'strengthTier3SetsReps'
    if (goal === 'general') return 'generalFitnessLateTierSetsReps'
    return 'strengthTier4SetsReps'
  }
  if (goal === 'bodybuilding') {
    return position === 0
      ? 'bodybuildingTier1SetsReps'
      : position === 1
        ? 'bodybuildingTier2SetsReps'
        : position === 2
          ? 'bodybuildingTier3SetsReps'
          : 'bodybuildingTier4SetsReps'
  }
  if (goal === 'general') return position < 2 ? 'generalFitnessEarlyTierSetsReps' : 'generalFitnessLateTierSetsReps'
  if (goal === 'olympic') return position < 2 ? 'olyTier1SetsReps' : position === 2 ? 'strengthTier1SetsReps' : 'strengthTier4SetsReps'
  if (goal === 'powerlifting') return position === 0 ? 'powerTier1SetsReps' : position === 1 ? 'strengthTier1SetsReps' : position === 2 ? 'strengthTier2SetsReps' : 'strengthTier3SetsReps'
  if (goal === 'muscleTone') return position === 0 || position === 2 ? 'strengthTier3SetsReps' : 'strengthTier4SetsReps'
  return position === 0 ? 'strengthTier1SetsReps' : position === 1 ? 'strengthTier2SetsReps' : position === 2 ? 'strengthTier3SetsReps' : 'strengthTier4SetsReps'
}

function bodyweightTable(exercise: AdaptedExercise, experience: OptimDemoExperience): SchemeTableName {
  const level = experience === 'beginner' ? 'Beginner' : experience === 'intermediate' ? 'Intermediate' : 'Advanced'
  const scale = exercise.repsScale === 1 ? 'Low' : exercise.repsScale === 2 ? 'High' : 'Mid'
  return `bodyweight${level}RepsScale${scale}SetsReps` as SchemeTableName
}

function resolveScheme(exercise: AdaptedExercise, inputs: OptimDemoInputs, position: number, core: boolean, nowMs: number): { scheme: Scheme; source: string; timed: boolean } {
  const day = dayOfYear(new Date(nowMs))
  if (exercise.isBand) {
    return { scheme: { sets: 3, reps: exercise.isTimed ? 15 : 8, weight: 0 }, source: exercise.isTimed ? 'band timed 3x15s' : 'band 3x8', timed: exercise.isTimed }
  }
  if (exercise.isTimed) {
    const timedMovement = `${exercise.code} ${exercise.name}`.toUpperCase()
    const seconds = /L.?SIT|SIDE.?(PLANK|BRIDGE)/.test(timedMovement) ? 30 : 60
    return { scheme: { sets: 3, reps: seconds, weight: 0 }, source: `timed 3x${seconds}s`, timed: true }
  }
  const olympicTechnical = usesOlympicTechnicalPrescription(exercise, inputs, core)
  const tableName = exercise.isBodyweight
    ? bodyweightTable(exercise, inputs.experience)
    : olympicTechnical
      ? 'olyTier1SetsReps'
      : schemeTableFor(inputs.goal, position, core)
  const table = schemeTables[tableName]
  const offset = core ? 5 : Math.min(position, 4)
  const scheme = table[Math.abs(day + offset) % table.length]!
  let reps = scheme.reps
  if (!exercise.isBodyweight && exercise.repsScale === 1 && inputs.goal !== 'olympic') {
    reps = Math.max(1, inputs.goal === 'powerlifting' ? Math.floor((reps * 2) / 3) : Math.floor(reps / 2))
  } else if (!exercise.isBodyweight && exercise.repsScale === 2) {
    reps = Math.max(1, Math.floor((reps * 3) / 2))
  }
  if (olympicTechnical) reps = Math.min(OLYMPIC_TECHNICAL_MAX_REPS, reps)
  const prescriptionMetadata = inputs.prescriptionRepCapsEnabled === true
    ? getOptimExercisePrescriptionMetadata(exercise.source)
    : null
  const prescriptionCapApplied = prescriptionMetadata != null && reps > prescriptionMetadata.maxReps
  if (prescriptionMetadata) reps = Math.min(reps, prescriptionMetadata.maxReps)
  return {
    scheme: { ...scheme, reps },
    source: `${tableName}[${Math.abs(day + offset) % table.length}]${olympicTechnical ? '; olympic technical routing' : ''}${prescriptionCapApplied ? `; prescription metadata capped to ${prescriptionMetadata.maxReps} reps` : ''}`,
    timed: false,
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function capabilityMultiplier(observedMax: number, recommendedMax: number): number {
  if (recommendedMax <= 0) return 1
  const percentDifference = clamp(((observedMax / recommendedMax) - 1) * 100, -7, 7)
  const adjustment = percentDifference / 7
  if (adjustment > 0) return (1 + adjustment) ** 0.07
  if (adjustment < 0) return (1 + Math.abs(adjustment)) ** -0.07
  return 1
}

const CAPABILITY_RECOMMENDED_MAX_RATIO = 1.07
/**
 * Bounded catch-up ceiling for the opt-in logged-effort policy. Only reachable
 * when the latest observation carries a real logged RPE and its own
 * RPE-adjusted arithmetic supports the higher value, so a compliant athlete
 * who measures an easy session is not underloaded for months by the 107% cap.
 */
const CAPABILITY_CATCH_UP_MAX_RATIO = 1.18
const SHORT_HISTORY_MAX_OBSERVATIONS = 14
const SHORT_HISTORY_LOAD_UPPER_RATIO = 1.5
const REP_CAPACITY_MIN_UPWARD_STEP = 4
const REP_CAPACITY_UPWARD_RATIO = 0.25

function interpolateAndSmooth(points: [number, number][]): number {
  const interpolated: [number, number][] = []
  points.forEach((point, index) => {
    interpolated.push(point)
    const next = points[index + 1]
    if (!next || next[0] - point[0] <= 2) return
    for (let day = point[0] + 1; day < next[0]; day += 1) {
      const progress = (day - point[0]) / (next[0] - point[0])
      interpolated.push([day, point[1] + (next[1] - point[1]) * progress])
    }
  })
  let smoothed = interpolated[0]![1]!
  for (let index = 1; index < interpolated.length; index += 1) {
    smoothed = 0.5 * interpolated[index]![1]! + 0.5 * smoothed
  }
  return smoothed
}

function smoothedHistoricalMax(
  history: ExerciseHistory | undefined,
  nowMs: number,
  measuredEffortCapabilityHold = false,
  loggedEffortCatchUp = false,
): { maxKg: number; capabilityApplied: boolean; shortHistoryOutlierClamped: boolean; loggedEffortCatchUpApplied: boolean } | null {
  if (!history || history.observations.length === 0) return null
  let observations = [...history.observations].sort((a, b) => a.dateMs - b.dateMs)
  let shortHistoryOutlierClamped = false
  if (observations.length >= 15) {
    const values = observations.map((item) => item.theoreticalMaxKg)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const std = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1))
    const replacement = median(values)
    observations = observations.map((item) => ({
      ...item,
      theoreticalMaxKg: std > 0 && Math.abs((item.theoreticalMaxKg - mean) / std) > 3 ? replacement : item.theoreticalMaxKg,
    }))
  } else if (observations.length >= 2 && observations.length <= SHORT_HISTORY_MAX_OBSERVATIONS) {
    const sorted = observations.map((item) => item.theoreticalMaxKg).sort((a, b) => a - b)
    const lowerMedian = sorted[Math.floor((sorted.length - 1) / 2)]!
    const upperBound = lowerMedian * SHORT_HISTORY_LOAD_UPPER_RATIO
    observations = observations.map((item) => {
      if (item.theoreticalMaxKg <= upperBound) return item
      shortHistoryOutlierClamped = true
      return { ...item, theoreticalMaxKg: upperBound }
    })
  }
  const byDay = new Map<number, HistoryObservation>()
  for (const item of observations) {
    const key = Math.floor(item.dateMs / DAY_MS)
    const current = byDay.get(key)
    if (!current || item.theoreticalMaxKg > current.theoreticalMaxKg) byDay.set(key, item)
  }
  const dailyObservations = [...byDay].sort(([a], [b]) => a - b)
  const points = dailyObservations.map(([day, item]) => [day, item.theoreticalMaxKg] as [number, number])
  let smoothed = interpolateAndSmooth(points)
  const latestObservation = dailyObservations.at(-1)?.[1]
  let capabilityApplied = false
  let loggedEffortCatchUpApplied = false
  if (latestObservation?.recommendedTheoreticalMaxKg != null) {
    const multiplier = measuredEffortCapabilityHold && latestObservation.actualRpeMeasured
      ? 1
      : capabilityMultiplier(
          latestObservation.theoreticalMaxKg,
          latestObservation.recommendedTheoreticalMaxKg,
        )
    const recoveredCap =
      latestObservation.recommendedTheoreticalMaxKg * CAPABILITY_RECOMMENDED_MAX_RATIO
    // Catch-up needs measured effort: a real logged RPE whose own adjusted
    // arithmetic exceeds the recovered cap. The ceiling stays bounded by both
    // the observation itself and the 118% ratio, so one easy session can
    // shorten months of underloading without ever outrunning the evidence.
    const cap = loggedEffortCatchUp && latestObservation.actualRpeMeasured
      ? Math.max(recoveredCap, Math.min(
          latestObservation.theoreticalMaxKg,
          latestObservation.recommendedTheoreticalMaxKg * CAPABILITY_CATCH_UP_MAX_RATIO,
        ))
      : recoveredCap
    const adjusted = Math.min(smoothed * multiplier, cap)
    loggedEffortCatchUpApplied = cap > recoveredCap && adjusted > recoveredCap
    capabilityApplied = adjusted !== smoothed
    smoothed = adjusted
  }
  const inactivityDays = Math.max(0, (nowMs - history.lastUsedAtMs) / DAY_MS)
  if (inactivityDays > 28) {
    const loss = Math.min(1 / 3, ((inactivityDays - 28) / (180 - 28)) * (1 / 3))
    smoothed *= 1 - loss
  }
  return { maxKg: smoothed, capabilityApplied, shortHistoryOutlierClamped, loggedEffortCatchUpApplied }
}

function smoothedHistoricalReps(
  history: ExerciseHistory | undefined,
  nowMs: number,
): { maxReps: number; upwardStepLimited: boolean } | null {
  if (!history || history.repObservations.length === 0) return null
  let observations = [...history.repObservations].sort((a, b) => a.dateMs - b.dateMs)
  let targetAdjustedCapacity: number | null = null
  let upwardStepLimited = false
  observations = observations.map((item) => {
    // Planned reps are stored as placeholders. Treat their set-adjusted
    // capacity as the expectation: exact completion confirms the prior
    // estimate. Targetless legacy rows move toward their absolute capacity;
    // target-bearing rows move by completed-vs-target difference. Only large
    // upward steps are bounded so a typo cannot become a sticky 20-rep target,
    // while underperformance and intentional deloads still correct in full.
    if (targetAdjustedCapacity == null) {
      targetAdjustedCapacity = item.maxReps
    } else {
      const step = item.recommendedMaxReps == null
        ? item.maxReps - targetAdjustedCapacity
        : item.maxReps - item.recommendedMaxReps
      const upwardLimit = Math.max(
        REP_CAPACITY_MIN_UPWARD_STEP,
        targetAdjustedCapacity * REP_CAPACITY_UPWARD_RATIO,
      )
      const boundedStep = Math.min(step, upwardLimit)
      if (boundedStep !== step) upwardStepLimited = true
      targetAdjustedCapacity = Math.max(0.5, targetAdjustedCapacity + boundedStep)
    }
    return { ...item, maxReps: targetAdjustedCapacity }
  })
  if (observations.length >= 15) {
    const values = observations.map((item) => item.maxReps)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const std = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1))
    const replacement = median(values)
    observations = observations.map((item) => ({
      ...item,
      maxReps: std > 0 && Math.abs((item.maxReps - mean) / std) > 3 ? replacement : item.maxReps,
    }))
  }
  const byDay = new Map<number, number>()
  for (const item of observations) {
    const day = Math.floor(item.dateMs / DAY_MS)
    byDay.set(day, Math.max(byDay.get(day) ?? 0, item.maxReps))
  }
  const points = [...byDay].sort(([left], [right]) => left - right)
  let smoothed = interpolateAndSmooth(points)
  const latestAtMs = Math.max(...observations.map((item) => item.dateMs))
  const inactivityDays = Math.max(0, (nowMs - latestAtMs) / DAY_MS)
  if (inactivityDays > 28) {
    const loss = Math.min(1 / 3, ((inactivityDays - 28) / (180 - 28)) * (1 / 3))
    smoothed *= 1 - loss
  }
  return { maxReps: smoothed, upwardStepLimited }
}

function roundedWeight(weightKg: number): number {
  const increment = weightKg < 10 ? 1 : weightKg < 20 ? 2 : 5
  return Math.max(0, Math.round(weightKg / increment) * increment)
}

function roundedWeightAtOrBelow(weightKg: number): number {
  const increment = weightKg < 10 ? 1 : weightKg < 20 ? 2 : 5
  return Math.max(0, Math.floor((weightKg + 1e-9) / increment) * increment)
}

function rawWeightForScheme(theoreticalMaxKg: number, scheme: Scheme): number {
  return theoreticalMaxKg * (1.0278 - Math.min(scheme.reps, 20) * 0.0278) / (1 + scheme.sets * 0.018)
}

type OptimPlateLoadingResolution = {
  mode: PlateLoadingMode
  override: OptimExerciseLoadModeMetadata | null
}

function resolveOptimPlateLoadingMode(exercise: AdaptedExercise): OptimPlateLoadingResolution {
  const sharedMode = resolvePlateLoadingMode(exercise.source)
  const override = sharedMode === 'barbell'
    ? getOptimExerciseLoadModeMetadata(exercise.source)
    : null
  return { mode: override?.mode ?? sharedMode, override }
}

type LoadResolution = {
  weightKg: number | null
  reps: number
  trace: string | null
}

function supportedPlateWeightAtOrBelow(
  targetWeightKg: number,
  mode: Exclude<PlateLoadingMode, 'none'>,
  measurementSystem: MeasurementSystem = 'metric',
): number | null {
  const config = WEIGHT_CONFIGS[measurementSystem]
  const targetWeight = measurementSystem === 'imperial'
    ? convertKgToGymLbs(targetWeightKg)
    : targetWeightKg
  const barWeight = mode === 'barbell' ? config.defaultBarWeight : 0
  if (targetWeight < barWeight) return null
  const increment = measurementSystem === 'imperial'
    ? mode === 'barbell' ? 5 : 2.5
    : mode === 'barbell' ? 1 : 0.5
  let candidate = Math.floor((targetWeight + 1e-9) / increment) * increment
  while (candidate >= barWeight) {
    const plateTarget = mode === 'barbell' ? (candidate - barWeight) / 2 : candidate
    const plates = calculatePlatesForWeight(plateTarget, config.plates, [])
    const loaded = plates.reduce((total, plate) => total + plate, 0)
    if (candidate > 0 && Math.abs(loaded - plateTarget) < 1e-6) {
      const supportedKg = measurementSystem === 'imperial'
        ? convertGymLbsToKg(candidate)
        : candidate
      return Math.round(supportedKg * 100_000) / 100_000
    }
    candidate = Math.round((candidate - increment) * 100) / 100
  }
  return null
}

function observedWeightOptions(history: ExerciseHistory | undefined): number[] {
  return [...new Set((history?.observedWeightsKg ?? []).filter(weight => Number.isFinite(weight) && weight > 0))]
    .sort((left, right) => left - right)
}

function roundHalfToEven(value: number): number {
  const floor = Math.floor(value)
  const fraction = value - floor
  if (Math.abs(fraction - 0.5) < 1e-10) return floor % 2 === 0 ? floor : floor + 1
  return Math.round(value)
}

function repsForAdjustedWeight(
  theoreticalMaxKg: number,
  setCount: number,
  weightKg: number,
  intendedReps = 4,
): number | null {
  const raw = Math.max(
    0,
    roundHalfToEven((-1 * ((weightKg * (1 + setCount * 0.018)) / theoreticalMaxKg - 1.0278)) / 0.0278),
  )
  return raw === 0 || raw > 50 ? null : clamp(raw, Math.min(4, Math.max(1, intendedReps)), 20)
}

function resolveLoad(
  rawWeightKg: number,
  exercise: AdaptedExercise,
  history: ExerciseHistory | undefined,
  enabled: boolean,
  measurementSystem: MeasurementSystem = 'metric',
): { weightKg: number | null; trace: string | null } {
  if (!enabled) {
    const rounded = roundedWeight(rawWeightKg)
    return { weightKg: rounded > 0 ? rounded : null, trace: null }
  }
  const plateResolution = resolveOptimPlateLoadingMode(exercise)
  const plateMode = plateResolution.mode
  const overrideTrace = plateResolution.override
    ? `Optim load-mode metadata reclassified stale barbell mechanics to ${plateMode === 'single' ? 'single-point plate loading' : 'ordinary numeric loading'} (${plateResolution.override.provenance.rule}); production plate keyboards remain unchanged`
    : null
  if (plateMode !== 'none') {
    const supported = supportedPlateWeightAtOrBelow(rawWeightKg, plateMode, measurementSystem)
    const config = WEIGHT_CONFIGS[measurementSystem]
    return supported == null
      ? {
          weightKg: null,
          trace: `${plateMode === 'barbell'
            ? `Executable-load guard omitted ${round(rawWeightKg, 1)} kg because it is below the ${config.defaultBarWeight} ${config.unit} default bar`
            : `Executable-load guard omitted ${round(rawWeightKg, 1)} kg because no positive load is supported by the existing ${measurementSystem} plate configuration`}${overrideTrace ? `; ${overrideTrace}` : ''}`,
        }
      : {
          weightKg: supported,
          trace: `Snapped to a ${plateMode === 'barbell' ? 'two-sided barbell' : 'single-point'} load supported by the existing JustGains ${measurementSystem} plate configuration${overrideTrace ? `; ${overrideTrace}` : ''}`,
        }
  }
  const observed = observedWeightOptions(history)
  if (observed.length >= 2 && rawWeightKg >= observed[0]! && rawWeightKg <= observed.at(-1)!) {
    // Hermes in the current mobile runtime does not provide ES2023
    // Array.prototype.toSorted. Copy before sorting so observed history stays
    // immutable without making workout updates depend on that newer API.
    const nearest = [...observed].sort(
      (left, right) => Math.abs(left - rawWeightKg) - Math.abs(right - rawWeightKg) || left - right,
    )[0]!
    return {
      weightKg: nearest,
      trace: `Snapped to ${round(nearest, 2)} kg from this exercise's actually logged per-side-aware load history${overrideTrace ? `; ${overrideTrace}` : ''}`,
    }
  }
  const rounded = roundedWeight(rawWeightKg)
  return {
    weightKg: rounded > 0 ? rounded : null,
    trace: `${observed.length >= 2
      ? 'Target was outside the observed load range; retained recovered generic rounding instead of treating history as a complete rack inventory'
      : 'No trustworthy per-exercise load inventory; retained recovered generic rounding'}${overrideTrace ? `; ${overrideTrace}` : ''}`,
  }
}

function resolveWorkingLoad(
  theoreticalMaxKg: number,
  scheme: Scheme,
  exercise: AdaptedExercise,
  history: ExerciseHistory | undefined,
  enabled: boolean,
  measurementSystem: MeasurementSystem = 'metric',
): LoadResolution {
  const rawWeightKg = rawWeightForScheme(theoreticalMaxKg, scheme)
  const resolved = resolveLoad(rawWeightKg, exercise, history, enabled, measurementSystem)
  const adjustedReps = resolved.weightKg == null || Math.abs(resolved.weightKg - rawWeightKg) < 1e-9
    ? null
    : repsForAdjustedWeight(theoreticalMaxKg, scheme.sets, resolved.weightKg, scheme.reps)
  return {
    ...resolved,
    reps: adjustedReps ?? scheme.reps,
  }
}

type LoadFeasibility = 'feasible' | 'infeasible' | 'unknown'

function executableLoadFeasibility(
  exercise: AdaptedExercise,
  position: number,
  core: boolean,
  inputs: OptimDemoInputs,
  history: ExerciseHistory | undefined,
  referenceHistory: ExerciseHistory | undefined,
  gender: string | null,
  ageYears: number | null,
  nowMs: number,
): LoadFeasibility {
  if (inputs.executableLoadsEnabled !== true) return 'feasible'
  if (exercise.isBodyweight || exercise.isAssisted || exercise.isTimed || exercise.isDistance || exercise.isBand) return 'feasible'
  const resolved = resolveScheme(exercise, inputs, position, core, nowMs)
  if (resolved.timed) return 'feasible'
  const historicalMax = smoothedHistoricalMax(
    history,
    nowMs,
    inputs.measuredEffortCapabilityHoldEnabled === true,
    inputs.loggedEffortCatchUpEnabled === true,
  )
  const referenceHistoricalMax = historicalMax == null && exercise.relationship
    ? smoothedHistoricalMax(
        referenceHistory,
        nowMs,
        inputs.measuredEffortCapabilityHoldEnabled === true,
        inputs.loggedEffortCatchUpEnabled === true,
      )
    : null
  const derivedHistoricalMax = referenceHistoricalMax && exercise.relationship
    ? referenceHistoricalMax.maxKg * exercise.relationship.relativeWeight
    : null
  // Legacy circuit prescriptions intentionally withhold demographic warm-start
  // loads, but selection still needs the prediction to reject a mechanically
  // impossible sub-bar target. Otherwise merely enabling circuits can swap in
  // an unsafe plate-loaded exercise even when no circuit group is emitted.
  const warmStart = historicalMax == null && derivedHistoricalMax == null
    ? getWarmStartPrediction(exercise.source, inputs, gender, ageYears)
    : null
  const referenceWarmStart = warmStart == null &&
    historicalMax == null &&
    derivedHistoricalMax == null &&
    exercise.relationship &&
    inputs.relationshipWarmStartEnabled === true
    ? getWarmStartPrediction(
        { exerciseCode: exercise.relationship.referenceExerciseCode },
        inputs,
        gender,
        ageYears,
      )
    : null
  const derivedWarmStartMax = referenceWarmStart && exercise.relationship
    ? referenceWarmStart.predictedMaxKg * exercise.relationship.relativeWeight
    : null
  const theoreticalMaxKg = historicalMax?.maxKg ??
    derivedHistoricalMax ??
    warmStart?.predictedMaxKg ??
    derivedWarmStartMax
  if (theoreticalMaxKg == null) return 'unknown'
  if (resolveOptimPlateLoadingMode(exercise).mode !== 'barbell') return 'feasible'
  const plannedWorkingWeight = rawWeightForScheme(theoreticalMaxKg, resolved.scheme)
  const measurementSystem = inputs.executableLoadMeasurementSystem ?? 'metric'
  const plannedWeight = measurementSystem === 'imperial'
    ? convertKgToGymLbs(plannedWorkingWeight)
    : plannedWorkingWeight
  return plannedWeight >= WEIGHT_CONFIGS[measurementSystem].defaultBarWeight ? 'feasible' : 'infeasible'
}

function restSeconds(exercise: AdaptedExercise, inputs: OptimDemoInputs, position: number): number {
  if (exercise.isBand) return 15
  const choices = [30, 45, 60, 75, 90, 120, 150, 180, 300]
  let index = inputs.goal === 'muscleTone' ? 1 : 2
  const tier = tierForGoal(exercise, inputs.goal)
  if (exercise.isCore) index = 0
  else if (inputs.goal === 'olympic' || inputs.goal === 'powerlifting') index += tier === 1 ? 3 : tier === 2 ? 2 : 1
  else if (tier === 1) index += position === 0 ? 2 : position === 1 ? 1 : 0
  if (exercise.targetPercentage === 10) index += 1
  return choices[clamp(index, 0, choices.length - 1)]!
}

function warmupSets(
  workingWeight: number,
  workingReps: number,
  rest: number,
  resolveWeight: (targetWeightKg: number) => number | null = roundedWeight,
): OptimDemoSet[] {
  const targets = [0.6, 0.75, 0.9]
  const reps = [8, 5, 3]
  const rests = [45, 45, 60]
  const result: OptimDemoSet[] = []
  let previous = 0
  targets.forEach((target, index) => {
    const weight = resolveWeight(workingWeight * target)
    if (weight == null) return
    if (weight <= previous || weight >= workingWeight) return
    previous = weight
    result.push({
      setNumber: result.length + 1,
      setType: 'warmup',
      reps: Math.min(reps[index]!, workingReps * 2),
      weightKg: weight,
      restSeconds: Math.min(rests[index]!, rest),
    })
  })
  return result
}

function makeStrengthExercise(
  scored: ScoredExercise,
  inputs: OptimDemoInputs,
  history: ExerciseHistory | undefined,
  referenceHistory: ExerciseHistory | undefined,
  position: number,
  core: boolean,
  maxEffortAlreadyUsed: boolean,
  bodyWeightKg: number | null,
  gender: string | null,
  ageYears: number | null,
  strengthDurationMinutes: number,
  requestedNonCore: number,
  requestedCore: number,
  nowMs: number,
): OptimDemoExercise {
  const exercise = scored.exercise
  const resolved = resolveScheme(exercise, inputs, position, core, nowMs)
  const day = dayOfYear(new Date(nowMs))
  const canMax = Boolean(
    history &&
    history.workoutCount >= 3 &&
    inputs.experience !== 'beginner' &&
    !exercise.isTimed &&
    !exercise.isDistance &&
    exercise.bodyweightMetadata == null &&
    exercise.primaryBucket &&
    !maxEffortAlreadyUsed &&
    !inputs.circuitsEnabled,
  )
  const cadenceSeed = Math.abs(inputs.seed + day)
  let maxEffort = canMax && cadenceSeed % 4 === 0
  const suppressExternalBodyweightLoad =
    inputs.bodyweightOnlyLoadExclusionEnabled === true && inputs.bodyweightOnly
  const cadenceWeightedBodyweightCandidate = Boolean(
    history &&
    exercise.isBodyweight &&
    !exercise.isAssisted &&
    bodyWeightKg != null &&
    bodyWeightKg > 0 &&
    cadenceSeed % 3 === 0,
  )
  const cadenceWeightedBodyweight = cadenceWeightedBodyweightCandidate && !suppressExternalBodyweightLoad
  let scheme = maxEffort ? { ...resolved.scheme, sets: 4, reps: Math.min(8, resolved.scheme.reps) } : resolved.scheme
  const rest = restSeconds(exercise, inputs, position)
  let durationCapped = false
  let maximumSets: number | null = null
  let perExerciseBudgetSeconds: number | null = null
  if (inputs.goal === 'olympic' && !core) {
    const nonCoreBudgetSeconds = Math.max(
      requestedNonCore * 120,
      strengthDurationMinutes * 60 - requestedCore * 4 * 60,
    )
    perExerciseBudgetSeconds = Math.max(
      120,
      nonCoreBudgetSeconds / Math.max(1, requestedNonCore) - 45,
    )
  } else if (inputs.goal !== 'olympic') {
    const exerciseCount = Math.max(1, requestedNonCore + requestedCore)
    perExerciseBudgetSeconds = Math.max(
      90,
      strengthDurationMinutes * 60 / exerciseCount - 30,
    )
  }
  if (perExerciseBudgetSeconds != null) {
    const workSeconds = resolved.timed ? scheme.reps : scheme.reps * 3
    maximumSets = Math.max(2, Math.floor((perExerciseBudgetSeconds + rest) / (workSeconds + rest)))
  }
  if (maximumSets != null && scheme.sets > maximumSets) {
    scheme = { ...scheme, sets: maximumSets }
    durationCapped = true
  }
  if (maximumSets != null && maxEffort && scheme.sets < 4) {
    maxEffort = false
    scheme = { ...resolved.scheme, sets: Math.min(resolved.scheme.sets, maximumSets) }
    durationCapped = scheme.sets < resolved.scheme.sets
  }
  const historicalMax = smoothedHistoricalMax(
    history,
    nowMs,
    inputs.measuredEffortCapabilityHoldEnabled === true,
    inputs.loggedEffortCatchUpEnabled === true,
  )
  const canUseRelationship = Boolean(
    historicalMax == null &&
    exercise.relationship &&
    !exercise.isBodyweight &&
    !exercise.isAssisted &&
    !exercise.isTimed &&
    !exercise.isDistance &&
    !resolved.timed &&
    !maxEffort,
  )
  const referenceHistoricalMax = canUseRelationship
    ? smoothedHistoricalMax(
        referenceHistory,
        nowMs,
        inputs.measuredEffortCapabilityHoldEnabled === true,
        inputs.loggedEffortCatchUpEnabled === true,
      )
    : null
  const derivedHistoricalMax = referenceHistoricalMax && exercise.relationship
    ? referenceHistoricalMax.maxKg * exercise.relationship.relativeWeight
    : null
  const canUseWarmStart = Boolean(
    historicalMax == null &&
    derivedHistoricalMax == null &&
    !exercise.isBodyweight &&
    !exercise.isAssisted &&
    !exercise.isTimed &&
    !exercise.isDistance &&
    !exercise.isBand &&
    !resolved.timed &&
    !maxEffort &&
    (!inputs.circuitsEnabled || inputs.circuitLoadGuidanceEnabled === true),
  )
  const warmStart = canUseWarmStart
    ? getWarmStartPrediction(exercise.source, inputs, gender, ageYears)
    : null
  const referenceWarmStart = canUseWarmStart &&
    warmStart == null &&
    exercise.relationship &&
    inputs.relationshipWarmStartEnabled === true
    ? getWarmStartPrediction(
        { exerciseCode: exercise.relationship.referenceExerciseCode },
        inputs,
        gender,
        ageYears,
      )
    : null
  const derivedWarmStartMax = referenceWarmStart && exercise.relationship
    ? referenceWarmStart.predictedMaxKg * exercise.relationship.relativeWeight
    : null
  const max = historicalMax?.maxKg ??
    derivedHistoricalMax ??
    warmStart?.predictedMaxKg ??
    derivedWarmStartMax
  const smoothedRepCapacity = smoothedHistoricalReps(history, nowMs)
  const loadResolution = max && !exercise.isBodyweight && !resolved.timed
    ? resolveWorkingLoad(
        max,
        scheme,
        exercise,
        history,
        inputs.executableLoadsEnabled === true,
        inputs.executableLoadMeasurementSystem ?? 'metric',
      )
    : null
  const predictedWeight = loadResolution?.weightKg ?? null
  let workingReps = loadResolution?.reps ?? scheme.reps
  const olympicTechnicalRepCapApplied = usesOlympicTechnicalPrescription(exercise, inputs, core) &&
    workingReps > OLYMPIC_TECHNICAL_MAX_REPS
  if (olympicTechnicalRepCapApplied) workingReps = OLYMPIC_TECHNICAL_MAX_REPS
  const prescriptionMetadata = inputs.prescriptionRepCapsEnabled === true
    ? getOptimExercisePrescriptionMetadata(exercise.source)
    : null
  const prescriptionRepCapAppliedAfterLoad = prescriptionMetadata != null &&
    workingReps > prescriptionMetadata.maxReps
  if (prescriptionMetadata) workingReps = Math.min(workingReps, prescriptionMetadata.maxReps)
  const bodyweightBaseLoad = exercise.bodyweightMetadata && bodyWeightKg != null && bodyWeightKg > 0
    ? bodyWeightKg * exercise.bodyweightMetadata.bodyweightContribution
    : null
  const effectiveAddedTargetCandidate =
    historicalMax &&
    exercise.bodyweightMetadata?.loadMode === 'added' &&
    bodyweightBaseLoad != null &&
    !maxEffort
      ? rawWeightForScheme(historicalMax.maxKg, scheme) - bodyweightBaseLoad
      : null
  const effectiveAddedTarget = suppressExternalBodyweightLoad
    ? null
    : effectiveAddedTargetCandidate
  const effectiveAddedLoad = effectiveAddedTarget != null && effectiveAddedTarget > 0
    ? roundedWeight(effectiveAddedTarget)
    : null
  if (historicalMax && bodyweightBaseLoad != null && !maxEffort) {
    const adjusted = repsForAdjustedWeight(
      historicalMax.maxKg,
      scheme.sets,
      bodyweightBaseLoad + (effectiveAddedLoad ?? 0),
      scheme.reps,
    )
    if (adjusted != null) workingReps = adjusted
  }
  const cadenceBodyweightLoad = cadenceWeightedBodyweight && historicalMax == null && bodyWeightKg
    ? roundedWeight(bodyWeightKg * 0.05)
    : null
  const weightedBodyweightLoad = effectiveAddedLoad && effectiveAddedLoad > 0
    ? effectiveAddedLoad
    : cadenceBodyweightLoad
  const weightedBodyweight = Boolean(weightedBodyweightLoad && weightedBodyweightLoad > 0)
  const suppressedExternalBodyweightLoad = suppressExternalBodyweightLoad && (
    (effectiveAddedTargetCandidate != null && effectiveAddedTargetCandidate > 0) ||
    (cadenceWeightedBodyweightCandidate && historicalMax == null && bodyWeightKg != null)
  )
  const historicalBodyweightReps = smoothedRepCapacity == null
    ? null
    : Math.max(1, Math.ceil(smoothedRepCapacity.maxReps / repeatableRepFactor(scheme.sets)))
  const bodyweightReps = historicalBodyweightReps == null
    ? null
    : Math.min(maxEffort ? 8 : 20, historicalBodyweightReps)
  const bodyweightRepsCapped = !maxEffort
    && historicalBodyweightReps != null
    && historicalBodyweightReps > 20
  const prescribedReps = effectiveAddedLoad != null && effectiveAddedLoad > 0
    ? workingReps
    : exercise.isBodyweight && bodyweightReps != null
      ? bodyweightReps
      : workingReps
  if (perExerciseBudgetSeconds != null && exercise.isBodyweight && !resolved.timed) {
    const finalMaximumSets = Math.max(
      2,
      Math.floor((perExerciseBudgetSeconds + rest) / (prescribedReps * 3 + rest)),
    )
    if (scheme.sets > finalMaximumSets) {
      scheme = { ...scheme, sets: finalMaximumSets }
      durationCapped = true
    }
  }
  const schemeSource = `${resolved.source}${bodyweightRepsCapped ? '; rep-capped to 20' : ''}${durationCapped ? `; duration-capped to ${scheme.sets} sets` : ''}`
  const workingSets: OptimDemoSet[] = Array.from({ length: scheme.sets }, (_, index) => ({
    setNumber: index + 1,
    setType: 'normal' as const,
    ...(resolved.timed
      ? { durationSeconds: scheme.reps }
      : {
          reps: prescribedReps,
        }),
    ...(predictedWeight != null ? { weightKg: predictedWeight } : {}),
    ...(weightedBodyweightLoad != null && weightedBodyweightLoad > 0
      ? { weightKg: weightedBodyweightLoad }
      : {}),
    restSeconds: rest,
  }))
  const warmups =
    inputs.warmupSetsEnabled && predictedWeight && predictedWeight > 0 && !exercise.isAssisted && !exercise.isTimed && !core
      ? warmupSets(
          predictedWeight,
          workingReps,
          rest,
          targetWeightKg => resolveLoad(
            targetWeightKg,
            exercise,
            history,
            inputs.executableLoadsEnabled === true,
            inputs.executableLoadMeasurementSystem ?? 'metric',
          ).weightKg,
        )
      : []
  return {
    code: exercise.code,
    name: exercise.name,
    ...(exercise.isUnilateral ? { isUnilateral: true as const } : {}),
    ...(exercise.isWeightPerSide ? { isWeightPerSide: true as const } : {}),
    phase: core ? 'core' : 'strength',
    primaryBucket: exercise.primaryBucket,
    primaryMuscles: exercise.primaryMuscles,
    equipmentCodes: exercise.equipmentCodes,
    score: scored.score,
    scoreBreakdown: scored.breakdown,
    rank: scored.rank,
    schemeSource,
    maxEffort,
    weightedBodyweight,
    theoreticalMaxKg: max == null ? null : round(max, 1),
    groupId: null,
    groupType: null,
    sets: [...warmups, ...workingSets.map((set, index) => ({ ...set, setNumber: warmups.length + index + 1 }))],
    trace: [
      `${core ? 'Core' : 'Non-core'} candidate rank ${scored.rank}, score ${scored.score}`,
      `Scheme ${schemeSource}${maxEffort ? '; promoted to 4-set max effort and capped at 8 reps' : ''}`,
      historicalMax
        ? exercise.bodyweightMetadata && bodyweightBaseLoad != null
          ? `${historicalMax.capabilityApplied ? 'Capability-adjusted' : 'Smoothed'} effective bodyweight max ${round(historicalMax.maxKg, 1)} kg (${round(bodyweightBaseLoad, 1)} kg current body-mass contribution plus/minus logged external load)${historicalMax.loggedEffortCatchUpApplied ? '; logged-RPE catch-up raised the recovered 107% anticipation cap within the observation evidence' : ''}`
          : `${historicalMax.capabilityApplied ? 'Capability-adjusted' : 'Smoothed'} historical max ${round(historicalMax.maxKg, 1)} kg${historicalMax.loggedEffortCatchUpApplied ? '; logged-RPE catch-up raised the recovered 107% anticipation cap within the observation evidence' : ''}`
        : derivedHistoricalMax != null && referenceHistoricalMax && exercise.relationship
          ? `Derived historical max ${round(derivedHistoricalMax, 1)} kg from smoothed ${exercise.relationship.referenceExerciseCode} max ${round(referenceHistoricalMax.maxKg, 1)} kg × recovered relative weight ${round(exercise.relationship.relativeWeight, 3)}${referenceHistoricalMax.capabilityApplied ? '; reference capability adjustment applied' : ''}${referenceHistoricalMax.shortHistoryOutlierClamped ? '; reference small-sample outlier bound applied' : ''}`
          : warmStart
            ? `${warmStart.productOnly ? 'Reviewed product' : 'Recovered'} demographic warm-start max ${round(warmStart.predictedMaxKg, 1)} kg for ${warmStart.gender}/${warmStart.goal}/${warmStart.experience}/age ${warmStart.ageBucket}; used only after direct and relationship history were unavailable`
            : derivedWarmStartMax != null && referenceWarmStart && exercise.relationship
              ? `Derived demographic warm-start max ${round(derivedWarmStartMax, 1)} kg from ${referenceWarmStart.productOnly ? 'reviewed product' : 'recovered'} ${exercise.relationship.referenceExerciseCode} warm-start max ${round(referenceWarmStart.predictedMaxKg, 1)} kg × recovered relative weight ${round(exercise.relationship.relativeWeight, 3)}; used only after direct history, relationship history, and a direct warm-start cell were unavailable`
            : smoothedRepCapacity != null && exercise.isBodyweight
              ? `Smoothed target-relative bodyweight rep capacity ${round(smoothedRepCapacity.maxReps, 1)}; load remains unset`
              : 'No usable local weight/reps history; load left unset',
      ...(historicalMax?.shortHistoryOutlierClamped
        ? ['Small-sample high-load outlier bounded to 150% of the lower-median history before smoothing.']
        : []),
      ...(smoothedRepCapacity?.upwardStepLimited
        ? ['Large upward rep-capacity step bounded; downward corrections remain unrestricted.']
        : []),
      effectiveAddedLoad != null && effectiveAddedLoad > 0
        ? `Effective bodyweight history prescribed ${round(effectiveAddedLoad, 1)} kg of added external load; stored BODYWEIGHT_PLUS_WEIGHT semantics remain added-only`
        : cadenceWeightedBodyweight && cadenceBodyweightLoad != null
          ? 'Weighted-bodyweight fallback adds 5% of current profile bodyweight'
          : suppressedExternalBodyweightLoad
            ? 'Bodyweight-only product policy kept external load off; progression stays in reps or a harder movement variation'
          : 'No weighted-bodyweight fallback',
      ...(bodyweightRepsCapped
        ? [suppressExternalBodyweightLoad
            ? 'Bodyweight progression capped at 20 reps; continued progression uses a harder movement variation rather than unbounded rep targets.'
            : 'Bodyweight progression capped at 20 reps; continued progression uses added load or a harder movement rather than unbounded rep targets.']
        : []),
      warmups.length > 0 ? `${warmups.length} warm-up sets added at 60/75/90% targets` : 'No eligible warm-up sets added',
      ...(loadResolution?.trace ? [loadResolution.trace] : []),
      ...(olympicTechnicalRepCapApplied
        ? ['Olympic technical prescription kept at five reps after load snapping; the lighter executable load intentionally retains technique margin instead of inflating reps.']
        : []),
      ...(resolved.source.includes('prescription metadata capped') || prescriptionRepCapAppliedAfterLoad
        ? [`High-confidence prescription metadata capped loaded trunk-flexion work at ${prescriptionMetadata?.maxReps} reps (${prescriptionMetadata?.provenance.rule}).`]
        : []),
      ...(exercise.isUnilateral
        ? ['Recovered unilateral flag; rep-based prescriptions and loads are displayed per side without changing their stored values.']
        : []),
      ...(exercise.isWeightPerSide
        ? ['Catalog weight-per-side flag; every weight value is per side and remains numerically unchanged.']
        : []),
    ],
  }
}

export function estimatedExerciseSeconds(exercise: OptimDemoExercise): number {
  const total = exercise.sets.reduce(
    (seconds, set) => seconds + (set.durationSeconds ?? (set.reps ?? 0) * 3) + set.restSeconds,
    0,
  )
  return total - (exercise.sets.at(-1)?.restSeconds ?? 0)
}

function trimWarmupsToStrengthBudget(
  exercises: OptimDemoExercise[],
  sourceByCode: Map<string, AdaptedExercise>,
  budgetSeconds: number,
): number {
  let estimatedSeconds = exercises.reduce((total, exercise) => total + estimatedExerciseSeconds(exercise), 0)
  if (estimatedSeconds <= budgetSeconds) return 0
  const removalOrder = exercises
    .map((exercise, index) => ({ exercise, index, primary: sourceByCode.get(exercise.code)?.isPrimaryLift === true }))
    .filter(({ exercise }) => exercise.sets.some(set => set.setType === 'warmup'))
    .sort((left, right) => Number(left.primary) - Number(right.primary) || right.index - left.index)
  const removedByCode = new Map<string, number>()

  for (const { exercise } of removalOrder) {
    while (estimatedSeconds > budgetSeconds) {
      const warmupIndex = exercise.sets.findIndex(set => set.setType === 'warmup')
      if (warmupIndex < 0) break
      exercise.sets.splice(warmupIndex, 1)
      removedByCode.set(exercise.code, (removedByCode.get(exercise.code) ?? 0) + 1)
      estimatedSeconds = exercises.reduce((total, item) => total + estimatedExerciseSeconds(item), 0)
    }
    if (estimatedSeconds <= budgetSeconds) break
  }

  for (const exercise of exercises) {
    exercise.sets = exercise.sets.map((set, index) => ({ ...set, setNumber: index + 1 }))
    const removed = removedByCode.get(exercise.code) ?? 0
    if (removed > 0) {
      exercise.trace.push(`${removed} lower-priority warm-up set${removed === 1 ? '' : 's'} removed to fit the strength-stage duration budget`)
    }
  }
  return [...removedByCode.values()].reduce((total, count) => total + count, 0)
}

function cardioDurationMinutes(inputs: OptimDemoInputs): number {
  const multiplier: Record<OptimDemoGoal, number> = {
    olympic: 0.05,
    powerlifting: 0.1,
    bodybuilding: 0.15,
    strength: 0.2,
    general: 0.25,
    muscleTone: 0.4,
  }
  const raw = Math.max(5, Math.floor(inputs.durationMinutes * multiplier[inputs.goal]))
  const increment = raw >= 20 ? 5 : raw >= 10 ? 2 : 1
  return Math.round(raw / increment) * increment
}

function makeCardioExercise(
  exercise: AdaptedExercise,
  inputs: OptimDemoInputs,
  durationMinutes = cardioDurationMinutes(inputs),
): OptimDemoExercise {
  const targetDurationMinutes = cardioDurationMinutes(inputs)
  const durationTrace = durationMinutes === targetDurationMinutes
    ? `Goal multiplier produced ${durationMinutes} cardio minutes`
    : `Hard duration cap allocated ${durationMinutes} of ${targetDurationMinutes} planned cardio minutes`
  if (exercise.isDistance) {
    return {
      code: exercise.code,
      name: exercise.name,
      ...(exercise.isUnilateral ? { isUnilateral: true as const } : {}),
      ...(exercise.isWeightPerSide ? { isWeightPerSide: true as const } : {}),
      phase: 'cardio',
      primaryBucket: exercise.primaryBucket,
      primaryMuscles: exercise.primaryMuscles,
      equipmentCodes: exercise.equipmentCodes,
      score: null,
      scoreBreakdown: null,
      rank: null,
      schemeSource: `${durationMinutes}-minute distance cardio`,
      maxEffort: false,
      weightedBodyweight: false,
      theoreticalMaxKg: null,
      groupId: null,
      groupType: null,
      sets: [{ setNumber: 1, setType: 'normal', durationSeconds: durationMinutes * 60, distanceMeters: 0, restSeconds: 0 }],
      trace: [durationTrace, 'Distance starts at zero for the user to log'],
    }
  }
  if (!exercise.isTimed) {
    const setCount = Math.max(3, Math.min(8, Math.round(durationMinutes / 3)))
    const reps = exercise.repsScale === 1 ? 10 : exercise.repsScale === 2 ? 30 : 20
    return {
      code: exercise.code,
      name: exercise.name,
      ...(exercise.isUnilateral ? { isUnilateral: true as const } : {}),
      ...(exercise.isWeightPerSide ? { isWeightPerSide: true as const } : {}),
      phase: 'cardio',
      primaryBucket: exercise.primaryBucket,
      primaryMuscles: exercise.primaryMuscles,
      equipmentCodes: exercise.equipmentCodes,
      score: null,
      scoreBreakdown: null,
      rank: null,
      schemeSource: `${setCount} rep-based cardio rounds`,
      maxEffort: false,
      weightedBodyweight: false,
      theoreticalMaxKg: null,
      groupId: null,
      groupType: null,
      sets: Array.from({ length: setCount }, (_, index) => ({
        setNumber: index + 1,
        setType: 'normal' as const,
        reps,
        restSeconds: 30,
      })),
      trace: [
        durationTrace,
        `Rep-only catalog movement uses ${setCount} rounds of ${reps} instead of an invented duration`,
      ],
    }
  }
  const setDuration = exercise.tags.some((tag) => tag.includes('JUMP_ROPE')) || /JUMP.?ROPE/i.test(exercise.name) ? 90 : 120
  const cappedSeconds = Math.min(durationMinutes * 60, 900)
  const setCount = Math.max(3, Math.floor(cappedSeconds / (setDuration + 30)))
  return {
    code: exercise.code,
    name: exercise.name,
    ...(exercise.isUnilateral ? { isUnilateral: true as const } : {}),
    ...(exercise.isWeightPerSide ? { isWeightPerSide: true as const } : {}),
    phase: 'cardio',
    primaryBucket: exercise.primaryBucket,
    primaryMuscles: exercise.primaryMuscles,
    equipmentCodes: exercise.equipmentCodes,
    score: null,
    scoreBreakdown: null,
    rank: null,
    schemeSource: `${setCount} cardio intervals`,
    maxEffort: false,
    weightedBodyweight: false,
    theoreticalMaxKg: null,
    groupId: null,
    groupType: null,
    sets: Array.from({ length: setCount }, (_, index) => ({ setNumber: index + 1, setType: 'normal' as const, durationSeconds: setDuration, restSeconds: 30 })),
    trace: [durationTrace, `${setCount} sets after the 3-set minimum and 900-second cap`],
  }
}

function makeMobilityExercise(exercise: AdaptedExercise, phase: 'mobilityWarmup' | 'mobilityCooldown'): OptimDemoExercise {
  return {
    code: exercise.code,
    name: exercise.name,
    ...(exercise.isUnilateral ? { isUnilateral: true as const } : {}),
    ...(exercise.isWeightPerSide ? { isWeightPerSide: true as const } : {}),
    phase,
    primaryBucket: exercise.primaryBucket,
    primaryMuscles: exercise.primaryMuscles,
    equipmentCodes: exercise.equipmentCodes,
    score: null,
    scoreBreakdown: null,
    rank: null,
    schemeSource: 'mobility routine',
    maxEffort: false,
    weightedBodyweight: false,
    theoreticalMaxKg: null,
    groupId: null,
    groupType: null,
    sets: [{ setNumber: 1, setType: 'normal', durationSeconds: 60, restSeconds: 5 }],
    trace: ['Selected from available mobility exercises', 'One 60-second movement with 5-second transition'],
  }
}

function canCircuit(first: OptimDemoExercise, second: OptimDemoExercise, sourceByCode: Map<string, AdaptedExercise>, inputs: OptimDemoInputs): boolean {
  const a = sourceByCode.get(first.code)
  const b = sourceByCode.get(second.code)
  if (!a || !b || a.isCardio || b.isCardio || first.phase !== second.phase) return false
  const restricted =
    a.isPrimaryLift || b.isPrimaryLift ||
    tierForGoal(a, inputs.goal) === 1 || tierForGoal(b, inputs.goal) === 1
  const bodyweightPatternException =
    inputs.bodyweightCircuitPatternGroupingEnabled === true &&
    inputs.bodyweightOnly &&
    a.isBodyweight && b.isBodyweight &&
    (inputs.goal === 'general' || inputs.goal === 'bodybuilding' || inputs.goal === 'muscleTone') &&
    !first.maxEffort && !second.maxEffort &&
    !first.weightedBodyweight && !second.weightedBodyweight
  const generalAccessoryException =
    inputs.generalAccessoryCircuitGroupingEnabled === true &&
    inputs.circuitLoadGuidanceEnabled === true &&
    inputs.goal === 'general' &&
    !a.isMainLift && !b.isMainLift &&
    !a.isMobility && !b.isMobility &&
    !a.isTimed && !b.isTimed &&
    !a.isDistance && !b.isDistance &&
    !first.maxEffort && !second.maxEffort &&
    !first.weightedBodyweight && !second.weightedBodyweight
  const corePhaseException =
    inputs.corePhasePairGroupingEnabled === true &&
    first.phase === 'core' && second.phase === 'core' &&
    !a.isPrimaryLift && !b.isPrimaryLift &&
    !a.isMainLift && !b.isMainLift &&
    !first.maxEffort && !second.maxEffort
  const inferredAccessoryException =
    inputs.inferredAccessoryPairGroupingEnabled === true &&
    inputs.circuitLoadGuidanceEnabled === true &&
    isInferredAccessory(a, inputs.goal) && isInferredAccessory(b, inputs.goal) &&
    !a.isMobility && !b.isMobility &&
    !a.isTimed && !b.isTimed &&
    !a.isDistance && !b.isDistance &&
    !first.maxEffort && !second.maxEffort &&
    !first.weightedBodyweight && !second.weightedBodyweight
  if (
    restricted &&
    !bodyweightPatternException &&
    !generalAccessoryException &&
    !corePhaseException &&
    !inferredAccessoryException
  ) return false
  return groupEquipmentCompatible(a, b)
}

function groupEquipmentCompatible(first: AdaptedExercise, second: AdaptedExercise): boolean {
  if (first.isBodyweight || second.isBodyweight) return true
  const firstEquipment = [...first.equipmentCodes].sort()
  const secondEquipment = [...second.equipmentCodes].sort()
  return firstEquipment.length === secondEquipment.length &&
    firstEquipment.every((equipment, index) => equipment === secondEquipment[index])
}

const SUPERSET_STATIONARY_SUPPORT = new Set(['EXERCISE_BENCH', 'INCLINE_BENCH', 'BOX'])
const SUPERSET_PORTABLE_IMPLEMENT = new Set(['DUMBBELLS'])

function supersetStationCompatible(first: AdaptedExercise, second: AdaptedExercise): boolean {
  const firstEquipment = new Set(first.equipmentCodes)
  const secondEquipment = new Set(second.equipmentCodes)
  const firstIsSubset = firstEquipment.size < secondEquipment.size &&
    [...firstEquipment].every((equipment) => secondEquipment.has(equipment))
  const secondIsSubset = secondEquipment.size < firstEquipment.size &&
    [...secondEquipment].every((equipment) => firstEquipment.has(equipment))
  if (!firstIsSubset && !secondIsSubset) return false

  const firstImplement = [...firstEquipment].filter((equipment) => !SUPERSET_STATIONARY_SUPPORT.has(equipment)).sort()
  const secondImplement = [...secondEquipment].filter((equipment) => !SUPERSET_STATIONARY_SUPPORT.has(equipment)).sort()
  return firstImplement.length > 0 &&
    firstImplement.length === secondImplement.length &&
    firstImplement.every((equipment, index) =>
      equipment === secondImplement[index] && SUPERSET_PORTABLE_IMPLEMENT.has(equipment))
}

function canSuperset(
  first: OptimDemoExercise,
  second: OptimDemoExercise,
  sourceByCode: Map<string, AdaptedExercise>,
  inputs: OptimDemoInputs,
): boolean {
  const a = sourceByCode.get(first.code)
  const b = sourceByCode.get(second.code)
  if (!a || !b || first.phase !== second.phase) return false
  const corePhasePair =
    inputs.corePhasePairGroupingEnabled === true &&
    first.phase === 'core' && second.phase === 'core' &&
    !a.isPrimaryLift && !b.isPrimaryLift &&
    !a.isMainLift && !b.isMainLift
  if (a.isCardio || b.isCardio || a.isMobility || b.isMobility || a.isDistance || b.isDistance) return false
  // Timed work stays out of supersets except a core-phase pair: a hold next
  // to a rep movement is ordinary core programming under set-major execution.
  if ((a.isTimed || b.isTimed) && !corePhasePair) return false
  if (first.maxEffort || second.maxEffort) return false
  if (!first.primaryBucket || !second.primaryBucket) return false
  if (first.phase !== 'core' && first.primaryBucket === second.primaryBucket) return false
  if (
    !groupEquipmentCompatible(a, b) &&
    !(inputs.supersetStationSharingEnabled === true && supersetStationCompatible(a, b))
  ) return false

  if (corePhasePair) return true

  const performanceGoal = inputs.goal === 'strength' || inputs.goal === 'powerlifting' || inputs.goal === 'olympic'
  if (performanceGoal) {
    const tierOneBlocked = (candidate: AdaptedExercise) =>
      tierForGoal(candidate, inputs.goal) === 1 &&
      !(inputs.inferredAccessoryPairGroupingEnabled === true && isInferredAccessory(candidate, inputs.goal))
    return !a.isPrimaryLift && !b.isPrimaryLift && !tierOneBlocked(a) && !tierOneBlocked(b)
  }
  return !(a.isMainLift && b.isMainLift)
}

function repetitionLoadFactor(reps: number): number {
  return 1.0278 - Math.min(reps, 20) * 0.0278
}

function circuitLoadScale(reps: number): number {
  // The recovered theoretical-max equation caps at 20 reps. Bound the working
  // set at 18 before adding two reps so high-rep circuits receive the same
  // conservative reserve instead of collapsing back toward a 1.0 multiplier.
  const workingReps = clamp(Math.round(reps), 1, 18)
  return repetitionLoadFactor(workingReps + 2) / repetitionLoadFactor(workingReps)
}

function circuitTargetRpe(
  straightWeightKg: number,
  guidedWeightKg: number,
  reps: number,
): number {
  // Solve the same theoretical-max curve backwards from the *snapped* load.
  // The product displays RPE as effort bands, so retain two internal decimals
  // to make untouched history reversible without exposing noisy precision.
  const recoveredLoadFactor =
    (guidedWeightKg * repetitionLoadFactor(reps)) / straightWeightKg
  const effectiveReps = (1.0278 - recoveredLoadFactor) / 0.0278
  const rawRpe = 10 - (effectiveReps - reps)
  return clamp(Math.round(rawRpe * 100) / 100, 6, 9.5)
}

function applyCircuitLoadGuidance(
  exercise: OptimDemoExercise,
  groupId: number,
  inputs: OptimDemoInputs,
  source: AdaptedExercise,
  history: ExerciseHistory | undefined,
): void {
  const warmupCount = exercise.sets.filter((set) => set.setType === 'warmup').length
  const resolutionTraces = new Set<string>()
  const effortTargets = new Set<number>()
  let adjustedLoadCount = 0
  let adjustedHistoryWindowCount = 0
  let omittedLoadCount = 0
  const preserveExternalBodyweightLoad = source.isBodyweight || source.isAssisted
  exercise.sets = exercise.sets
    .filter((set) => set.setType === 'normal')
    .map((set, index) => {
      const base = { ...set, setNumber: index + 1 }
      if (
        preserveExternalBodyweightLoad ||
        set.weightKg == null ||
        set.reps == null
      ) return base

      // The recovered max equation caps evidence at 20 reps, so reducing the
      // load at 19+ reps cannot be inverted by any RPE value. Keep the load,
      // remove two prescribed reps, and persist RPE 8: reps + reserve returns
      // to the exact original capped capacity without teaching a false loss.
      if (set.reps >= 19) {
        adjustedHistoryWindowCount += 1
        effortTargets.add(8)
        return { ...base, reps: set.reps - 2, targetRpe: 8 }
      }

      const { weightKg: _weightKg, ...withoutWeight } = base
      const scale = circuitLoadScale(set.reps)
      const targetWeightKg = set.weightKg * scale
      const resolved = resolveLoad(
        targetWeightKg,
        source,
        history,
        inputs.executableLoadsEnabled === true,
        inputs.executableLoadMeasurementSystem ?? 'metric',
      )
      const guidedWeightKg = resolved.weightKg == null
        ? null
        : resolved.weightKg <= targetWeightKg + 1e-9
          ? resolved.weightKg
          : resolveOptimPlateLoadingMode(source).mode === 'none'
            ? roundedWeightAtOrBelow(targetWeightKg) || null
            : null
      if (guidedWeightKg == null) {
        if (resolved.trace) resolutionTraces.add(resolved.trace)
        omittedLoadCount += 1
        return withoutWeight
      }
      const impliedLoadFactor =
        (guidedWeightKg * repetitionLoadFactor(set.reps)) / set.weightKg
      const impliedEffectiveReps = (1.0278 - impliedLoadFactor) / 0.0278
      if (
        impliedEffectiveReps > 18 ||
        impliedEffectiveReps > set.reps + 4 + 1e-9
      ) {
        adjustedHistoryWindowCount += 1
        effortTargets.add(8)
        return { ...base, reps: Math.max(1, set.reps - 2), targetRpe: 8 }
      }
      const targetRpe = circuitTargetRpe(set.weightKg, guidedWeightKg, set.reps)
      if (resolved.trace) resolutionTraces.add(resolved.trace)
      if (resolved.weightKg !== guidedWeightKg) {
        resolutionTraces.add('Reserve target rounded downward so circuit guidance cannot snap back to the straight-set load')
      }
      adjustedLoadCount += 1
      effortTargets.add(targetRpe)
      return { ...withoutWeight, weightKg: guidedWeightKg, targetRpe }
    })

  if (warmupCount > 0) {
    exercise.trace.push(`Circuit ${groupId}: removed ${warmupCount} ramp set${warmupCount === 1 ? '' : 's'} before repeated rounds`)
  }
  if (adjustedLoadCount > 0) {
    exercise.trace.push(
      `Circuit ${groupId}: reduced ${adjustedLoadCount} weighted working set${adjustedLoadCount === 1 ? '' : 's'} with snapped-load RPE target${effortTargets.size === 1 ? ` ${[...effortTargets][0]}` : `s ${[...effortTargets].sort((a, b) => a - b).join('/')}`} so the planned reserve survives future history`,
    )
  }
  if (adjustedHistoryWindowCount > 0) {
    exercise.trace.push(
      `Circuit ${groupId}: kept load and reduced ${adjustedHistoryWindowCount} weighted prescription${adjustedHistoryWindowCount === 1 ? '' : 's'} by two reps at RPE 8 because reduced-load reserve would leave the reversible RPE/history window`,
    )
  }
  if (omittedLoadCount > 0) {
    exercise.trace.push(`Circuit ${groupId}: left ${omittedLoadCount} working load${omittedLoadCount === 1 ? '' : 's'} open because the reduced target was not executable`)
  }
  for (const trace of resolutionTraces) exercise.trace.push(`Circuit load guidance: ${trace}`)
}

/** Pinned starting exercises never move during partner ordering. */
function isPinnedStartingExercise(exercise: OptimDemoExercise, inputs: OptimDemoInputs): boolean {
  return inputs.startingExerciseCodes.some((code) => normalizeCode(code) === normalizeCode(exercise.code))
}

function applyCircuits(
  exercises: OptimDemoExercise[],
  inputs: OptimDemoInputs,
  sourceByCode: Map<string, AdaptedExercise>,
  history: Map<string, ExerciseHistory>,
): void {
  if (!inputs.circuitsEnabled) return
  let groupId = 1
  for (let index = 0; index < exercises.length - 1;) {
    const first = exercises[index]!
    const limit = first.phase === 'core' || inputs.goal === 'muscleTone' || inputs.bodyweightOnly ? 3 : 2
    const group = [first]
    let cursor = index + 1
    while (cursor < exercises.length && group.length < limit && canCircuit(first, exercises[cursor]!, sourceByCode, inputs)) {
      group.push(exercises[cursor]!)
      cursor += 1
    }
    if (inputs.groupPartnerReorderEnabled === true && group.length < limit) {
      // Pull compatible partners adjacent instead of relying on accidental
      // neighbors. Prescriptions are already built, phases are never crossed,
      // and pinned starting exercises stay where the user put them.
      let scan = cursor
      while (scan < exercises.length && group.length < limit) {
        const candidate = exercises[scan]!
        if (candidate.phase !== first.phase) break
        if (
          !isPinnedStartingExercise(candidate, inputs) &&
          canCircuit(first, candidate, sourceByCode, inputs)
        ) {
          exercises.splice(scan, 1)
          exercises.splice(index + group.length, 0, candidate)
          candidate.trace.push(`Circuit partner ordering moved ${candidate.name} adjacent to ${first.name}; prescriptions unchanged before circuit conversion`)
          group.push(candidate)
        }
        scan += 1
      }
    }
    if (group.length >= 2) {
      for (const exercise of group) {
        const source = sourceByCode.get(exercise.code)
        if (inputs.circuitLoadGuidanceEnabled === true && source) {
          applyCircuitLoadGuidance(exercise, groupId, inputs, source, history.get(exercise.code))
        }
        exercise.groupId = groupId
        exercise.groupType = 'circuit'
        exercise.maxEffort = false
        const preserveTimedRest =
          inputs.timedCircuitSequentialRestEnabled === true && source?.isTimed === true
        exercise.sets = exercise.sets.map((set) => ({
          ...set,
          restSeconds: preserveTimedRest
            ? set.restSeconds
            : Math.max(15, Math.floor(set.restSeconds / 2)),
        }))
        exercise.trace.push(preserveTimedRest
          ? `Circuit ${groupId}: max-effort flag cleared; timed rest preserved for JustGains sequential interval order`
          : `Circuit ${groupId}: max-effort flag cleared and rest halved (15-second floor)`)
      }
      groupId += 1
      // Partner ordering keeps the group contiguous from `index`, so advance
      // past the whole group rather than the original adjacency cursor.
      index = index + group.length
    } else {
      index += 1
    }
  }
}

function applySupersets(exercises: OptimDemoExercise[], inputs: OptimDemoInputs, sourceByCode: Map<string, AdaptedExercise>): void {
  if (!inputs.supersetsEnabled || inputs.circuitsEnabled) return
  let groupId = 1
  for (let index = 0; index < exercises.length - 1;) {
    const first = exercises[index]!
    let second = exercises[index + 1]!
    if (!canSuperset(first, second, sourceByCode, inputs)) {
      let partnerIndex = -1
      if (inputs.groupPartnerReorderEnabled === true) {
        for (let scan = index + 2; scan < exercises.length; scan += 1) {
          const candidate = exercises[scan]!
          if (candidate.phase !== first.phase) break
          if (candidate.groupId != null || isPinnedStartingExercise(candidate, inputs)) continue
          if (canSuperset(first, candidate, sourceByCode, inputs)) {
            partnerIndex = scan
            break
          }
        }
      }
      if (partnerIndex < 0) {
        index += 1
        continue
      }
      const partner = exercises[partnerIndex]!
      exercises.splice(partnerIndex, 1)
      exercises.splice(index + 1, 0, partner)
      partner.trace.push(`Superset partner ordering moved ${partner.name} adjacent to ${first.name}; prescriptions unchanged`)
      second = partner
    }
    const firstSource = sourceByCode.get(first.code)
    const secondSource = sourceByCode.get(second.code)
    const stationShared = Boolean(
      inputs.supersetStationSharingEnabled === true &&
      firstSource &&
      secondSource &&
      !groupEquipmentCompatible(firstSource, secondSource) &&
      supersetStationCompatible(firstSource, secondSource),
    )
    for (const exercise of [first, second]) {
      exercise.groupId = groupId
      exercise.groupType = 'superset'
      exercise.trace.push(`Superset ${groupId}: adjacent compatible pair; rest prescriptions remain unchanged for JustGains set-major execution`)
      if (stationShared) exercise.trace.push(`Superset ${groupId}: portable implement stays put while stationary support remains available`)
    }
    groupId += 1
    index += 2
  }
}

function chooseSeededCandidate(
  ranked: ScoredExercise[],
  predicate: (candidate: ScoredExercise) => boolean,
  seed: number,
  position: number,
  usedEquipment: Set<string>,
  selectedPatterns?: ReadonlySet<MovementPattern>,
): ScoredExercise | null {
  const passing = ranked.filter(predicate)
  const top = passing[0]
  if (!top) return null
  const competitive = passing.filter((candidate) =>
    top.score - candidate.score <= 0.15 + SCORE_COMPARISON_EPSILON)
  const novelPatternMatches = selectedPatterns?.size
    ? competitive.filter(({ exercise }) =>
        exercise.movementPattern != null && !selectedPatterns.has(exercise.movementPattern))
    : []
  const diversityMatches = novelPatternMatches.length > 0 ? novelPatternMatches : competitive
  const continuity = (candidate: ScoredExercise): number => {
    if (usedEquipment.size === 0) return 0
    if (candidate.exercise.equipmentCodes.some((code) => usedEquipment.has(code))) return 1
    return candidate.exercise.equipmentCodes.length === 0 ? 0.5 : 0
  }
  const bestContinuity = Math.max(...diversityMatches.map(continuity))
  const continuityMatches = diversityMatches.filter((candidate) => continuity(candidate) === bestContinuity)
  const first = continuityMatches[0]
  if (!first) return null
  if (seed === 0) return first
  const nearTies = continuityMatches.filter((candidate) =>
    first.score - candidate.score <= 0.05 + SCORE_COMPARISON_EPSILON)
  const index = Math.abs(Math.trunc(seed * 31 + position)) % nearTies.length
  return nearTies[index]!
}

function passesRecentAccessoryRotation(exercise: AdaptedExercise, recentCodes: Set<string>): boolean {
  return exercise.isPrimaryLift || !recentCodes.has(exercise.code)
}

function passesImplementVariantDiversity(
  exercise: AdaptedExercise,
  selectedVariantKeys: Set<string>,
): boolean {
  return !selectedVariantKeys.has(exercise.variantKey)
}

function loadReplacementCompatible(base: AdaptedExercise, candidate: AdaptedExercise): boolean {
  if (
    candidate.isBand ||
    candidate.isBodyweight ||
    candidate.isAssisted ||
    candidate.isTimed ||
    candidate.isDistance ||
    !candidate.measurements.includes('WEIGHT')
  ) return false
  if (base.variantKey !== candidate.variantKey) return false
  if (base.primaryBucket !== candidate.primaryBucket) return false
  if (
    base.primaryMuscles.length > 0 &&
    !candidate.primaryMuscles.some(muscle => base.primaryMuscles.includes(muscle))
  ) return false
  if (base.movementPattern && candidate.movementPattern !== base.movementPattern) return false
  if (base.isPrimaryLift && !candidate.isPrimaryLift) return false
  return true
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length < 2) return items
  const start = Math.abs(offset) % items.length
  return [...items.slice(start), ...items.slice(0, start)]
}

function cardioCandidateScore(exercise: AdaptedExercise): number {
  return exercise.rating + (exercise.source.isFavorited ? 0.2 : 0) + (exercise.isDistance ? 0.05 : 0)
}

function chooseCardioCandidate(
  exercises: AdaptedExercise[],
  seed: number,
  day: number,
): AdaptedExercise | null {
  const ranked = [...exercises].sort((left, right) =>
    cardioCandidateScore(right) - cardioCandidateScore(left) || left.code.localeCompare(right.code),
  )
  const first = ranked[0]
  if (!first) return null
  const topScore = cardioCandidateScore(first)
  const nearTies = ranked.filter((exercise) =>
    topScore - cardioCandidateScore(exercise) <= CARDIO_NEAR_TIE_TOLERANCE + SCORE_COMPARISON_EPSILON)
  return nearTies[Math.abs(Math.trunc(seed * 31 + day)) % nearTies.length]!
}

function mobilityRoutineCount(durationMinutes: number): number {
  return Math.min(4, Math.max(1, Math.ceil(durationMinutes / 20)))
}

function mobilityFamily(exercise: AdaptedExercise): string {
  const words = exercise.name.toUpperCase().match(/[A-Z0-9]+/g) ?? [exercise.code]
  return words.filter((word) => !['A', 'AN', 'THE', 'TO', 'WITH'].includes(word)).slice(0, 2).join('_')
}

function rankMobilityCandidates(
  exercises: AdaptedExercise[],
  phase: 'mobilityWarmup' | 'mobilityCooldown',
  strengthBuckets: Set<MuscleBucketKey>,
  day: number,
): AdaptedExercise[] {
  const phaseTag = phase === 'mobilityWarmup' ? 'GOOD_WARMUP' : 'GOOD_COOLDOWN'
  const score = (exercise: AdaptedExercise): number =>
    (exercise.primaryBucket && strengthBuckets.has(exercise.primaryBucket) ? 2 : 0) +
    (exercise.tags.includes(phaseTag) ? 1 : 0) +
    exercise.rating +
    (exercise.equipmentCodes.length === 0 ? 0.1 : 0)
  const ranked = [...exercises].sort((left, right) => score(right) - score(left) || left.code.localeCompare(right.code))
  const result: AdaptedExercise[] = []
  for (let index = 0; index < ranked.length;) {
    const groupScore = score(ranked[index]!)
    let end = index + 1
    while (end < ranked.length && score(ranked[end]!) === groupScore) end += 1
    result.push(...rotate(ranked.slice(index, end), day))
    index = end
  }
  return result
}

function selectMobilityRoutine(
  exercises: AdaptedExercise[],
  phase: 'mobilityWarmup' | 'mobilityCooldown',
  count: number,
  strengthBuckets: Set<MuscleBucketKey>,
  day: number,
  excluded: Set<string>,
): AdaptedExercise[] {
  const ranked = rankMobilityCandidates(exercises, phase, strengthBuckets, day)
  const selected: AdaptedExercise[] = []
  const usedBuckets = new Set<MuscleBucketKey>()
  const usedFamilies = new Set<string>()
  for (const requireNewBucket of [true, false]) {
    for (const exercise of ranked) {
      if (selected.length >= count) break
      const family = mobilityFamily(exercise)
      if (excluded.has(exercise.code) || selected.some((item) => item.code === exercise.code) || usedFamilies.has(family)) continue
      if (requireNewBucket && (!exercise.primaryBucket || usedBuckets.has(exercise.primaryBucket))) continue
      selected.push(exercise)
      usedFamilies.add(family)
      if (exercise.primaryBucket) usedBuckets.add(exercise.primaryBucket)
    }
  }
  for (const exercise of ranked) {
    if (selected.length >= count) break
    if (excluded.has(exercise.code) || selected.some((item) => item.code === exercise.code)) continue
    selected.push(exercise)
  }
  return selected
}

function choosePosition(
  ranked: ScoredExercise[],
  chosen: Set<string>,
  position: number,
  count: number,
  inputs: OptimDemoInputs,
  bucketCounts: Map<MuscleBucketKey, number>,
  patternCounts: Map<MovementPattern, number>,
  usedEquipment: Set<string>,
  selectedVariantKeys: Set<string>,
  recentCodes: Set<string>,
  requiredFullBodyRoles: Set<FullBodyRole> | null,
  loadFeasibility: (exercise: AdaptedExercise, position: number, core: boolean) => LoadFeasibility,
): { scored: ScoredExercise | null; backup: boolean; loadFallback: boolean } {
  const freshCapacity = inputs.split === 'fresh' ? 2 : inputs.split === 'fullBody' ? 8 : inputs.split === 'upper' ? 6 : 3
  const goalPatternCapacity = inputs.goal === 'olympic' || inputs.goal === 'powerlifting' ? 3 : 0
  const passesDistribution = (exercise: AdaptedExercise) => {
    const bucket = exercise.primaryBucket
    return !bucket || bucket === 'core' || bucketCounts.has(bucket) || bucketCounts.size < freshCapacity
  }
  const availablePatternCount = new Set(
    ranked
      .filter(({ exercise }) => passesDistribution(exercise))
      .map(({ exercise }) => exercise.movementPattern)
      .filter(Boolean),
  ).size
  const patternCapacity = Math.min(goalPatternCapacity, availablePatternCount)
  const selectedPatterns = goalPatternCapacity === 0 && patternCounts.size > 0
    ? new Set(patternCounts.keys())
    : undefined
  const passesPatternDistribution = (exercise: AdaptedExercise) => {
    if (!exercise.movementPattern) return true
    if (patternCapacity === 0) return (patternCounts.get(exercise.movementPattern) ?? 0) < 2
    if (patternCounts.size < patternCapacity) return !patternCounts.has(exercise.movementPattern)
    const minimumCount = Math.min(...patternCounts.values())
    return patternCounts.get(exercise.movementPattern) === minimumCount
  }
  const chooseBucketAwareCandidate = (
    valid: (candidate: ScoredExercise) => boolean,
  ): ScoredExercise | null => {
    const newBucketCandidate = bucketCounts.size < freshCapacity
      ? chooseSeededCandidate(ranked, (item) => {
          const bucket = item.exercise.primaryBucket
          return valid(item) && Boolean(bucket && bucket !== 'core' && !bucketCounts.has(bucket))
        }, inputs.seed, position, usedEquipment, selectedPatterns)
      : null
    const minimumBucketCount = bucketCounts.size > 0 ? Math.min(...bucketCounts.values()) : 0
    const balancedCandidate = chooseSeededCandidate(ranked, (item) => {
      const bucket = item.exercise.primaryBucket
      return valid(item) && Boolean(bucket && bucketCounts.get(bucket) === minimumBucketCount)
    }, inputs.seed, position, usedEquipment, selectedPatterns)
    return newBucketCandidate ?? balancedCandidate ?? chooseSeededCandidate(
      ranked,
      valid,
      inputs.seed,
      position,
      usedEquipment,
      selectedPatterns,
    )
  }
  const roleModes = requiredFullBodyRoles?.size ? [true, false] : [false]
  for (const requireRole of roleModes) {
    const passesRole = (exercise: AdaptedExercise) =>
      !requireRole || fullBodyRolesOf(exercise).some((role) => requiredFullBodyRoles?.has(role))
    for (const backup of [false, true]) {
      for (const requireRotation of [true, false]) {
        for (const requireVariantDiversity of [true, false]) {
          const selectCandidate = (loadPredicate: (exercise: AdaptedExercise) => boolean) => {
            const valid = ({ exercise }: ScoredExercise) =>
              !chosen.has(exercise.code) &&
              loadPredicate(exercise) &&
              passesRole(exercise) &&
              (!requireRotation || passesRecentAccessoryRotation(exercise, recentCodes)) &&
              (!requireVariantDiversity || passesImplementVariantDiversity(exercise, selectedVariantKeys)) &&
              passesDistribution(exercise) &&
              passesPatternDistribution(exercise) &&
              positionValid(exercise, inputs.goal, position, count, backup)
            return chooseBucketAwareCandidate(valid)
          }
          const candidate = selectCandidate(() => true)
          if (!candidate) continue
          if (loadFeasibility(candidate.exercise, position, false) !== 'infeasible') {
            return { scored: candidate, backup, loadFallback: false }
          }
          const alternative = selectCandidate(exercise =>
            loadReplacementCompatible(candidate.exercise, exercise) &&
            loadFeasibility(exercise, position, false) === 'feasible')
          return alternative
            ? { scored: alternative, backup, loadFallback: false }
            : { scored: candidate, backup, loadFallback: true }
        }
      }
    }
    for (const requireRotation of [true, false]) {
      for (const requireVariantDiversity of [true, false]) {
        const selectCandidate = (loadPredicate: (exercise: AdaptedExercise) => boolean) => {
          const rotates = (exercise: AdaptedExercise) =>
            !requireRotation || passesRecentAccessoryRotation(exercise, recentCodes)
          const varies = (exercise: AdaptedExercise) =>
            !requireVariantDiversity || passesImplementVariantDiversity(exercise, selectedVariantKeys)
          const valid = ({ exercise }: ScoredExercise) =>
            !chosen.has(exercise.code) &&
            loadPredicate(exercise) &&
            passesRole(exercise) &&
            rotates(exercise) &&
            varies(exercise) &&
            passesDistribution(exercise) &&
            passesPatternDistribution(exercise)
          return chooseBucketAwareCandidate(valid) ?? chooseSeededCandidate(
            ranked,
            ({ exercise }) => !chosen.has(exercise.code) && loadPredicate(exercise) && passesRole(exercise) && rotates(exercise) && varies(exercise),
            inputs.seed,
            position,
            usedEquipment,
            selectedPatterns,
          )
        }
        const candidate = selectCandidate(() => true)
        if (!candidate) continue
        if (loadFeasibility(candidate.exercise, position, false) !== 'infeasible') {
          return { scored: candidate, backup: true, loadFallback: false }
        }
        const alternative = selectCandidate(exercise =>
          loadReplacementCompatible(candidate.exercise, exercise) &&
          loadFeasibility(exercise, position, false) === 'feasible')
        return alternative
          ? { scored: alternative, backup: true, loadFallback: false }
          : { scored: candidate, backup: true, loadFallback: true }
      }
    }
  }
  return { scored: null, backup: true, loadFallback: false }
}

function reorderSelectedStrength(
  selected: SelectedExercise[],
  count: number,
): SelectedExercise[] {
  if (selected.length > MAX_STRENGTH_REORDER_EXERCISES) {
    return selected.map((item, position) => ({ ...item, position }))
  }
  let ordered = [...selected]
  const pinnedCount = selected.findIndex(item => !item.starting)
  const firstMovable = pinnedCount < 0 ? selected.length : pinnedCount
  const canOccupy = (item: SelectedExercise, position: number) =>
    item.position === position || positionValid(item.scored.exercise, item.selectionGoal, position, count, item.backup)
  const equipmentIsSubset = (subset: ReadonlySet<string>, superset: ReadonlySet<string>) =>
    [...subset].every(equipment => superset.has(equipment))
  const stationReturnCount = (items: SelectedExercise[]) => {
    const segments: Set<string>[] = []
    for (const item of items) {
      const current = new Set(item.scored.exercise.equipmentCodes)
      // Equipment-free work is a bridge, not a trip to another station.
      if (current.size === 0) continue
      const previous = segments.at(-1)
      if (previous && (equipmentIsSubset(previous, current) || equipmentIsSubset(current, previous))) {
        segments[segments.length - 1] = new Set([...previous, ...current])
      } else {
        segments.push(current)
      }
    }
    const signatures = segments.map(segment => [...segment].sort().join('|'))
    return signatures.length - new Set(signatures).size
  }
  const cost = (items: SelectedExercise[]) => {
    let deferredPrimaryCount = 0
    let adjacentBucketCount = 0
    for (let position = firstMovable; position < items.length; position += 1) {
      const item = items[position]!
      if (!item.scored.exercise.isMainLift) {
        deferredPrimaryCount += items.slice(position + 1).filter(candidate =>
          candidate.strengthFoundation === item.strengthFoundation && candidate.scored.exercise.isMainLift).length
      }
      const previousBucket = items[position - 1]?.scored.exercise.primaryBucket
      if (previousBucket && item.scored.exercise.primaryBucket === previousBucket) adjacentBucketCount += 1
    }
    return {
      deferredPrimaryCount,
      adjacentBucketCount,
      stationReturnCount: stationReturnCount(items),
    }
  }
  const isBetter = (left: ReturnType<typeof cost>, right: ReturnType<typeof cost>) =>
    left.deferredPrimaryCount < right.deferredPrimaryCount ||
    (left.deferredPrimaryCount === right.deferredPrimaryCount && (
      left.adjacentBucketCount < right.adjacentBucketCount ||
      (left.adjacentBucketCount === right.adjacentBucketCount && left.stationReturnCount < right.stationReturnCount)
    ))
  const validOrder = (items: SelectedExercise[]) => items.every((item, position) =>
    (position >= firstMovable || item === selected[position]) &&
    item.strengthFoundation === selected[position]!.strengthFoundation &&
    canOccupy(item, position))
  const displacement = (items: SelectedExercise[]) => items.reduce(
    (total, item, position) => total + Math.abs(item.position - position),
    0,
  )

  let orderedCost = cost(ordered)
  let improved = true
  while (improved) {
    improved = false
    let bestOrder: SelectedExercise[] | null = null
    let bestCost = orderedCost
    let bestDisplacement = Number.POSITIVE_INFINITY
    for (let from = firstMovable; from < ordered.length; from += 1) {
      for (let to = firstMovable; to < ordered.length; to += 1) {
        if (from === to) continue
        const candidate = [...ordered]
        const [item] = candidate.splice(from, 1)
        if (!item) continue
        candidate.splice(to, 0, item)
        if (!validOrder(candidate)) continue
        const candidateCost = cost(candidate)
        if (!isBetter(candidateCost, orderedCost)) continue
        const candidateDisplacement = displacement(candidate)
        if (
          !bestOrder ||
          isBetter(candidateCost, bestCost) ||
          (candidateCost.deferredPrimaryCount === bestCost.deferredPrimaryCount &&
            candidateCost.adjacentBucketCount === bestCost.adjacentBucketCount &&
            candidateCost.stationReturnCount === bestCost.stationReturnCount &&
            candidateDisplacement < bestDisplacement)
        ) {
          bestOrder = candidate
          bestCost = candidateCost
          bestDisplacement = candidateDisplacement
        }
      }
    }
    if (bestOrder) {
      ordered = bestOrder
      orderedCost = bestCost
      improved = true
    }
  }

  return ordered.map((item, position) => ({ ...item, position }))
}

export function generateOptimDemo(requestedInputs: OptimDemoInputs, context: OptimDemoUserContext): OptimDemoResult {
  const parsedDate = new Date(requestedInputs.generationDateIso)
  const nowMs = Number.isFinite(parsedDate.getTime()) ? parsedDate.getTime() : 0
  const adapted = context.exercises
    .map(exercise => adaptExercise(exercise, requestedInputs.productRelationshipOverlayEnabled === true))
    .filter(Boolean) as AdaptedExercise[]
  const metadataMatchCount = adapted.filter((exercise) => exercise.metadata).length
  const sourceByCode = new Map(adapted.map((exercise) => [exercise.code, exercise]))
  const selectedEquipment = new Set(requestedInputs.availableEquipmentCodes.map(normalizeCode))
  const catalogEquipment = new Set(context.exercises.flatMap(exercise => [
    ...(exercise.exerciseEquipment?.required ?? []),
    ...(exercise.exerciseEquipment?.optional ?? []),
  ].flat().map(normalizeCode).filter(Boolean)))
  const equipmentSelectionIsRestricted = [...catalogEquipment].some(code => !selectedEquipment.has(code))
  const excluded = new Set(requestedInputs.excludedExerciseCodes.map(normalizeCode))
  const filterCandidates = (candidateInputs: OptimDemoInputs) => {
    const rejectedCandidates: OptimRejectedCandidate[] = []
    const eligible: AdaptedExercise[] = []
    for (const exercise of adapted) {
      const reasons = hardFilterReasons(
        exercise,
        candidateInputs,
        selectedEquipment,
        equipmentSelectionIsRestricted,
        excluded,
      )
      if (reasons.length > 0) rejectedCandidates.push({ code: exercise.code, name: exercise.name, reasons })
      else eligible.push(exercise)
    }
    return { rejectedCandidates, eligible }
  }
  const strictCandidates = filterCandidates(requestedInputs)
  const foundationFallback =
    requestedInputs.goal === 'olympic' &&
    requestedInputs.experience === 'beginner' &&
    !strictCandidates.eligible.some(exercise => !exercise.isCore)
  const inputs: OptimDemoInputs = foundationFallback
    ? { ...requestedInputs, goal: 'strength' }
    : requestedInputs
  const { rejectedCandidates, eligible } = foundationFallback
    ? filterCandidates(inputs)
    : strictCandidates
  const mixedFoundationEligible =
    !foundationFallback && (inputs.goal === 'powerlifting' || inputs.goal === 'olympic')
  const strengthFoundationInputs: OptimDemoInputs = { ...inputs, goal: 'strength' }
  const strengthFoundationEligible = mixedFoundationEligible
    ? filterCandidates(strengthFoundationInputs).eligible
    : []
  const warmStartProfileMatchCount = adapted.filter(exercise =>
    getWarmStartPrediction(exercise.source, inputs, context.gender ?? null, context.ageYears ?? null) != null).length
  const totalStrengthCandidates = adapted.filter((exercise) => !exercise.isCardio && !exercise.isMobility && !exercise.isDistance).length
  const availabilityRatio = totalStrengthCandidates === 0 ? 0 : eligible.length / totalStrengthCandidates
  const strengthFoundationAvailabilityRatio = totalStrengthCandidates === 0
    ? 0
    : strengthFoundationEligible.length / totalStrengthCandidates
  const bodyweightMetadataByCode = new Map(
    adapted.flatMap((exercise) => exercise.bodyweightMetadata
      ? [[exercise.code, exercise.bodyweightMetadata] as const]
      : []),
  )
  const history = buildOptimDemoHistory(context.completedWorkouts, nowMs, {
    bodyWeightKg: context.bodyWeightKg,
    bodyweightMetadataByCode,
    rpeAwareEffort: inputs.rpeAwareHistoryEnabled === true,
  })
  const loadFeasibilityFor = (candidateInputs: OptimDemoInputs) =>
    (exercise: AdaptedExercise, position: number, core: boolean) => executableLoadFeasibility(
      exercise,
      position,
      core,
      candidateInputs,
      history.get(exercise.code),
      exercise.relationship ? history.get(exercise.relationship.referenceExerciseCode) : undefined,
      context.gender ?? null,
      context.ageYears ?? null,
      nowMs,
    )
  const loadFeasibility = loadFeasibilityFor(inputs)
  const strengthFoundationLoadFeasibility = loadFeasibilityFor(strengthFoundationInputs)
  const recentCodesFor = (candidateInputs: OptimDemoInputs) => {
    const recentWindowMs = recoveryWindowDays(candidateInputs) * DAY_MS
    return new Set(
      [...history.entries()].flatMap(([code, exerciseHistory]) => {
        const elapsed = nowMs - exerciseHistory.lastUsedAtMs
        return elapsed >= 0 && elapsed <= recentWindowMs ? [code] : []
      }),
    )
  }
  const recentCodes = recentCodesFor(inputs)
  const strengthFoundationRecentCodes = recentCodesFor(strengthFoundationInputs)
  const muscleUsage = computeRecoveryUsage(sourceByCode, context.completedWorkouts, inputs, nowMs)
  const strengthFoundationMuscleUsage = mixedFoundationEligible
    ? computeRecoveryUsage(sourceByCode, context.completedWorkouts, strengthFoundationInputs, nowMs)
    : muscleUsage
  const scorePool = (
    pool: AdaptedExercise[],
    candidateInputs: OptimDemoInputs,
    candidateMuscleUsage: Record<MuscleBucketKey, number>,
    candidateAvailabilityRatio: number,
    foundationRequestedGoal?: 'olympic' | 'powerlifting',
  ) => pool.map((exercise) => {
    const baseBreakdown = scoreExercise(
      exercise,
      history.get(exercise.code),
      candidateMuscleUsage,
      candidateInputs,
      candidateAvailabilityRatio,
      nowMs,
    )
    const breakdown: OptimScoreBreakdown = foundationRequestedGoal
      ? { ...baseBreakdown, sportFoundationUtility: sportFoundationUtility(exercise, foundationRequestedGoal) }
      : baseBreakdown
    return { exercise, breakdown, score: sumBreakdown(breakdown), rank: 0 }
  }).sort((a, b) => b.score - a.score || a.exercise.code.localeCompare(b.exercise.code))
  const scored = scorePool(
    eligible,
    inputs,
    muscleUsage,
    availabilityRatio,
    foundationFallback ? 'olympic' : undefined,
  )
  scored.forEach((candidate, index) => { candidate.rank = index + 1 })
  const strengthFoundationScored = scorePool(
    strengthFoundationEligible,
    strengthFoundationInputs,
    strengthFoundationMuscleUsage,
    strengthFoundationAvailabilityRatio,
    inputs.goal === 'powerlifting' || inputs.goal === 'olympic' ? inputs.goal : undefined,
  )
  strengthFoundationScored.forEach((candidate, index) => { candidate.rank = index + 1 })
  const nonCoreRanked = scored.filter(({ exercise }) => !exercise.isCore)
  const coreRanked = scored.filter(({ exercise }) => exercise.isCore)
  const strengthFoundationNonCoreRanked = strengthFoundationScored.filter(({ exercise }) => !exercise.isCore)
  const cardioPool = adapted.filter((exercise) =>
    exercise.isCardio &&
    (exercise.isTimed || exercise.isDistance || exercise.measurements.includes('REPS')) &&
    equipmentAvailable(exercise, selectedEquipment) &&
    !excluded.has(exercise.code) &&
    (!inputs.bodyweightOnly || exercise.isBodyweight),
  )
  const selectedCardioCodes = new Set(inputs.selectedCardioExerciseCodes.map(normalizeCode))
  const permittedCardio = selectedCardioCodes.size > 0
    ? cardioPool.filter((exercise) => selectedCardioCodes.has(exercise.code))
    : cardioPool
  const mobilityPool = adapted.filter((exercise) =>
    exercise.isMobility && equipmentAvailable(exercise, selectedEquipment) && !excluded.has(exercise.code) && (!inputs.bodyweightOnly || exercise.isBodyweight),
  )
  const relevantMobility = mobilityPool.filter((exercise) =>
    inputs.selectedMuscleBuckets.length === 0 || !exercise.primaryBucket || inputs.selectedMuscleBuckets.includes(exercise.primaryBucket),
  )
  const day = dayOfYear(new Date(nowMs))
  const routineCount = mobilityRoutineCount(inputs.durationMinutes)
  const desiredWarmupCount = inputs.mobilityWarmupEnabled ? Math.min(routineCount, relevantMobility.length) : 0
  const desiredCooldownCount = inputs.mobilityCooldownEnabled
    ? Math.min(routineCount, Math.max(0, relevantMobility.length - desiredWarmupCount))
    : 0
  const cardioCandidate = inputs.cardioEnabled ? chooseCardioCandidate(permittedCardio, inputs.seed, day) : null
  const targetCardioMinutes = cardioCandidate ? cardioDurationMinutes(inputs) : 0
  const desiredCardio = cardioCandidate ? makeCardioExercise(cardioCandidate, inputs, targetCardioMinutes) : null
  const minimumCardioMinutes = cardioCandidate ? Math.min(5, targetCardioMinutes) : 0
  const minimumCardio = cardioCandidate ? makeCardioExercise(cardioCandidate, inputs, minimumCardioMinutes) : null
  const cardioReservationSeconds = (exercise: OptimDemoExercise | null, minutes: number) => {
    if (exercise == null) return 0
    const emittedSeconds = estimatedExerciseSeconds(exercise)
    return inputs.cardioReservationMatchesEmittedEnabled === true
      ? emittedSeconds
      : Math.max(minutes * 60, emittedSeconds)
  }
  const desiredCardioSeconds = cardioReservationSeconds(desiredCardio, targetCardioMinutes)
  const minimumCardioSeconds = cardioReservationSeconds(minimumCardio, minimumCardioMinutes)
  const minimumStrengthMinutes = Math.min(15, inputs.durationMinutes)
  const optionalBudgetSeconds = Math.max(0, (inputs.durationMinutes - minimumStrengthMinutes) * 60)
  const mobilityReservationSeconds = 65
  let plannedWarmupCount = 0
  let plannedCooldownCount = 0
  let cardio: OptimDemoExercise[] = []
  let reservedCardioSeconds = 0
  let allocatedCardioMinutes = 0
  let remainingOptionalSeconds = optionalBudgetSeconds
  const desiredOptionalSeconds =
    desiredCardioSeconds + (desiredWarmupCount + desiredCooldownCount) * mobilityReservationSeconds

  if (desiredOptionalSeconds <= optionalBudgetSeconds) {
    plannedWarmupCount = desiredWarmupCount
    plannedCooldownCount = desiredCooldownCount
    if (desiredCardio) {
      cardio = [desiredCardio]
      reservedCardioSeconds = desiredCardioSeconds
      allocatedCardioMinutes = targetCardioMinutes
    }
    remainingOptionalSeconds -= desiredOptionalSeconds
  } else {
    if (desiredWarmupCount > 0 && remainingOptionalSeconds >= mobilityReservationSeconds) {
      plannedWarmupCount = 1
      remainingOptionalSeconds -= mobilityReservationSeconds
    }
    if (minimumCardio && remainingOptionalSeconds >= minimumCardioSeconds) {
      cardio = [minimumCardio]
      reservedCardioSeconds = minimumCardioSeconds
      allocatedCardioMinutes = minimumCardioMinutes
      remainingOptionalSeconds -= minimumCardioSeconds
    }
    if (desiredCooldownCount > 0 && remainingOptionalSeconds >= mobilityReservationSeconds) {
      plannedCooldownCount = 1
      remainingOptionalSeconds -= mobilityReservationSeconds
    }
    if (cardioCandidate && cardio.length > 0 && targetCardioMinutes > minimumCardioMinutes) {
      for (let minutes = targetCardioMinutes; minutes > minimumCardioMinutes; minutes -= 1) {
        const candidate = makeCardioExercise(cardioCandidate, inputs, minutes)
        const candidateSeconds = cardioReservationSeconds(candidate, minutes)
        const additionalSeconds = candidateSeconds - reservedCardioSeconds
        if (additionalSeconds <= remainingOptionalSeconds) {
          cardio = [candidate]
          reservedCardioSeconds = candidateSeconds
          allocatedCardioMinutes = minutes
          remainingOptionalSeconds -= additionalSeconds
          break
        }
      }
    }
    while (plannedWarmupCount < desiredWarmupCount && remainingOptionalSeconds >= mobilityReservationSeconds) {
      plannedWarmupCount += 1
      remainingOptionalSeconds -= mobilityReservationSeconds
    }
    while (plannedCooldownCount < desiredCooldownCount && remainingOptionalSeconds >= mobilityReservationSeconds) {
      plannedCooldownCount += 1
      remainingOptionalSeconds -= mobilityReservationSeconds
    }
  }

  const reservedOptionalSeconds =
    reservedCardioSeconds + (plannedWarmupCount + plannedCooldownCount) * mobilityReservationSeconds
  const reservedOptionalMinutes = Math.ceil(reservedOptionalSeconds / 60)
  const strengthDurationMinutes = Math.max(0, inputs.durationMinutes - reservedOptionalMinutes)
  const recoveredCounts = calculateOptimExerciseCounts(strengthDurationMinutes, inputs.goal)
  const specializedNonCoreCap = inputs.goal === 'powerlifting' || inputs.goal === 'olympic' ? 4 : null
  const computedCounts = {
    ...recoveredCounts,
    nonCore: specializedNonCoreCap == null
      ? recoveredCounts.nonCore
      : Math.min(recoveredCounts.nonCore, specializedNonCoreCap),
  }
  const requestedNonCore = inputs.nonCoreCountOverride ?? computedCounts.nonCore
  const requestedCore = inputs.coreCountOverride ?? computedCounts.core
  const fullBodyRoleTargets = new Set<FullBodyRole>()
  if (
    inputs.split === 'fullBody' &&
    inputs.goal !== 'powerlifting' &&
    inputs.goal !== 'olympic' &&
    requestedNonCore >= 3
  ) {
    nonCoreRanked.forEach(({ exercise }) => {
      fullBodyRolesOf(exercise).forEach((role) => fullBodyRoleTargets.add(role))
    })
  }
  const strengthFoundationFullBodyRoleTargets = new Set<FullBodyRole>()
  if (mixedFoundationEligible && inputs.split === 'fullBody' && requestedNonCore >= 3) {
    [...nonCoreRanked, ...strengthFoundationNonCoreRanked].forEach(({ exercise }) => {
      fullBodyRolesOf(exercise).forEach((role) => strengthFoundationFullBodyRoleTargets.add(role))
    })
  }
  const coveredFullBodyRoles = new Set<FullBodyRole>()
  const chosen = new Set<string>()
  const selected: SelectedExercise[] = []
  const bucketCounts = new Map<MuscleBucketKey, number>()
  const patternCounts = new Map<MovementPattern, number>()
  const usedEquipment = new Set<string>()
  const selectedVariantKeys = new Set<string>()
  const durationCapEvents: string[] = []
  if (plannedWarmupCount < desiredWarmupCount) {
    durationCapEvents.push(plannedWarmupCount === 0
      ? `Hard duration cap omitted the mobility warm-up after preserving a ${minimumStrengthMinutes}-minute strength stage.`
      : `Hard duration cap reduced the mobility warm-up from ${desiredWarmupCount} movements to ${plannedWarmupCount}.`)
  }
  if (cardioCandidate && cardio.length === 0) {
    durationCapEvents.push(
      `Hard duration cap: cardio needs ${Math.ceil(minimumCardioSeconds / 60)} minutes but could not fit after preserving a ${minimumStrengthMinutes}-minute strength stage; cardio omitted.`,
    )
  } else if (cardio.length > 0 && allocatedCardioMinutes < targetCardioMinutes) {
    durationCapEvents.push(
      `Hard duration cap reduced cardio from ${targetCardioMinutes} planned minutes to ${allocatedCardioMinutes} minutes.`,
    )
  }
  if (plannedCooldownCount < desiredCooldownCount) {
    durationCapEvents.push(plannedCooldownCount === 0
      ? `Hard duration cap omitted the mobility cool-down after preserving a ${minimumStrengthMinutes}-minute strength stage.`
      : `Hard duration cap reduced the mobility cool-down from ${desiredCooldownCount} movements to ${plannedCooldownCount}.`)
  }
  const events: string[] = [
    ...(foundationFallback
      ? ['No beginner-safe exercise survived the strict Olympic pool; selection switched to a strength-foundation session without relaxing experience, equipment, split, or manual filters.']
      : []),
    `Loaded ${context.exercises.length} catalog exercises; adapted ${adapted.length}; matched ${metadataMatchCount} recovered metadata records.`,
    `${eligible.length} hard-filter survivors (${round(availabilityRatio * 100, 1)}% availability).`,
    `Recovery window ${recoveryWindowDays(inputs)} days; local completed workouts are the muscle-usage source.`,
    `Duration formula reserved ${reservedOptionalMinutes} minutes for enabled stages and budgeted ${strengthDurationMinutes} minutes for ${requestedNonCore} non-core and ${requestedCore} core exercises.`,
    ...durationCapEvents,
  ]
  const injuryNote = context.injuries?.length
    ? `Profile injuries/limitations are visible (${context.injuries.join(', ')}) but are not auto-mapped; use manual exercise exclusions or muscle selection when appropriate.`
    : 'No profile injury/limitation labels are available.'
  if (context.injuries?.length) events.push(injuryNote)
  if (fullBodyRoleTargets.size > 0) {
    events.push(`Full-body role targets from eligible exercises: ${[...fullBodyRoleTargets].sort().join(', ')}.`)
  }
  if (strengthFoundationFullBodyRoleTargets.size > 0) {
    events.push(`Strength-foundation full-body role targets from constrained candidates: ${[...strengthFoundationFullBodyRoleTargets].sort().join(', ')}.`)
  }
  if (computedCounts.nonCore < recoveredCounts.nonCore) {
    events.push(
      `Specialized-goal viability cap reduced the recovered non-core count from ${recoveredCounts.nonCore} to ${computedCounts.nonCore}; the debug screen's Strength count override can still request more.`,
    )
  }
  for (const codeRaw of inputs.startingExerciseCodes) {
    if (selected.filter((item) => !item.core).length >= requestedNonCore) break
    const code = normalizeCode(codeRaw)
    const candidate = nonCoreRanked.find(({ exercise }) => exercise.code === code)
    if (!candidate || chosen.has(code)) {
      events.push(`Starting exercise ${code || '(blank)'} was unavailable or filtered.`)
      continue
    }
    chosen.add(code)
    if (candidate.exercise.primaryBucket) {
      bucketCounts.set(candidate.exercise.primaryBucket, (bucketCounts.get(candidate.exercise.primaryBucket) ?? 0) + 1)
    }
    if (candidate.exercise.movementPattern) {
      patternCounts.set(candidate.exercise.movementPattern, (patternCounts.get(candidate.exercise.movementPattern) ?? 0) + 1)
    }
    candidate.exercise.equipmentCodes.forEach((equipment) => usedEquipment.add(equipment))
    selectedVariantKeys.add(candidate.exercise.variantKey)
    fullBodyRolesOf(candidate.exercise).forEach((role) => coveredFullBodyRoles.add(role))
    selected.push({
      scored: candidate,
      position: selected.filter((item) => !item.core).length,
      core: false,
      backup: false,
      starting: true,
      loadFallback: false,
      selectionGoal: inputs.goal,
      strengthFoundation: false,
    })
    events.push(`Pinned starting exercise ${candidate.exercise.name}.`)
  }
  while (selected.filter((item) => !item.core).length < requestedNonCore) {
    const position = selected.filter((item) => !item.core).length
    const remainingSlots = requestedNonCore - position
    const missingFullBodyRoles = new Set(
      [...fullBodyRoleTargets].filter((role) => !coveredFullBodyRoles.has(role)),
    )
    const requiredFullBodyRoles = remainingSlots <= missingFullBodyRoles.size
      ? missingFullBodyRoles
      : null
    const choice = choosePosition(
      nonCoreRanked,
      chosen,
      position,
      requestedNonCore,
      inputs,
      bucketCounts,
      patternCounts,
      usedEquipment,
      selectedVariantKeys,
      recentCodes,
      requiredFullBodyRoles,
      loadFeasibility,
    )
    if (!choice.scored) {
      events.push(mixedFoundationEligible
        ? `No authentic ${inputs.goal} candidate remained for position ${position + 1}; checking the strength-foundation pool.`
        : `No non-core candidate remained for position ${position + 1}.`)
      break
    }
    chosen.add(choice.scored.exercise.code)
    if (choice.scored.exercise.primaryBucket) {
      bucketCounts.set(choice.scored.exercise.primaryBucket, (bucketCounts.get(choice.scored.exercise.primaryBucket) ?? 0) + 1)
    }
    if (choice.scored.exercise.movementPattern) {
      patternCounts.set(choice.scored.exercise.movementPattern, (patternCounts.get(choice.scored.exercise.movementPattern) ?? 0) + 1)
    }
    choice.scored.exercise.equipmentCodes.forEach((equipment) => usedEquipment.add(equipment))
    selectedVariantKeys.add(choice.scored.exercise.variantKey)
    fullBodyRolesOf(choice.scored.exercise).forEach((role) => coveredFullBodyRoles.add(role))
    selected.push({
      scored: choice.scored,
      position,
      core: false,
      backup: choice.backup,
      starting: false,
      loadFallback: choice.loadFallback,
      selectionGoal: inputs.goal,
      strengthFoundation: false,
    })
    events.push(`${choice.backup ? 'Backup' : 'Strict'} pick ${position + 1}: ${choice.scored.exercise.name} (${choice.scored.score}).`)
  }
  const authenticNonCoreCount = selected.filter((item) => !item.core).length
  let foundationNonCoreCount = 0
  while (mixedFoundationEligible && selected.filter((item) => !item.core).length < requestedNonCore) {
    const position = selected.filter((item) => !item.core).length
    const remainingSlots = requestedNonCore - position
    const missingFoundationRoles = new Set(
      [...strengthFoundationFullBodyRoleTargets].filter((role) => !coveredFullBodyRoles.has(role)),
    )
    const requiredFoundationRoles = remainingSlots <= missingFoundationRoles.size
      ? missingFoundationRoles
      : null
    const choice = choosePosition(
      strengthFoundationNonCoreRanked,
      chosen,
      position,
      requestedNonCore,
      strengthFoundationInputs,
      bucketCounts,
      patternCounts,
      usedEquipment,
      selectedVariantKeys,
      strengthFoundationRecentCodes,
      requiredFoundationRoles,
      strengthFoundationLoadFeasibility,
    )
    if (!choice.scored) {
      events.push(`No strength-foundation candidate remained for position ${position + 1}.`)
      break
    }
    chosen.add(choice.scored.exercise.code)
    if (choice.scored.exercise.primaryBucket) {
      bucketCounts.set(choice.scored.exercise.primaryBucket, (bucketCounts.get(choice.scored.exercise.primaryBucket) ?? 0) + 1)
    }
    if (choice.scored.exercise.movementPattern) {
      patternCounts.set(choice.scored.exercise.movementPattern, (patternCounts.get(choice.scored.exercise.movementPattern) ?? 0) + 1)
    }
    choice.scored.exercise.equipmentCodes.forEach((equipment) => usedEquipment.add(equipment))
    selectedVariantKeys.add(choice.scored.exercise.variantKey)
    fullBodyRolesOf(choice.scored.exercise).forEach((role) => coveredFullBodyRoles.add(role))
    selected.push({
      scored: choice.scored,
      position,
      core: false,
      backup: choice.backup,
      starting: false,
      loadFallback: choice.loadFallback,
      selectionGoal: 'strength',
      strengthFoundation: true,
    })
    foundationNonCoreCount += 1
    events.push(`Strength-foundation pick ${position + 1}: ${choice.scored.exercise.name} (${choice.scored.score}).`)
  }
  while (selected.filter((item) => item.core).length < requestedCore) {
    const position = selected.filter((item) => item.core).length
    let candidate: ScoredExercise | null = null
    let loadFallback = false
    for (const requireRotation of [true, false]) {
      for (const requireVariantDiversity of [true, false]) {
        const selectCandidate = (loadPredicate: (exercise: AdaptedExercise) => boolean) =>
          chooseSeededCandidate(
            coreRanked,
            ({ exercise }) =>
              !chosen.has(exercise.code) &&
              loadPredicate(exercise) &&
              (!requireRotation || passesRecentAccessoryRotation(exercise, recentCodes)) &&
              (!requireVariantDiversity || passesImplementVariantDiversity(exercise, selectedVariantKeys)),
            inputs.seed,
            requestedNonCore + position,
            usedEquipment,
          )
        const baseCandidate = selectCandidate(() => true)
        if (!baseCandidate) continue
        if (loadFeasibility(baseCandidate.exercise, position, true) === 'infeasible') {
          candidate = selectCandidate(exercise =>
            loadReplacementCompatible(baseCandidate.exercise, exercise) &&
            loadFeasibility(exercise, position, true) === 'feasible') ?? baseCandidate
          loadFallback = candidate === baseCandidate
        } else {
          candidate = baseCandidate
        }
        break
      }
      if (candidate) break
    }
    if (!candidate) {
      events.push(`No core candidate remained for position ${position + 1}.`)
      break
    }
    chosen.add(candidate.exercise.code)
    candidate.exercise.equipmentCodes.forEach((equipment) => usedEquipment.add(equipment))
    selectedVariantKeys.add(candidate.exercise.variantKey)
    selected.push({
      scored: candidate,
      position,
      core: true,
      backup: false,
      starting: false,
      loadFallback,
      selectionGoal: inputs.goal,
      strengthFoundation: false,
    })
    events.push(`Core pick ${position + 1}: ${candidate.exercise.name} (${candidate.score}).`)
  }
  const selectedNonCoreCount = selected.filter((item) => !item.core).length
  if (selectedNonCoreCount < requestedNonCore && inputs.selectedMuscleBuckets.length > 0) {
    events.push(
      `Manual muscle selection (${inputs.selectedMuscleBuckets.join(', ')}) left ${nonCoreRanked.length} eligible non-core catalog movement${nonCoreRanked.length === 1 ? '' : 's'}; non-core filled ${selectedNonCoreCount}/${requestedNonCore} and the recovered count was not reinterpreted.`,
    )
  }
  const missingFullBodyRoles = [...fullBodyRoleTargets].filter((role) => !coveredFullBodyRoles.has(role))
  if (fullBodyRoleTargets.size > 0) {
    events.push(
      missingFullBodyRoles.length === 0
        ? 'Full-body role coverage satisfied.'
        : `Full-body role coverage could not fill: ${missingFullBodyRoles.join(', ')}.`,
    )
  }
  if (strengthFoundationFullBodyRoleTargets.size > 0) {
    const missingFoundationRoles = [...strengthFoundationFullBodyRoleTargets]
      .filter((role) => !coveredFullBodyRoles.has(role))
    events.push(
      missingFoundationRoles.length === 0
        ? 'Strength-foundation full-body role coverage satisfied.'
        : `Strength-foundation full-body role coverage could not fill: ${missingFoundationRoles.join(', ')}.`,
    )
  }
  if (mixedFoundationEligible && authenticNonCoreCount < requestedNonCore) {
    const goalLabel = inputs.goal === 'powerlifting' ? 'Powerlifting' : 'Olympic'
    if (foundationNonCoreCount > 0) {
      events.push(
        `${goalLabel} pool filled ${authenticNonCoreCount}/${requestedNonCore} authentic lifts; ${foundationNonCoreCount} slot${foundationNonCoreCount === 1 ? '' : 's'} filled from the labeled strength-foundation pool without relaxing equipment, experience, split, muscle, bodyweight, or exclusion filters.`,
      )
    }
    if (selectedNonCoreCount < requestedNonCore) {
      events.push(
        `Strength-foundation fill ended at ${selectedNonCoreCount}/${requestedNonCore} total non-core exercises; the preserved constraints leave no further viable movements.`,
      )
    }
  }
  if (foundationFallback && selectedNonCoreCount < requestedNonCore) {
    events.push(
      `Olympic beginner strength-foundation pool filled ${selectedNonCoreCount}/${requestedNonCore}; the selected split, equipment, or exclusions leave too few safe foundation movements.`,
    )
  }
  const selectedNonCore = selected.filter(item => !item.core)
  const reorderSearchSkipped = selectedNonCore.length > MAX_STRENGTH_REORDER_EXERCISES
  const orderedNonCore = reorderSelectedStrength(selectedNonCore, requestedNonCore)
  const selectedOrderChanged = orderedNonCore.some((item, index) => item.scored.exercise.code !== selectedNonCore[index]?.scored.exercise.code)
  if (reorderSearchSkipped) {
    events.push(
      `Strength order optimization skipped for ${selectedNonCore.length} exercises because the debug safety limit is ${MAX_STRENGTH_REORDER_EXERCISES}; deterministic selection order was retained.`,
    )
  } else if (selectedOrderChanged) {
    events.push('Reordered algorithmic strength picks to keep primary lifts early, separate adjacent muscle buckets, and avoid returning to the same equipment station where higher priorities tied.')
  }
  const orderedSelected = [...orderedNonCore, ...selected.filter(item => item.core)]
  let maxEffortUsed = false
  const generatedStrength = orderedSelected.map((item) => {
    const exerciseInputs = item.strengthFoundation ? strengthFoundationInputs : inputs
    const result = makeStrengthExercise(
      item.scored,
      exerciseInputs,
      history.get(item.scored.exercise.code),
      item.scored.exercise.relationship
        ? history.get(item.scored.exercise.relationship.referenceExerciseCode)
        : undefined,
      item.position,
      item.core,
      maxEffortUsed,
      context.bodyWeightKg ?? null,
      context.gender ?? null,
      context.ageYears ?? null,
      strengthDurationMinutes,
      requestedNonCore,
      requestedCore,
      nowMs,
    )
    if (result.maxEffort) maxEffortUsed = true
    if (item.backup) result.trace.unshift('Strict position rules exhausted; selected through backup path')
    if (item.starting) result.trace.unshift('Pinned by starting-exercise input')
    if (item.loadFallback) result.trace.unshift('No executable ordinary-weighted alternative with the same variation survived the same selection constraints; sparse-catalog fallback retained this exercise')
    if (item.strengthFoundation) {
      result.trace.unshift(`Strength-foundation filler: selected through strength rules after the ${inputs.goal} pool exhausted; equipment, experience, split, muscle, bodyweight, and exclusion filters remained active`)
    }
    if (foundationFallback && !item.core) {
      result.trace.unshift('Beginner Olympic foundation: selected through strength rules while Olympic experience safety remained enforced')
    }
    return result
  })
  applyCircuits(generatedStrength, inputs, sourceByCode, history)
  applySupersets(generatedStrength, inputs, sourceByCode)
  if (inputs.circuitsEnabled && inputs.supersetsEnabled) {
    events.push('Both grouping modes were enabled; circuit generation took precedence for backward compatibility.')
  }
  const removedWarmupSets = trimWarmupsToStrengthBudget(
    generatedStrength,
    sourceByCode,
    strengthDurationMinutes * 60,
  )
  if (removedWarmupSets > 0) {
    events.push(`Warm-up budget removed ${removedWarmupSets} lower-priority ramp set${removedWarmupSets === 1 ? '' : 's'} while preserving every recovered working set.`)
  }

  if (inputs.cardioEnabled && cardio.length > 0) events.push(`Cardio pick: ${cardio[0]!.name}.`)
  else if (inputs.cardioEnabled && !cardioCandidate) events.push('Cardio enabled, but no available cardio exercise was found.')

  const selectedStrengthBuckets = new Set(
    generatedStrength
      .filter((exercise) => exercise.phase === 'strength')
      .map((exercise) => exercise.primaryBucket)
      .filter((bucket): bucket is MuscleBucketKey => bucket != null),
  )
  const cardioCodes = new Set(cardio.map((exercise) => exercise.code))
  const mobilityWarmupSource = plannedWarmupCount > 0
    ? selectMobilityRoutine(relevantMobility, 'mobilityWarmup', plannedWarmupCount, selectedStrengthBuckets, day, cardioCodes)
    : []
  const mobilityWarmup = mobilityWarmupSource.map((exercise) => makeMobilityExercise(exercise, 'mobilityWarmup'))
  const mobilityCooldownSource = plannedCooldownCount > 0
    ? selectMobilityRoutine(
        relevantMobility,
        'mobilityCooldown',
        plannedCooldownCount,
        selectedStrengthBuckets,
        day,
        new Set([
          ...cardioCodes,
          ...mobilityWarmupSource.map((exercise) => exercise.code),
        ]),
      )
    : []
  const mobilityCooldown = mobilityCooldownSource.map((exercise) => makeMobilityExercise(exercise, 'mobilityCooldown'))
  if (inputs.mobilityWarmupEnabled || inputs.mobilityCooldownEnabled) {
    events.push(`Mobility target ${routineCount} per routine; generated ${mobilityWarmup.length} warm-up and ${mobilityCooldown.length} cool-down movements.`)
  }

  const rankedCandidates: OptimRankedCandidate[] = scored.map(({ exercise, score, breakdown, rank }) => ({
    code: exercise.code,
    name: exercise.name,
    score,
    primaryBucket: exercise.primaryBucket,
    isCore: exercise.isCore,
    breakdown,
    rank,
  })).map(({ rank: _rank, ...candidate }) => candidate)
  if (foundationNonCoreCount > 0) {
    const strictCodes = new Set(scored.map(({ exercise }) => exercise.code))
    rankedCandidates.push(...strengthFoundationScored
      .filter(({ exercise }) => !strictCodes.has(exercise.code))
      .map(({ exercise, score, breakdown }) => ({
        code: exercise.code,
        name: exercise.name,
        score,
        primaryBucket: exercise.primaryBucket,
        isCore: exercise.isCore,
        breakdown,
        pool: 'strengthFoundation' as const,
      })))
  }
  const generatedExercises = [...mobilityWarmup, ...generatedStrength, ...cardio, ...mobilityCooldown]
  const projectedDurationSeconds = generatedExercises.reduce(
    (seconds, exercise) => seconds + estimatedExerciseSeconds(exercise),
    0,
  )
  const projectedDurationMinutes = round(projectedDurationSeconds / 60, 1)
  const durationUtilization = inputs.durationMinutes > 0
    ? projectedDurationSeconds / (inputs.durationMinutes * 60)
    : 0
  if (durationUtilization < 0.75) {
    events.push(
      `Emitted set/rest subtotal ${projectedDurationMinutes} of ${inputs.durationMinutes} minutes (${round(durationUtilization * 100, 1)}% of the ceiling); setup, equipment changes, and exercise transitions are excluded, so this does not prove the real session is underfilled.`,
    )
  }

  return {
    generatedAt: new Date(nowMs).toISOString(),
    foundationFallback,
    durationEstimate: {
      requestedMinutes: inputs.durationMinutes,
      projectedMinutes: projectedDurationMinutes,
      utilization: round(durationUtilization, 3),
      strengthBudgetMinutes: strengthDurationMinutes,
    },
    counts: {
      computedNonCore: computedCounts.nonCore,
      computedCore: computedCounts.core,
      requestedNonCore,
      requestedCore,
      generatedStrength: generatedStrength.filter((exercise) => exercise.phase === 'strength').length,
      generatedCore: generatedStrength.filter((exercise) => exercise.phase === 'core').length,
      generatedCardio: cardio.length,
      generatedMobility: mobilityWarmup.length + mobilityCooldown.length,
      ...(foundationNonCoreCount > 0 ? { foundationNonCore: foundationNonCoreCount } : {}),
    },
    muscleUsage,
    recoveryWindowDays: recoveryWindowDays(inputs),
    availabilityRatio: round(availabilityRatio),
    exercises: generatedExercises,
    rankedCandidates,
    rejectedCandidates,
    events,
    dataNotes: [
      'Exercise names, muscles, equipment, measurements, types, tags, popularity, and favorites come from the JustGains offline catalog.',
      'Every flattened required-equipment code is mandatory; nested legacy groups are preserved for compatibility but are not treated as alternatives.',
      'A display-name implement becomes one additional requirement only when the catalog corroborates that exact code in optional equipment; non-leading tokens also require a matching exercise-code prefix, while other optional accessories and uncorroborated names remain unchanged.',
      'When the equipment whitelist is restricted, non-bodyweight dedicated-machine rows with multiple structural signals but no equipment declarations are rejected with a visible reason; selecting every catalog equipment code preserves the default path.',
      'Recovery and exercise history come from completed local workout logs; 7d/30d/6m set counts are displayed as corroborating user stats.',
      `Recovered debug-only metadata supplied level, goal tiers/ratings, reps scale, and exercise flags for ${metadataMatchCount} of ${adapted.length} adapted exercises; unmatched/custom exercises retain the catalog-derived fallback.`,
      `For the active ${foundationFallback ? 'strength-foundation' : 'goal'} profile, experience, gender, and age, ${warmStartProfileMatchCount} of ${adapted.length} adapted catalog exercises have an exact retained warm-start cell; selection safety and load precedence still decide whether a cell is used.`,
      'The metadata overlay is bundled separately and does not change ExerciseListItem, OpenAPI, the offline exercise cache, or production workout generation.',
      'Capability adjustment requires a logged target placeholder, is capped at 107% of that target before inactivity decay, and leaves targetless load history on smoothing alone. The optional measured-effort hold recognizes a winning max that already used a valid logged RPE and skips only the duplicate target-gap multiplier; target-only, invalid-RPE, bodyweight, smoothing, cap, and inactivity behavior remain unchanged. A separate optional logged-effort catch-up may raise that cap to 118% of the target, but only when the latest observation carries a real logged RPE and its own RPE-adjusted arithmetic supports the higher value; omitted/false callers retain the recovered 107% cap. Repeated-set rep history uses the inverse set factor and moves target-relative capacity only by completed-vs-placeholder performance; normal bodyweight targets stop at 20 reps and re-run the set budget. A separate versioned sidecar converts only high-confidence fully suspended added/assisted movements into effective load using current profile bodyweight; resolvable added-load sets stay out of the unloaded rep stream, while assisted and unresolved movements retain rep progression. The optional Bodyweight gear policy suppresses both history-derived added load and the recovered 5% cadence fallback without changing omitted/false callers.',
      'Canonical ExerciseListItem weight-per-side metadata is exposed independently from recovered unilateral reps. Weight values stay in the catalog logging unit, and recovered relationship ratios are never multiplied or divided for display.',
      'Unambiguous recovered reference-exercise ratios can warm-start a load from one hop of smoothed reference history when direct load history is absent. The fallback never chains, promotes max effort, applies to bodyweight/assisted work, or invents Fitbod\'s 20 kg default.',
      'When both direct and reference history are absent, strict or explicitly reviewed recovered demographic warm-start cells may supply a first-use max. Reviewed redirects and collapsed-source resolutions pin their source, mapping, and sibling identities; all unresolved collapsed mappings remain omitted. The optional relationship warm-start policy may derive one additional product-only hop from an existing reviewed reference cell and recovered relative weight, after a direct cell is unavailable. These paths require recognized gender and age and are disabled for bodyweight, assisted, timed, distance, band, legacy circuit, and max-effort work. The optional guided-circuit product policy restores eligible loads, then guides only actual weighted circuit members through a reduced executable load or, when load snapping would leave the reversible RPE/history window, two fewer reps at the straight load. Its canonical RPE target preserves the planned reserve in later history; ungrouped exercises remain unchanged. A separate General-only product classifier may admit non-main loaded accessories misclassified as tier one, but still rejects max-effort, timed, distance, mobility, weighted-bodyweight, and equipment-incompatible pairs.',
      'Executable-load mode is an optional compatibility seam. Legacy callers default to the app\'s metric plate configuration; an explicit measurement-system input can use the same imperial rack configuration while values remain stored in kg. Fixed dumbbell/kettlebell-only shapes bypass stale plate flags and use exact same-exercise history or recovered generic rounding. Missing or out-of-range non-plate inventory never invents rack increments.',
      'Load evidence is neutral during normal ranking. Only a proven sub-bar choice may yield, and only to proven executable ordinary-weighted work with the same implement-normalized variation, primary muscle intent, and selection constraints; unknown alternatives never earn a ranking boost.',
      'Beginner Olympic foundation mode activates only when the strict non-core pool is empty. It uses strength filtering, scoring, schemes, and warm-start cells without relaxing experience safety or any user-supplied equipment, split, muscle, exclusion, or bodyweight filter.',
      'Outside the preserved beginner Olympic branch, an exhausted Olympic or powerlifting pool keeps every authentic lift first, then may fill only missing non-core slots through strength scoring, position rules, schemes, warm-start cells, and load logic. Each filler is labeled, and every original safety and user constraint remains active.',
      'Specialized strength-foundation scoring exposes a positive-only sport utility from bucket-compatible movement patterns and compound tags; neutral exercises keep their prior score. Full-body fillers reserve only lower, push, and pull roles that surviving constrained candidates can cover.',
      'Ordinary goal selection and labeled strength-foundation fillers prefer a recognized unseen movement pattern only inside the existing 0.15 competitive score window and current bucket/position tier, before equipment continuity. Unknown patterns receive no diversity advantage, sparse pools retain fallback fill, and authentic Olympic/powerlifting balancing is unchanged.',
      'When an overhead press has authored top primary muscles tied at the exact same percentage across multiple buckets, an authored shoulder bucket resolves the otherwise source-order-dependent tie. Unequal target percentages and every other movement pattern remain catalog-authoritative, and all other authored primary buckets retain secondary recovery credit.',
      'A name-derived movement pattern grants strict main-lift position rights only when at least one authored top-primary muscle bucket is compatible with that pattern. Hybrid movements retain their kinematic pattern for diversity and load matching, remain selectable through the visible backup ladder, and cannot shrink sparse workouts.',
      'Compatible adjacent superset pairs keep their sets, loads, rest, order, and duration subtotal unchanged. The product adapter maps engine groups to production exerciseGroupType values (superset to SUPERSET; circuit to CIRCUIT), while this pure engine still performs no save or mutation.',
      'Projected duration fields are an emitted set/rest subtotal using set durations, three seconds per rep, and configured rest. They exclude setup, equipment changes, and exercise transitions, cannot determine real-session utilization, and never expand workout volume.',
      'The 21 sets/reps tables and numeric formulas are recovered Optim constants. This screen never writes a workout or invokes production workout generation.',
      injuryNote,
    ],
  }
}

export function defaultOptimDemoInputs(options?: {
  experience?: string | null
  fitnessGoals?: string[] | null
  equipmentCodes?: string[]
  executableLoads?: boolean
  generationDate?: Date
}): OptimDemoInputs {
  const experience: OptimDemoExperience = options?.experience === 'Beginner'
    ? 'beginner'
    : options?.experience === 'Advanced'
      ? 'advanced'
      : 'intermediate'
  const goals = (options?.fitnessGoals ?? []).map((goal) => goal.toLowerCase())
  const goal: OptimDemoGoal = goals.some((item) => item.includes('muscle') || item.includes('size'))
    ? 'bodybuilding'
    : goals.some((item) => item.includes('strength'))
      ? 'strength'
      : goals.some((item) => item.includes('fat') || item.includes('tone'))
        ? 'muscleTone'
        : 'general'
  return {
    durationMinutes: 60,
    goal,
    experience,
    split: 'fresh',
    bodyweightOnly: false,
    circuitsEnabled: false,
    supersetsEnabled: false,
    warmupSetsEnabled: true,
    mobilityWarmupEnabled: false,
    mobilityCooldownEnabled: false,
    cardioEnabled: false,
    executableLoadsEnabled: options?.executableLoads ?? false,
    availableEquipmentCodes: options?.equipmentCodes ?? [],
    selectedMuscleBuckets: [],
    selectedCardioExerciseCodes: [],
    startingExerciseCodes: [],
    focusExerciseCodes: [],
    excludedExerciseCodes: [],
    manualRecoveryPercent: {},
    seed: 0,
    generationDateIso: (options?.generationDate ?? new Date()).toISOString(),
    nonCoreCountOverride: null,
    coreCountOverride: null,
  }
}
