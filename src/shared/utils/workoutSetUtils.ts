import type { ExerciseSet, WorkoutData } from '../api'
import { Measurement } from '../api/types/Measurement'
import {
	isCountableWorkoutExercise,
	isExerciseList,
	isSpecialWorkoutData,
} from '../enums/WorkoutDataTypes'
import {
	convertKgToGymLbs,
	type MeasurementSystem,
} from './measurementUtils'
import { BAND_INVERSION_BASE } from '../demo-data/BandOptions'

/**
 * Measurements where a LOWER value is the better result (a PR). Assisted
 * resistance bands are the inverse of normal bands: the lightest band (lowest
 * value) gives the least assistance and is the hardest variation.
 */
export const LOWER_IS_BETTER_MEASUREMENTS = new Set(['ASSISTED_RESISTANCE_BAND'])

export const isLowerBetterMeasurement = (
	measurementCode: string | null | undefined,
): boolean => !!measurementCode && LOWER_IS_BETTER_MEASUREMENTS.has(measurementCode)

/**
 * Value used when multiplying measurements into a set "score". Lower-is-better
 * band measurements are inverted so a lighter band yields a higher score.
 */
export const getMeasurementScoreValue = (
	measurementCode: string | null | undefined,
	value: number,
): number =>
	isLowerBetterMeasurement(measurementCode)
		? Math.max(0, BAND_INVERSION_BASE - value)
		: value

/**
 * Set types whose consecutive sets chain into one linked group (a parent set
 * followed by sub-items): dropsets (weight drops each chunk) and myo reps
 * (same weight, short rests between chunks).
 */
export const LINKED_SET_TYPES = ['dropset', 'myorep'] as const

export type LinkedSetType = (typeof LINKED_SET_TYPES)[number]

export const isLinkedSetType = (
	setType: ExerciseSet['setType'] | null | undefined,
): setType is LinkedSetType =>
	setType === 'dropset' || setType === 'myorep'

/**
 * Check if a set at the given index is a linked-set sub-item (dropset or myo
 * reps). A sub-item is any consecutive set of the same linked type after the
 * first one in a run. The first set in a consecutive run is the "parent" and
 * is NOT a sub-item. `isDropsetStart` breaks a run into a new group for both
 * linked types.
 */
export const isDropsetSubItem = (
	sets: ExerciseSet[],
	index: number,
): boolean => {
	const currentSet = sets[index]
	if (!currentSet || !isLinkedSetType(currentSet.setType)) return false
	if (currentSet.isDropsetStart) return false
	if (index === 0) return false
	return sets[index - 1]?.setType === currentSet.setType
}

/**
 * Check if a linked set (dropset or myo reps) at the given index has another
 * set of the same type immediately after it.
 */
export const hasDropsetContinuation = (
	sets: ExerciseSet[],
	index: number,
): boolean => {
	const currentSet = sets[index]
	if (!currentSet || !isLinkedSetType(currentSet.setType)) return false
	if (index >= sets.length - 1) return false
	return sets[index + 1]?.setType === currentSet.setType
}

/**
 * Calculate the display set number for a given set index.
 * Warmup sets and dropset sub-items return undefined (they display a letter instead).
 * Non-warmup, non-sub-item sets are numbered sequentially.
 *
 * Example: [warmup, normal, dropset, dropset, normal] -> [undefined, 1, 2, undefined, 3]
 */
export const getDisplaySetNumber = (
	sets: ExerciseSet[],
	index: number,
): number | undefined => {
	const currentSet = sets[index]
	if (!currentSet) return undefined

	if (currentSet.setType === 'warmup') return undefined

	if (isDropsetSubItem(sets, index)) return undefined

	const countBefore = sets
		.slice(0, index)
		.filter((set, i) => {
			if (set.setType === 'warmup') return false
			if (isDropsetSubItem(sets, i)) return false
			return true
		}).length

	return countBefore + 1
}

/**
 * Calculate a score for a set based on its measurements.
 * Multiplies load/work measurements together for a "volume" score. REST and
 * RPE describe recovery/effort, not work performed, so neither ranks a set.
 */
export const calculateSetScore = (set: ExerciseSet): number => {
	const relevantMeasurements = (set.setMeasurements ?? []).filter(
		(m: Measurement) =>
			m.measurementCode !== 'REST' &&
			m.measurementCode !== 'RPE' &&
			m.measurementValue != null,
	)

	if (relevantMeasurements.length === 0) return 0

	// Multiply all measurement values together to get a "volume" score.
	// Lower-is-better measurements (e.g. assisted bands) are inverted so a
	// lighter band raises the score instead of lowering it.
	return relevantMeasurements.reduce(
		(score: number, m: Measurement) => {
			let val = 1;
			if (typeof m.measurementValue === 'number') {
				val = m.measurementValue;
			} else if (typeof m.measurementValue === 'string') {
				const parsed = parseFloat(m.measurementValue);
				if (!isNaN(parsed)) val = parsed;
			}
			return score * getMeasurementScoreValue(m.measurementCode, val);
		},
		1,
	)
}

