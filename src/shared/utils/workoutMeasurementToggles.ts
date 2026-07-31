import type { ExerciseSet, Measurement, WorkoutData } from '../api'
import { getMeasurementUnitData, type MeasurementCode } from '../demo-data/MeasurementData'

export interface WorkoutMeasurementToggleState {
	templateMeasurements: NonNullable<WorkoutData['measurementTemplate']>
	templateMeasurementCodes: MeasurementCode[]
	currentMeasurements: Measurement[]
	currentMeasurementCodes: MeasurementCode[]
	showIntervalToggle: boolean
	isIntervalEnabled: boolean
	isRpeEnabled: boolean
	showRepsSubToggle: boolean
	canTurnOffInterval: boolean
	canTurnOffRpe: boolean
}

function cloneExerciseData(exerciseData: ExerciseSet[]): ExerciseSet[] {
	return exerciseData.map(set => ({
		...set,
		setMeasurements: set.setMeasurements
			? set.setMeasurements.map(measurement => ({ ...measurement }))
			: [],
	}))
}

function normalizeMeasurementCode(value: string | null | undefined) {
	return value?.trim().toUpperCase() ?? ''
}

export function getWorkoutMeasurementSchema(workoutData: WorkoutData): Measurement[] {
	const orderedMeasurements: Measurement[] = []
	const seenCodes = new Set<string>()

	const appendMeasurement = (measurement: Measurement | null | undefined) => {
		const normalizedCode = normalizeMeasurementCode(measurement?.measurementCode)
		if (!normalizedCode) return

		if (seenCodes.has(normalizedCode)) {
			const existingMeasurement = orderedMeasurements.find(
				item => normalizeMeasurementCode(item.measurementCode) === normalizedCode,
			)

			if (existingMeasurement && !existingMeasurement.preferredUnit && measurement?.preferredUnit) {
				existingMeasurement.preferredUnit = measurement.preferredUnit
			}

			return
		}

		orderedMeasurements.push({
			measurementCode: measurement?.measurementCode ?? normalizedCode,
			preferredUnit: measurement?.preferredUnit ?? null,
			measurementValue: null,
			measurementPlaceholder: null,
		})
		seenCodes.add(normalizedCode)
	}

	for (const measurement of workoutData.measurementTemplate ?? []) {
		appendMeasurement(measurement)
	}

	for (const set of workoutData.exerciseData ?? []) {
		for (const measurement of set.setMeasurements ?? []) {
			appendMeasurement(measurement)
		}
	}

	return orderedMeasurements
}

function createMeasurementToggleEntry(
	measurementCode: MeasurementCode,
): Measurement {
	const metricUnitData = getMeasurementUnitData({
		measurementCode,
		measurementSystem: 'metric',
	})

	return {
		measurementCode,
		preferredUnit: null,
		measurementValue: metricUnitData.defaultValue ?? null,
	}
}

function createMeasurementTemplateEntry(
	measurementCode: MeasurementCode,
): Measurement {
	const metricUnitData = getMeasurementUnitData({
		measurementCode,
		measurementSystem: 'metric',
	})

	return {
		measurementCode,
		preferredUnit: metricUnitData.unitCode ?? null,
		measurementValue: null,
	}
}

function insertMeasurement(
	measurements: Measurement[],
	newMeasurement: Measurement,
): Measurement[] {
	if (newMeasurement.measurementCode === 'REPS') {
		return [newMeasurement, ...measurements]
	}

	if (newMeasurement.measurementCode === 'DURATION') {
		return [...measurements, newMeasurement]
	}

	if (newMeasurement.measurementCode === 'RPE') {
		return [...measurements, newMeasurement]
	}

	const nextMeasurements = [...measurements]
	const rpeIndex = nextMeasurements.findIndex(measurement => measurement.measurementCode === 'RPE')

	if (rpeIndex === -1) {
		nextMeasurements.push(newMeasurement)
	} else {
		nextMeasurements.splice(rpeIndex, 0, newMeasurement)
	}

	return nextMeasurements
}

function updateMeasurementList(
	measurements: Measurement[],
	measurementCode: MeasurementCode,
	shouldEnable: boolean,
	createEntry: (measurementCode: MeasurementCode) => Measurement,
): Measurement[] {
	const existingIndex = measurements.findIndex(
		measurement => measurement.measurementCode === measurementCode,
	)

	if (!shouldEnable) {
		return measurements.filter(measurement => measurement.measurementCode !== measurementCode)
	}

	if (existingIndex >= 0) {
		return measurements
	}

	const newMeasurement = createEntry(measurementCode)

	return insertMeasurement(measurements, newMeasurement)
}

