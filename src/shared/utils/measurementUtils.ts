import {
	MEASUREMENT_DATA,
	type MeasurementCode,
} from '../demo-data/MeasurementData'
import type { Measurement } from '../api'
import convert, { type Unit } from 'convert'

export type MeasurementSystem = 'metric' | 'imperial'

export type MeasurementValueLike = number | string | null | undefined

export const KG_TO_LB = 2.20462
export const LB_TO_KG = 1 / KG_TO_LB

export const isNumericMeasurementValue = (
	value: MeasurementValueLike,
): value is number => typeof value === 'number' && Number.isFinite(value)

export const getNumericMeasurementValue = (
	value: MeasurementValueLike,
	fallback: number | null = null,
): number | null =>
	isNumericMeasurementValue(value) ? value : fallback

/**
 * Wrapper around `convert` that returns the original value on failure
 * (e.g. when unit names don't match the library's known units).
 */
export const safeConvert = (
	value: number,
	from: string,
	to: string,
): number => {
	try {
		return convert(value, from as Unit).to(to as Unit)
	} catch {
		return value
	}
}

type FormatNumberOptions = {
	minimumFractionDigits?: number
	maximumFractionDigits?: number
	useGrouping?: boolean
}

type FormatBodyWeightValueOptions = FormatNumberOptions & {
	fallback?: string
}

type FormatBodyWeightOptions = FormatBodyWeightValueOptions & {
	unitFormat?: 'short' | 'display'
}

type FormatBodyWeightDeltaOptions = FormatNumberOptions & {
	fallback?: string
	includeUnit?: boolean
	showSign?: boolean
	absolute?: boolean
	unitFormat?: 'short' | 'display'
}

type FormatHeightOptions = {
	fallback?: string
	style?: 'feet-and-inches' | 'inches'
}

const roundToDecimalPlaces = (value: number, decimalPlaces: number): number =>
	Math.round(value * 10 ** decimalPlaces) / 10 ** decimalPlaces

const formatNumber = (
	value: number,
	{
		minimumFractionDigits = 0,
		maximumFractionDigits = 1,
		useGrouping = false,
	}: FormatNumberOptions = {},
): string => {
	const rounded = roundToDecimalPlaces(value, maximumFractionDigits)

	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits,
		maximumFractionDigits,
		useGrouping,
	}).format(rounded)
}

export const getBodyWeightUnitLabel = (
	measurementSystem: MeasurementSystem = 'metric',
	format: 'short' | 'display' = 'short',
): string => {
	if (measurementSystem === 'imperial') {
		return 'lbs'
	}

	return 'kg'
}

/**
 * Food-energy unit label. US convention writes kilocalories as "cal"
 * (Calories), so imperial users see "cal"; metric users see "kcal".
 * The underlying values are identical — this only changes the label.
 */
export const getEnergyUnitLabel = (
	measurementSystem: MeasurementSystem = 'metric',
): 'cal' | 'kcal' => (measurementSystem === 'imperial' ? 'cal' : 'kcal')

export const convertBodyWeightFromKg = (
	valueInKg: number,
	measurementSystem: MeasurementSystem = 'metric',
): number =>
	measurementSystem === 'imperial'
		? safeConvert(valueInKg, 'kg', 'lb')
		: valueInKg

export const convertBodyWeightToKg = (
	value: number,
	measurementSystem: MeasurementSystem = 'metric',
): number =>
	measurementSystem === 'imperial' ? safeConvert(value, 'lb', 'kg') : value

export const formatBodyWeightValue = (
	valueInKg: number | null | undefined,
	measurementSystem: MeasurementSystem = 'metric',
	{
		fallback = '-',
		minimumFractionDigits = 0,
		maximumFractionDigits = 1,
		useGrouping = false,
	}: FormatBodyWeightValueOptions = {},
): string => {
	if (valueInKg == null || !Number.isFinite(valueInKg)) return fallback

	return formatNumber(convertBodyWeightFromKg(valueInKg, measurementSystem), {
		minimumFractionDigits,
		maximumFractionDigits,
		useGrouping,
	})
}

export const formatBodyWeight = (
	valueInKg: number | null | undefined,
	measurementSystem: MeasurementSystem = 'metric',
	{
		fallback = '-',
		unitFormat = 'short',
		minimumFractionDigits = 0,
		maximumFractionDigits = 1,
		useGrouping = false,
	}: FormatBodyWeightOptions = {},
): string => {
	if (valueInKg == null || !Number.isFinite(valueInKg)) return fallback

	const formattedValue = formatBodyWeightValue(valueInKg, measurementSystem, {
		fallback,
		minimumFractionDigits,
		maximumFractionDigits,
		useGrouping,
	})

	return `${formattedValue} ${getBodyWeightUnitLabel(
		measurementSystem,
		unitFormat,
	)}`
}