/**
 * Get the best set from an array of sets based on calculated score.
 * Optionally filters to only completed sets first.
 */
export const getBestSet = (sets: ExerciseSet[]): ExerciseSet | null => {
	if (!sets || sets.length === 0) return null

	return sets.reduce((best, current) => {
		const bestScore = calculateSetScore(best)
		const currentScore = calculateSetScore(current)

		return currentScore > bestScore ? current : best
	})
}

/**
 * Get the best set considering completion status.
 * Prefers completed sets, but falls back to all sets if none are completed.
 */
export const getBestCompletedSet = (
	sets: ExerciseSet[],
): ExerciseSet | null => {
	if (!sets || sets.length === 0) return null

	const completedSets = sets.filter(set => set.setCompleted !== false)
	const setsToConsider = completedSets.length > 0 ? completedSets : sets

	return getBestSet(setsToConsider)
}

/**
 * Baseline RPE assumed for sets logged without one, mirroring the server's
 * OneRepMaxCalculator.AssumedRpe.
 */
export const ASSUMED_RPE = 7

export const estimateOneRepMax = ({
	weight,
	reps,
	rpe,
	setCompleted,
}: {
	weight: number
	reps: number
	/** Omit to assume the ASSUMED_RPE baseline, matching the server. */
	rpe?: number | null
	setCompleted?: boolean | null
}): number | null => {
	if (setCompleted === false) return null
	if (!Number.isFinite(weight) || weight <= 0) return null
	if (!Number.isInteger(reps) || reps < 1) return null

	// Sets outside the formula's validity range still prove the lifter can move
	// the weight for at least one rep — fall back to the weight itself as a
	// lower-bound estimate, mirroring the server's OneRepMaxCalculator.
	const lowerBound = Math.round(weight * 100) / 100

	const effectiveRpe = rpe ?? ASSUMED_RPE
	if (!Number.isFinite(effectiveRpe) || effectiveRpe < 6 || effectiveRpe > 10)
		return lowerBound

	const adjustedReps = reps + (10 - effectiveRpe)
	if (adjustedReps > 15) return lowerBound

	const rawEstimate =
		reps === 1 && effectiveRpe === 10
			? weight
			: weight * (1 + adjustedReps / 30)

	return Math.round(rawEstimate * 100) / 100
}

export const hasMeaningfulMeasurementValue = (
	value: Measurement['measurementValue'],
): boolean => {
	if (typeof value === 'number') {
		return Number.isFinite(value) && value > 0
	}

	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) return false

		const numeric = Number(trimmed)
		return Number.isFinite(numeric) ? numeric > 0 : true
	}

	return false
}

/**
 * Reorder sets so warmup sets are grouped at the top. Returns a new array
 * with renumbered setNumber values (1-based). Non-warmup sets keep their
 * relative order below the warmup block.
 *
 * Only moves sets when necessary — if a non-warmup set already sits below
 * all warmups, it stays put. The typical trigger is changing a set's type
 * to 'warmup' (it floats up) or from 'warmup' to something else (it sinks
 * below the warmup block).
 */
export const reorderSetsForWarmups = (
	sets: ExerciseSet[],
): ExerciseSet[] => {
	const warmups = sets.filter(s => s.setType === 'warmup')
	const rest = sets.filter(s => s.setType !== 'warmup')
	const reordered = [...warmups, ...rest]

	return reordered.map((set, i) => ({
		...set,
		setNumber: i + 1,
	}))
}

export const setHasRecordedValues = (set: ExerciseSet): boolean =>
	(set.setMeasurements ?? []).some(
		measurement =>
			measurement.measurementCode !== 'REST' &&
			hasMeaningfulMeasurementValue(measurement.measurementValue),
	)

const stripPlaceholderOnlyMeasurements = (set: ExerciseSet): ExerciseSet => ({
	...set,
	setMeasurements: (set.setMeasurements ?? [])
		.map(measurement => ({
			...measurement,
			measurementPlaceholder: null,
		}))
		.filter(measurement => measurement.measurementValue != null),
})

/**
 * Copy placeholder suggestions into real values, exactly like tapping the
 * set's completion checkmark does. Finishing auto-completes sets that have at
 * least one recorded value, so the remaining suggested values must be accepted
 * too — dropping them instead leaves half-logged sets (e.g. a weight with no
 * reps), which zeroes the volume/comparison math and renders "10 lb" instead
 * of "10 x 10 lb" on the summary.
 */