export function getWorkoutMeasurementToggleState(
	workoutData: WorkoutData,
): WorkoutMeasurementToggleState {
	const templateMeasurements = getWorkoutMeasurementSchema(workoutData)
	const currentMeasurements = templateMeasurements

	const templateMeasurementCodes = templateMeasurements
		.map(measurement => measurement.measurementCode)
		.filter((code): code is MeasurementCode => !!code)
	const currentMeasurementCodes = currentMeasurements
		.map(measurement => measurement.measurementCode)
		.filter((code): code is MeasurementCode => !!code)

	const showIntervalToggle =
		templateMeasurementCodes.includes('REPS') && !templateMeasurementCodes.includes('DURATION')
	const isIntervalEnabled = currentMeasurementCodes.includes('DURATION')
	const isRpeEnabled = currentMeasurementCodes.includes('RPE')
	const showRepsSubToggle = !isRpeEnabled && isIntervalEnabled
	const canTurnOffInterval = currentMeasurementCodes.some(code => code !== 'DURATION')
	const canTurnOffRpe = currentMeasurementCodes.some(code => code !== 'RPE')

	return {
		templateMeasurements,
		templateMeasurementCodes,
		currentMeasurements,
		currentMeasurementCodes,
		showIntervalToggle,
		isIntervalEnabled,
		isRpeEnabled,
		showRepsSubToggle,
		canTurnOffInterval,
		canTurnOffRpe,
	}
}

export function toggleWorkoutMeasurement(
	workoutData: WorkoutData,
	measurementCode: MeasurementCode,
): WorkoutData {
	if (!workoutData.exerciseData?.length) return workoutData

	// Check active state from exerciseData (not schema — schema unions with
	// the permanent template, so it always shows measurements as present)
	const isActiveInSets = workoutData.exerciseData.some(set =>
		(set.setMeasurements ?? []).some(m => m.measurementCode === measurementCode),
	)
	const shouldEnable = !isActiveInSets

	const nextExerciseData = cloneExerciseData(workoutData.exerciseData).map(set => ({
		...set,
		setMeasurements: updateMeasurementList(
			set.setMeasurements ?? [],
			measurementCode,
			shouldEnable,
			createMeasurementToggleEntry,
		),
	}))

	// Template only grows — it tracks every measurement the exercise has ever used.
	// This ensures toggled-off measurements can be re-enabled from the toggle list.
	const nextMeasurementTemplate = updateMeasurementList(
		workoutData.measurementTemplate ?? [],
		measurementCode,
		true,
		createMeasurementTemplateEntry,
	)

	return {
		...workoutData,
		measurementTemplate: nextMeasurementTemplate,
		exerciseData: nextExerciseData,
	}
}

/**
 * Remap exercise sets to match a new exercise's measurement schema.
 * Matching measurements (by code) keep their values; new measurements
 * get null; old measurements not in the new schema are dropped.
 */
export function remapSetsToNewMeasurements(
	oldSets: ExerciseSet[],
	newMeasurementCodes: string[],
): ExerciseSet[] {
	if (!oldSets.length || !newMeasurementCodes.length) return oldSets

	return oldSets.map(set => {
		const remapped = newMeasurementCodes.map(code => {
			const existing = (set.setMeasurements ?? []).find(
				m => m.measurementCode === code,
			)

			return {
				measurementCode: code,
				measurementValue: existing?.measurementValue ?? null,
				measurementPlaceholder: existing?.measurementPlaceholder ?? null,
				preferredUnit: existing?.preferredUnit ?? null,
			}
		})

		const hasUnfilledMeasurement =
			set.setCompleted && remapped.some(m => m.measurementValue == null)

		return {
			...set,
			setMeasurements: remapped,
			setCompleted: hasUnfilledMeasurement ? false : set.setCompleted,
		}
	})
}

/**
 * Build the measurement schema for an exercise replacement. Catalog-owned
 * measurements follow the new exercise, while REST is a workout prescription
 * attached to the sets and must survive a swap.
 */
export function getReplacementMeasurementCodes(
	oldSets: ExerciseSet[],
	newExerciseMeasurementCodes: string[],
): string[] {
	const codes = new Set(newExerciseMeasurementCodes)
	if (
		oldSets.some(set =>
			(set.setMeasurements ?? []).some(
				measurement => measurement.measurementCode === 'REST',
			),
		)
	) {
		codes.add('REST')
	}
	return [...codes]
}

export function toggleWorkoutInterval(workoutData: WorkoutData): WorkoutData {
	if (!workoutData.exerciseData?.length) return workoutData

	const measurementSchema = getWorkoutMeasurementSchema(workoutData)
	const shouldEnable = !measurementSchema.some(
		measurement => measurement.measurementCode === 'DURATION',
	)

	const nextExerciseData = cloneExerciseData(workoutData.exerciseData).map(set => {
		const measurements = set.setMeasurements ?? []
		if (!shouldEnable) {
			return {
				...set,
				setMeasurements: measurements.filter(
					measurement => measurement.measurementCode !== 'DURATION',
				),
			}
		}

		return {
			...set,
			setMeasurements: [
				...measurements,
				{
					measurementCode: 'DURATION',
					measurementValue: 30,
				},
			],
		}
	})
	const nextMeasurementTemplate = updateMeasurementList(
		workoutData.measurementTemplate ?? [],
		'DURATION',
		shouldEnable,
		createMeasurementTemplateEntry,
	)

	return {
		...workoutData,
		measurementTemplate: nextMeasurementTemplate,
		exerciseData: nextExerciseData,
	}
}