export const formatBodyWeightDelta = (
	deltaKg: number | null | undefined,
	measurementSystem: MeasurementSystem = 'metric',
	{
		fallback = '-',
		includeUnit = true,
		showSign = true,
		absolute = false,
		unitFormat = 'short',
		minimumFractionDigits = 1,
		maximumFractionDigits = 1,
		useGrouping = false,
	}: FormatBodyWeightDeltaOptions = {},
): string => {
	if (deltaKg == null || !Number.isFinite(deltaKg)) return fallback

	const convertedValue = convertBodyWeightFromKg(deltaKg, measurementSystem)
	const normalizedValue = absolute ? Math.abs(convertedValue) : convertedValue
	const formattedValue = formatNumber(normalizedValue, {
		minimumFractionDigits,
		maximumFractionDigits,
		useGrouping,
	})

	const prefix = showSign
		? absolute
			? convertedValue > 0
				? '+'
				: convertedValue < 0
					? '-'
					: ''
			: convertedValue > 0
				? '+'
				: ''
		: ''

	const valueWithSign = `${prefix}${formattedValue}`
	if (!includeUnit) return valueWithSign

	return `${valueWithSign} ${getBodyWeightUnitLabel(
		measurementSystem,
		unitFormat,
	)}`
}

/**
 * True when the user's fitness goals include gaining weight — flips the
 * good/bad colouring of weight deltas in the measurement trackers.
 */
export const hasWeightGainGoal = (
	fitnessGoals?: string[] | null,
): boolean =>
	(fitnessGoals ?? []).some(goal => goal?.toLowerCase() === 'gain weight')

export const parseBodyWeightInput = ({
	input,
	measurementSystem = 'metric',
}: {
	input: string
	measurementSystem?: MeasurementSystem
}): number | null => {
	const parsed = Number.parseFloat(input.trim())
	if (!Number.isFinite(parsed)) return null

	return convertBodyWeightToKg(parsed, measurementSystem)
}

export const formatHeight = (
	heightCm: number | null | undefined,
	measurementSystem: MeasurementSystem = 'metric',
	{ fallback = '-', style = 'feet-and-inches' }: FormatHeightOptions = {},
): string => {
	if (heightCm == null || !Number.isFinite(heightCm)) return fallback

	if (measurementSystem === 'metric') {
		return `${formatNumber(heightCm, {
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		})} cm`
	}

	const totalInches = Math.round(safeConvert(heightCm, 'cm', 'in'))
	if (style === 'inches') {
		return `${totalInches} in`
	}

	const feet = Math.floor(totalInches / 12)
	const inches = totalInches % 12

	if (feet <= 0) {
		return `${totalInches} in`
	}

	return `${feet}' ${inches}"`
}

/**
 * Bidirectional lookup table mapping common metric gym dumbbell weights (kg)
 * to their nearest standard US dumbbell weight (lb).
 *
 * Metric sets use 2.5 kg increments; US commercial gyms use 5 lb increments.
 * Pairs are chosen by nearest 5 lb to the exact conversion value.
 * Values not in this table fall back to raw unit conversion.
 */
export const GYM_WEIGHT_PAIRS: [number, number][] = [
	[1, 2],
	[1.5, 3],
	[2, 4],
	[2.5, 5],
	[5, 10],
	[7.5, 15],
	[10, 20],
	[12.5, 30],
	[15, 35],
	[17.5, 40],
	[20, 45],
	[22.5, 50],
	[25, 55],
	[27.5, 60],
	[30, 65],
	[32.5, 70],
	[35, 75],
	[37.5, 85],
	[40, 90],
	[42.5, 95],
	[45, 100],
	[47.5, 105],
	[50, 110],
]

const KG_TO_LB_GYM_MAP = new Map<number, number>(GYM_WEIGHT_PAIRS)
const LB_TO_KG_GYM_MAP = new Map<number, number>(
	GYM_WEIGHT_PAIRS.map(([kg, lb]) => [lb, kg]),
)

/**
 * Convert a stored kg weight to the nearest standard US gym equipment lb value.
 * Uses an explicit lookup table of common metric↔imperial dumbbell pairs.
 * Falls back to raw conversion for values not in the table.
 */
export const convertKgToGymLbs = (kg: number): number =>
	KG_TO_LB_GYM_MAP.get(kg) ?? convert(kg, 'kg').to('lb')

/**
 * Convert a US lb gym weight input back to a clean kg value for storage.
 * Uses the same lookup table so that e.g. 45 lb stores as exactly 20 kg.
 * Falls back to raw conversion for values not in the table.
 */
export const convertGymLbsToKg = (lb: number): number =>
	LB_TO_KG_GYM_MAP.get(lb) ?? convert(lb, 'lb').to('kg')