const commitPlaceholderValues = (set: ExerciseSet): ExerciseSet => ({
	...set,
	setMeasurements: (set.setMeasurements ?? []).map(measurement =>
		measurement.measurementValue == null && measurement.measurementPlaceholder != null
			? { ...measurement, measurementValue: measurement.measurementPlaceholder }
			: measurement,
	),
})

export type FinishedWorkoutNormalizationResult = {
	cleanedWorkoutData: WorkoutData[]
	setsWithRecordedValues: number
	autoCompletedSetCount: number
	removedEmptySetCount: number
}

export const normalizeWorkoutDataForFinishedLog = (
	workoutData: WorkoutData[] | undefined,
): FinishedWorkoutNormalizationResult => {
	if (!workoutData?.length) {
		return {
			cleanedWorkoutData: [],
			setsWithRecordedValues: 0,
			autoCompletedSetCount: 0,
			removedEmptySetCount: 0,
		}
	}

	let setsWithRecordedValues = 0
	let autoCompletedSetCount = 0
	let removedEmptySetCount = 0

	const cleanedWorkoutDataWithPossibleOrphans = workoutData
		.map(exercise => {
			if (isSpecialWorkoutData(exercise) && !isExerciseList(exercise)) {
				return exercise
			}

			const normalizedSets =
				exercise.exerciseData
					?.filter(set => {
						const hasRecordedValues = setHasRecordedValues(set)
						if (!hasRecordedValues) {
							removedEmptySetCount += 1
						}

						return hasRecordedValues
					})
					.map((set, index) => {
						setsWithRecordedValues += 1
						if (set.setCompleted !== true) {
							autoCompletedSetCount += 1
						}

						return {
							...stripPlaceholderOnlyMeasurements(commitPlaceholderValues(set)),
							setNumber: index + 1,
							setCompleted: true,
						}
					}) ?? []

			if (normalizedSets.length === 0) {
				return null
			}

			return {
				...exercise,
				exerciseData: normalizedSets,
			}
		})
		.filter((exercise): exercise is WorkoutData => exercise !== null)

	// Finishing can remove every recorded set from some members of a superset
	// or circuit. Do not persist the remaining exercise as a misleading
	// one-member group; groups with two or more completed members stay intact.
	const groupMemberCounts = new Map<number, number>()
	for (const exercise of cleanedWorkoutDataWithPossibleOrphans) {
		const groupId = exercise.exerciseGroupId
		if (groupId == null) continue
		groupMemberCounts.set(groupId, (groupMemberCounts.get(groupId) ?? 0) + 1)
	}
	const cleanedWorkoutData = cleanedWorkoutDataWithPossibleOrphans.map(exercise => {
		const groupId = exercise.exerciseGroupId
		if (groupId == null || (groupMemberCounts.get(groupId) ?? 0) >= 2) {
			return exercise
		}
		return {
			...exercise,
			exerciseGroupId: null,
			exerciseGroupType: null,
			exerciseGroupName: null,
		}
	})

	return {
		cleanedWorkoutData,
		setsWithRecordedValues,
		autoCompletedSetCount,
		removedEmptySetCount,
	}
}

/**
 * Total volume (weight × reps across all sets) expressed in the user's display
 * unit, computed per set.
 *
 * Imperial weights are shown via the gym lookup table (e.g. 5 kg → 10 lb), so
 * converting a summed kg volume with raw math (5 kg → 11 lb) disagrees with the
 * per-set weights the user sees. Summing the gym-converted weight of each set
 * keeps the volume stat consistent with the set rows. Metric is unchanged
 * (weights are already stored in kg).
 *
 * Returns the volume in the display unit (lb for imperial, kg for metric).
 * Falls back to 0 when there is no per-set data — callers should use the API
 * summary volume in that case.
 */
export const computeDisplayVolume = (
	workoutData: WorkoutData[] | null | undefined,
	measurementSystem: MeasurementSystem = 'metric',
): number => {
	if (!workoutData?.length) return 0

	let total = 0
	for (const exercise of workoutData) {
		if (!isCountableWorkoutExercise(exercise)) continue
		// Per-side exercises (dumbbells, single-arm work) load both sides, so the
		// logged weight represents one side — count it twice. Mirrors the server's
		// WorkoutMetricsCalculator so the client estimate matches the synced total.
		const sideMultiplier = exercise.isWeightPerSide ? 2 : 1
		for (const set of exercise.exerciseData ?? []) {
			const measurements = set.setMeasurements ?? []
			const weightKg = Number(
				measurements.find(m => m.measurementCode === 'WEIGHT')
					?.measurementValue ?? 0,
			)
			// Missing reps default to 1, mirroring the server's
			// WorkoutMetricsCalculator — a weight-only set must contribute the
			// same volume locally as in the synced summary.
			const repsRaw = measurements.find(m => m.measurementCode === 'REPS')
				?.measurementValue
			const reps = repsRaw == null ? 1 : Number(repsRaw)
			if (!weightKg || !reps || !Number.isFinite(weightKg) || !Number.isFinite(reps))
				continue

			const weight =
				measurementSystem === 'imperial'
					? convertKgToGymLbs(weightKg)
					: weightKg
			total += weight * reps * sideMultiplier
		}
	}

	return measurementSystem === 'imperial' ? Math.round(total) : total
}

