import type { MeasurementSystem } from '../types/auth'
import type { WorkoutData } from '@justgains/shared/src/api'
import { UNIT_DATA, type UnitCode, type UnitData } from './UnitData'

export type MeasurementData = {
	measurementName: string
	measurementDisplayName: string
	metricUnits: UnitData[]
	imperialUnits?: UnitData[]
}

const MEASUREMENTS = {
	BODYWEIGHT_MINUS_ASSISTANCE: {
		measurementName: 'Bodyweight Minus Assistance',
		measurementDisplayName: 'Assistance',
		metricUnits: [UNIT_DATA.KG],
		imperialUnits: [UNIT_DATA.LB],
	} as MeasurementData,
	WEIGHT: {
		measurementName: 'Weight',
		measurementDisplayName: 'Weight',
		metricUnits: [UNIT_DATA.KG],
		imperialUnits: [UNIT_DATA.LB],
	} as MeasurementData,
	BODYWEIGHT_PLUS_WEIGHT: {
		measurementName: 'Bodyweight Plus Weight',
		measurementDisplayName: '+ Weight',
		metricUnits: [UNIT_DATA.KG],
		imperialUnits: [UNIT_DATA.LB],
	} as MeasurementData,
	DISTANCE: {
		measurementName: 'Distance',
		measurementDisplayName: 'Distance',
		metricUnits: [UNIT_DATA.KM, UNIT_DATA.METER],
		imperialUnits: [UNIT_DATA.MI, UNIT_DATA.YD],
	} as MeasurementData,
	DURATION: {
		measurementName: 'Duration',
		measurementDisplayName: 'Duration',
		metricUnits: [UNIT_DATA.S],
	} as MeasurementData,
	HEART_RATE: {
		measurementName: 'Heartrate',
		measurementDisplayName: '❤️',
		metricUnits: [UNIT_DATA.BPM],
	} as MeasurementData,
	HOLD_DURATION: {
		measurementName: 'Hold Duration',
		measurementDisplayName: 'Hold',
		metricUnits: [UNIT_DATA.S],
	} as MeasurementData,
	JUMP_HEIGHT: {
		measurementName: 'Jump Height',
		measurementDisplayName: 'Height',
		metricUnits: [UNIT_DATA.CM],
		imperialUnits: [UNIT_DATA.IN],
	} as MeasurementData,
	HEIGHT: {
		measurementName: 'Height',
		measurementDisplayName: 'Height',
		metricUnits: [UNIT_DATA.CM],
		imperialUnits: [UNIT_DATA.IN],
	} as MeasurementData,
	RESISTANCE_BAND: {
		measurementName: 'Resistance Band',
		measurementDisplayName: 'Resistance Band',
		metricUnits: [UNIT_DATA.BAND],
	} as MeasurementData,
	ASSISTED_RESISTANCE_BAND: {
		measurementName: 'Assisted Resistance Band',
		measurementDisplayName: 'Assisted Band',
		metricUnits: [UNIT_DATA.BAND],
	} as MeasurementData,
	REST: {
		measurementName: 'Rest',
		measurementDisplayName: 'Rest',
		metricUnits: [UNIT_DATA.S],
	} as MeasurementData,
	SPEED: {
		measurementName: 'Speed',
		measurementDisplayName: 'Speed',
		metricUnits: [UNIT_DATA.KMH, UNIT_DATA.MPS],
		imperialUnits: [UNIT_DATA.MPH, UNIT_DATA.FPS],
	} as MeasurementData,
	STEPS: {
		measurementName: 'Steps',
		measurementDisplayName: 'Steps',
		metricUnits: [UNIT_DATA.STEP],
	} as MeasurementData,
	TREADMILL_INCLINE_PERCENT: {
		measurementName: 'Treadmill',
		measurementDisplayName: 'Incline',
		metricUnits: [UNIT_DATA.PERCENT],
	} as MeasurementData,
	TREADMILL_INCLINE_PERCENTAGE: {
		measurementName: 'Treadmill',
		measurementDisplayName: 'Incline',
		metricUnits: [UNIT_DATA.PERCENT],
	} as MeasurementData,
	WATTAGE: {
		measurementName: 'Wattage',
		measurementDisplayName: 'Watts',
		metricUnits: [UNIT_DATA.WATT, UNIT_DATA.KW],
	} as MeasurementData,

	LAPS: {
		measurementName: 'Laps',
		measurementDisplayName: 'Laps',
		metricUnits: [UNIT_DATA.LAP],
	} as MeasurementData,
	TEMPO: {
		measurementName: 'Tempo',
		measurementDisplayName: 'Tempo',
		metricUnits: [UNIT_DATA.S],
	} as MeasurementData,
	REPS: {
		measurementName: 'Reps',
		measurementDisplayName: 'Reps',
		metricUnits: [UNIT_DATA.REP],
	} as MeasurementData,
	RPE: {
		measurementName: 'RPE',
		measurementDisplayName: 'RPE',
		metricUnits: [UNIT_DATA.RPE],
	} as MeasurementData,
}

export const MEASUREMENT_DATA = MEASUREMENTS as Record<string, MeasurementData>

export type MeasurementCode = keyof typeof MEASUREMENTS

// Sort order for measurements - REPS and RPE always appear last
const MEASUREMENT_SORT_ORDER: Record<string, number> = {
	REPS: 1,
	RPE: 2,
}

/**
 * Sort measurements so REPS and RPE always appear last
 * Other measurements maintain their original order
 */
export const sortMeasurements = <T extends { measurementCode?: string | null }>(
	measurements: T[],
): T[] => {
	return [...measurements].sort((a, b) => {
		const aOrder = MEASUREMENT_SORT_ORDER[a.measurementCode ?? ''] ?? 0
		const bOrder = MEASUREMENT_SORT_ORDER[b.measurementCode ?? ''] ?? 0

		return aOrder - bOrder
	})
}

export const getMeasurementUnitData = ({
	measurementCode,
	measurementSystem = 'metric',
	preferredUnit,
	workoutData,
}: {
	measurementCode: MeasurementCode
	measurementSystem?: MeasurementSystem | null
	preferredUnit?: UnitCode
	workoutData?: WorkoutData | null
}): UnitData => {
	const data = MEASUREMENT_DATA[measurementCode]
	if (!data)
		throw new Error(`Measurement data not found for code: ${measurementCode}`)

	const allUnits = [...(data.metricUnits ?? []), ...(data.imperialUnits ?? [])]

	// Case: pull preferred unit from workoutData
	const workoutUnit = workoutData?.measurementTemplate?.find(
		m =>
			m.measurementCode === measurementCode &&
			m.preferredUnit &&
			!preferredUnit,
	)

	if (workoutUnit) {
		const match = allUnits.find(u => u.unitCode === workoutUnit.preferredUnit)
		if (match) {
			const defaultValue =
				typeof workoutUnit.measurementValue === 'number'
					? workoutUnit.measurementValue
					: null
			return {
				...match,
				defaultValue: defaultValue ?? match.defaultValue ?? 0,
			}
		}
	}

	// Case: explicit preferredUnit
	const preferred = allUnits.find(u => u.unitCode === preferredUnit)
	if (preferred) return preferred

	// Case: fallback to imperial if specified
	if (
		measurementSystem === 'imperial' &&
		data.imperialUnits?.length &&
		data.imperialUnits[0]
	) {
		return data.imperialUnits[0]
	}

	// Default: first metric or first available unit
	return data.metricUnits?.[0] ?? allUnits[0]!
}