/**
 * Measurement codes that represent discrete gym equipment weights
 * (dumbbells, barbells, plates). These use the gym weight lookup table
 * when converting to imperial instead of raw math.
 */
const GYM_WEIGHT_CODES = new Set([
	'WEIGHT',
	'BODYWEIGHT_MINUS_ASSISTANCE',
	'BODYWEIGHT_PLUS_WEIGHT',
])

const DURATION_MEASUREMENT_CODES = new Set([
	'DURATION',
	'HOLD_DURATION',
	'REST',
])


/**
 * Convert a weight/volume value from kg to the user's preferred measurement system.
 * API returns values in kg, so this converts to lbs for imperial users.
 *
 * @param valueInKg - The value in kilograms (from API)
 * @param measurementSystem - The user's preferred measurement system
 * @returns The converted value (rounded to nearest whole number for imperial)
 */
export const convertVolumeFromKg = (
	valueInKg: number,
	measurementSystem: MeasurementSystem = 'metric',
): number => {
	if (measurementSystem === 'imperial') {
		return Math.round(safeConvert(valueInKg, 'kg', 'lb'))
	}

	return valueInKg
}

/**
 * Get the volume unit label based on measurement system
 *
 * @param measurementSystem - The user's preferred measurement system
 * @param format - The label format ('short' for 'kg'/'lbs', 'full' for 'Vol (kg)'/'Vol (lbs)')
 * @returns The appropriate unit label
 */
export const getVolumeLabel = (
	measurementSystem: MeasurementSystem = 'metric',
	format: 'short' | 'full' = 'full',
): string => {
	const unit = measurementSystem === 'metric' ? 'kg' : 'lbs'

	switch (format) {
		case 'short':
			return `Vol (${unit})`
		case 'full':
			return `Volume (${unit})`
		default:
			return unit
	}
}

/**
 * Get the appropriate unit data for a measurement code based on measurement system
 */
export const getUnitForMeasurement = (
	measurementCode: string,
	measurementSystem: MeasurementSystem,
) => {
	const data = MEASUREMENT_DATA[measurementCode as MeasurementCode]
	if (!data) return null

	if (measurementSystem === 'imperial' && data.imperialUnits?.[0]) {
		return data.imperialUnits[0]
	}

	return data.metricUnits[0]
}

/**
 * Get the display name for a measurement code
 */
export const getMeasurementDisplayName = (measurementCode: string): string => {
	const data = MEASUREMENT_DATA[measurementCode as MeasurementCode]

	return data?.measurementDisplayName || measurementCode
}

/**
 * Format duration in compressed time notation (e.g. 45s, 10:00, 1:05:30)
 */
export const formatDuration = (seconds: number | undefined | null): string => {
	if (seconds === undefined || seconds === null) return '-'

	const totalSeconds = Math.max(0, Math.round(seconds))

	if (totalSeconds < 60) {
		return `${totalSeconds}s`
	}

	const hours = Math.floor(totalSeconds / 3600)
	const mins = Math.floor((totalSeconds % 3600) / 60)
	const secs = totalSeconds % 60

	if (hours > 0) {
		return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
	}

	return `${mins}:${secs.toString().padStart(2, '0')}`
}

const METERS_PER_MILE = 1609.344
const FEET_PER_METER = 3.28084

/**
 * Format a route/activity distance (stored in meters) for the user's system:
 * kilometres (metric) or miles (imperial). E.g. 8240 → "8.24 km" / "5.12 mi".
 */
export const formatDistanceMeters = (
	meters: number | null | undefined,
	measurementSystem: MeasurementSystem = 'metric',
	digits = 2,
): string => {
	if (meters == null || !Number.isFinite(meters)) return '-'
	return measurementSystem === 'imperial'
		? `${(meters / METERS_PER_MILE).toFixed(digits)} mi`
		: `${(meters / 1000).toFixed(digits)} km`
}

/**
 * Format an elevation/altitude (stored in meters) for the user's system:
 * metres (metric) or feet (imperial). E.g. 320 → "320 m" / "1050 ft".
 */
export const formatElevationMeters = (
	meters: number | null | undefined,
	measurementSystem: MeasurementSystem = 'metric',
): string => {
	if (meters == null || !Number.isFinite(meters)) return '-'
	return measurementSystem === 'imperial'
		? `${Math.round(meters * FEET_PER_METER)} ft`
		: `${Math.round(meters)} m`
}

export interface FormattedMeasurement {
	code: string
	value: string
	unit: string
	displayName: string
}

/**
 * Format a measurement value with proper unit conversion based on measurement system
 * Returns a structured object with code, value, unit, and displayName
 */