/**
 * Total lifted volume in kilograms, mirroring the server's
 * WorkoutMetricsCalculator.CalculateTotalVolume: per-side exercises count both
 * sides (weight × 2). Kept in raw kg (no display-unit conversion) because
 * callers match it against kg reference weights (e.g. the comparison carousel).
 * Use this — never a plain reps × weight sum — so the pre-sync client estimate
 * agrees with the authoritative summary that syncs back from the server.
 */
export const computeTotalVolumeKg = (
	workoutData: WorkoutData[] | null | undefined,
): number => {
	if (!workoutData?.length) return 0

	let total = 0
	for (const exercise of workoutData) {
		if (!isCountableWorkoutExercise(exercise)) continue
		const sideMultiplier = exercise.isWeightPerSide ? 2 : 1
		for (const set of exercise.exerciseData ?? []) {
			const measurements = set.setMeasurements ?? []
			const weightKg = Number(
				measurements.find(m => m.measurementCode === 'WEIGHT')
					?.measurementValue ?? 0,
			)
			// Missing reps default to 1, mirroring the server's
			// WorkoutMetricsCalculator — a weight-only set must contribute the
			// same volume locally as in the synced summary.
			const repsRaw = measurements.find(m => m.measurementCode === 'REPS')
				?.measurementValue
			const reps = repsRaw == null ? 1 : Number(repsRaw)
			if (!weightKg || !reps || !Number.isFinite(weightKg) || !Number.isFinite(reps))
				continue

			total += weightKg * reps * sideMultiplier
		}
	}

	return total
}

/**
 * Build an order-stable fingerprint of a workout's exercise shape: the real
 * exercise codes (placeholders like `_VIDEO_`, `_CALLOUT_`, `_EXERCISE_LIST_`
 * dropped) ordered by `exerciseOrder`, joined with `|`.
 *
 * Mirrors the server's `WorkoutSerialHelper.Serialize` exactly so a serial
 * computed on the client equals the one computed on the API for the same
 * workout. Used to recognise when a user repeats the "same workout" so we can
 * compare its stats to prior sessions. Returns '' when there are no real
 * exercises.
 */
export const serializeExerciseCodes = (
	workoutData: WorkoutData[] | null | undefined,
): string => {
	if (!workoutData?.length) return ''

	return workoutData
		.filter(wd => {
			const code = wd.exerciseCode
			return !!code && !code.startsWith('_')
		})
		.slice()
		.sort((a, b) => {
			const orderDiff = (a.exerciseOrder ?? 0) - (b.exerciseOrder ?? 0)
			if (orderDiff !== 0) return orderDiff
			// Deterministic tiebreak so equal orders never reorder between runs
			// or between client and server (C# OrderBy is stable; JS sort is not).
			return (a.exerciseCode ?? '').localeCompare(b.exerciseCode ?? '')
		})
		.map(wd => (wd.exerciseCode ?? '').toUpperCase())
		.join('|')
}

/**
 * Compute a workout's headline totals from its set data — the "computed total"
 * stamped onto `workoutSummary` when a workout is finished so the value is saved
 * locally rather than recomputed later (a synced workout stores its weights as
 * MetricValue objects that read as 0). `totalVolume` is in kg and per-side aware
 * (reuses computeTotalVolumeKg, mirroring the server's WorkoutMetricsCalculator).
 */
export const summarizeWorkoutTotals = (
	workoutData: WorkoutData[] | null | undefined,
): { totalVolume: number; totalSets: number; totalReps: number; exerciseCount: number } => {
	const countable = (workoutData ?? []).filter(isCountableWorkoutExercise)

	let totalSets = 0
	let totalReps = 0
	for (const exercise of countable) {
		for (const set of exercise.exerciseData ?? []) {
			totalSets += 1
			const reps = Number(
				(set.setMeasurements ?? []).find(m => m.measurementCode === 'REPS')
					?.measurementValue ?? 0,
			)
			if (Number.isFinite(reps) && reps > 0) totalReps += reps
		}
	}

	return {
		totalVolume: computeTotalVolumeKg(workoutData),
		totalSets,
		totalReps,
		exerciseCount: countable.length,
	}
}