export const formatMeasurement = (
	measurement: Measurement,
	measurementSystem: MeasurementSystem,
): FormattedMeasurement | null => {
	const rawValue = measurement.measurementValue
	if (rawValue == null || !measurement.measurementCode) return null

	const measurementData = MEASUREMENT_DATA[measurement.measurementCode]
	if (!measurementData) return null

	const systemUnits =
		measurementSystem === 'imperial' && measurementData.imperialUnits
			? measurementData.imperialUnits
			: measurementData.metricUnits

	const displayUnit = systemUnits[0]
	if (!displayUnit) return null

	if (DURATION_MEASUREMENT_CODES.has(measurement.measurementCode)) {
		return {
			code: measurement.measurementCode,
			value:
				typeof rawValue === 'number' ? formatDuration(rawValue) : String(rawValue),
			unit: '',
			displayName: measurementData.measurementDisplayName,
		}
	}

	if (typeof rawValue === 'string') {
		return {
			code: measurement.measurementCode,
			value: rawValue,
			unit: displayUnit.unitShort.unitName || '',
			displayName: measurementData.measurementDisplayName,
		}
	}

	let displayValue = rawValue
	const returnUnit = measurementData.metricUnits[0]

	if (returnUnit && displayUnit.unitCode !== returnUnit.unitCode) {
		if (
			displayUnit.unitCode === 'LB' &&
			GYM_WEIGHT_CODES.has(measurement.measurementCode)
		) {
			displayValue = convertKgToGymLbs(rawValue)
		} else {
			try {
				const fromUnit = returnUnit.unitShort.unitName as Unit
				const toUnit = displayUnit.unitShort.unitName as Unit
				displayValue = convert(rawValue, fromUnit).to(toUnit)
			} catch {
				// If conversion fails, use original value
			}
		}
	}

	let formattedValue: string
	if (
		displayUnit.unitCode === 'LB' &&
		GYM_WEIGHT_CODES.has(measurement.measurementCode)
	) {
		formattedValue = Math.round(displayValue).toString()
	} else if (Number.isInteger(displayValue)) {
		formattedValue = displayValue.toString()
	} else if (displayUnit.step && displayUnit.step < 1) {
		const decimalPlaces = displayUnit.step.toString().split('.')[1]?.length || 0
		formattedValue = displayValue.toFixed(decimalPlaces)
	} else {
		formattedValue = Math.round(displayValue).toString()
	}

	return {
		code: measurement.measurementCode,
		value: formattedValue,
		unit: displayUnit.unitShort.unitName || '',
		displayName: measurementData.measurementDisplayName,
	}
}

/**
 * Format a measurement value (number) with proper unit conversion
 * Returns a formatted string like "100 kg" or "220 lb"
 */
export const formatMeasurementValue = (
	value: number | string | undefined | null,
	measurementCode: string,
	measurementSystem: MeasurementSystem,
	roundToWhole = false,
): string => {
	if (value === undefined || value === null) return '-'

	if (typeof value === 'string') {
		const targetUnit = getUnitForMeasurement(measurementCode, measurementSystem)
		return `${value} ${targetUnit?.unitShort.unitName || ''}`.trim()
	}

	// Handle duration types separately
	if (DURATION_MEASUREMENT_CODES.has(measurementCode)) {
		return formatDuration(value)
	}

	const data = MEASUREMENT_DATA[measurementCode as MeasurementCode]
	if (!data) return `${value}`

	// Get the source unit (always metric - kg, m, s, etc.)
	const sourceUnit = data.metricUnits[0]
	// Get the target unit based on measurement system
	const targetUnit = getUnitForMeasurement(measurementCode, measurementSystem)

	if (!sourceUnit || !targetUnit) return `${value}`

	// Convert value if needed
	let displayValue = value
	if (sourceUnit.unitCode !== targetUnit.unitCode) {
		if (
			targetUnit.unitCode === 'LB' &&
			GYM_WEIGHT_CODES.has(measurementCode)
		) {
			displayValue = convertKgToGymLbs(value)
		} else {
			try {
				const fromUnit = sourceUnit.unitShort.unitName as Unit
				const toUnit = targetUnit.unitShort.unitName as Unit
				displayValue = convert(value, fromUnit).to(toUnit)
			} catch {
				// If conversion fails, use original value
				displayValue = value
			}
		}
	}

	// Gym equipment weights are always whole lb values (both table hits and fallbacks)
	if (targetUnit.unitCode === 'LB' && GYM_WEIGHT_CODES.has(measurementCode)) {
		displayValue = Math.round(displayValue)
	} else if (!roundToWhole && targetUnit.step && targetUnit.step < 1) {
		const decimalPlaces = targetUnit.step.toString().split('.')[1]?.length || 0
		displayValue =
			Math.round(displayValue * 10 ** decimalPlaces) / 10 ** decimalPlaces
	} else {
		displayValue = Math.round(displayValue)
	}

	return `${displayValue} ${targetUnit.unitShort.unitName}`
}
