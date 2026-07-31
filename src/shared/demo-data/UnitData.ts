export type UnitData = {
	unitCode: UnitCode
	unitShort: {
		unitName: string
		unitNamePlural: string
	}
	unitLong: {
		unitName: string
		unitNamePlural: string
	}
	conversionFactor: number
	step?: number
	autoStep?: number
	minValue: number
	maxValue: number
	defaultValue?: number
}

export const UNIT_DATA = {
	KG: {
		unitCode: 'KG' as const,
		unitShort: { unitName: 'kg', unitNamePlural: 'kg' },
		unitLong: { unitName: 'Kilogram', unitNamePlural: 'Kilograms' },
		conversionFactor: 1,
		step: 0.25,
		autoStep: 1,
		minValue: 0,
		maxValue: 500,
	} as UnitData,
	G: {
		unitCode: 'G' as const,
		unitShort: { unitName: 'g', unitNamePlural: 'g' },
		unitLong: { unitName: 'Gram', unitNamePlural: 'Grams' },
		conversionFactor: 1000,
		step: 250,
		minValue: 0,
		maxValue: 500000,
	} as UnitData,
	LB: {
		unitCode: 'LB' as const,
		unitShort: { unitName: 'lb', unitNamePlural: 'lb' },
		unitLong: { unitName: 'Pound', unitNamePlural: 'Pounds' },
		conversionFactor: 2.20462,
		step: 0.5,
		autoStep: 1,
		minValue: 0,
		maxValue: 1102.31,
	} as UnitData,
	OZ: {
		unitCode: 'OZ' as const,
		unitShort: { unitName: 'oz', unitNamePlural: 'oz' },
		unitLong: { unitName: 'Ounce', unitNamePlural: 'Ounces' },
		conversionFactor: 35.274,
		step: 1,
		minValue: 0,
		maxValue: 17636.96, // ~500 kg
	} as UnitData,
	CM: {
		unitCode: 'CM' as const,
		unitShort: { unitName: 'cm', unitNamePlural: 'cm' },
		unitLong: { unitName: 'Centimeter', unitNamePlural: 'Centimeters' },
		conversionFactor: 1,
		step: 1,
		minValue: 0,
		maxValue: 500,
	} as UnitData,
	IN: {
		unitCode: 'IN' as const,
		unitShort: { unitName: 'in', unitNamePlural: 'in' },
		unitLong: { unitName: 'Inch', unitNamePlural: 'Inches' },
		conversionFactor: 0.393701,
		step: 1,
		minValue: 0,
		maxValue: 196.85, // ~500 cm
	} as UnitData,
	FT: {
		unitCode: 'FT' as const,
		unitShort: { unitName: 'ft', unitNamePlural: 'ft' },
		unitLong: { unitName: 'Foot', unitNamePlural: 'Feet' },
		conversionFactor: 0.0328084,
		step: 0.1,
		autoStep: 1,
		minValue: 0,
		maxValue: 16.4042, // ~500 cm
	} as UnitData,
	METER: {
		unitCode: 'METER' as const,
		unitShort: { unitName: 'm', unitNamePlural: 'm' },
		unitLong: { unitName: 'Meter', unitNamePlural: 'Meters' },
		conversionFactor: 1,
		step: 0.5,
		autoStep: 1,
		minValue: 0,
		maxValue: 100000, // 100 km
	} as UnitData,
	KM: {
		unitCode: 'KM' as const,
		unitShort: { unitName: 'km', unitNamePlural: 'km' },
		unitLong: { unitName: 'Kilometer', unitNamePlural: 'Kilometers' },
		conversionFactor: 0.001,
		step: 0.1,
		autoStep: 1,

		minValue: 0,
		maxValue: 100, // 100 km
	} as UnitData,

	YD: {
		unitCode: 'YD' as const,
		unitShort: { unitName: 'yd', unitNamePlural: 'yd' },
		unitLong: { unitName: 'Yard', unitNamePlural: 'Yards' },
		conversionFactor: 1.09361,
		step: 1,
		minValue: 0,
		maxValue: 109361, // ~100 km
	} as UnitData,
	MI: {
		unitCode: 'MI' as const,
		unitShort: { unitName: 'mi', unitNamePlural: 'mi' },
		unitLong: { unitName: 'Mile', unitNamePlural: 'Miles' },
		conversionFactor: 0.000621371,
		step: 0.1,
		minValue: 0,
		maxValue: 62.1371, // ~100 km
	} as UnitData,

	S: {
		unitCode: 'S' as const,
		unitShort: { unitName: 's', unitNamePlural: 's' },
		unitLong: { unitName: 'Second', unitNamePlural: 'Seconds' },
		conversionFactor: 1,
		step: 1,
		minValue: 0,
		maxValue: 86400, // 24 h
	} as UnitData,
	BPM: {
		unitCode: 'BPM' as const,
		unitShort: { unitName: 'bpm', unitNamePlural: 'bpm' },
		unitLong: {
			unitName: 'Beat per minute',
			unitNamePlural: 'Beats per minute',
		},
		conversionFactor: 1,
		step: 1,
		minValue: 0,
		maxValue: 300,
	} as UnitData,

	BAND: {
		unitCode: 'BAND' as const,
		unitShort: { unitName: 'band', unitNamePlural: 'bands' },
		unitLong: {
			unitName: 'Resistance band',
			unitNamePlural: 'Resistance bands',
		},
		conversionFactor: 1,
		step: 1,
		minValue: 0,
		maxValue: 10,
	} as UnitData,

	KMH: {
		unitCode: 'KMH' as const,
		unitShort: { unitName: 'km/h', unitNamePlural: 'km/h' },
		unitLong: {
			unitName: 'Kilometer per hour',
			unitNamePlural: 'Kilometers per hour',
		},
		conversionFactor: 1,
		step: 0.1,
		autoStep: 1,

		minValue: 0,
		maxValue: 100,
	} as UnitData,
	MPS: {
		unitCode: 'MPS' as const,
		unitShort: { unitName: 'm/s', unitNamePlural: 'm/s' },
		unitLong: {
			unitName: 'Meter per second',
			unitNamePlural: 'Meters per second',
		},
		conversionFactor: 3.6,
		step: 1,
		minValue: 0,
		maxValue: 100,
	} as UnitData,
	MPH: {
		unitCode: 'MPH' as const,
		unitShort: { unitName: 'mph', unitNamePlural: 'mph' },
		unitLong: {
			unitName: 'Mile per hour',
			unitNamePlural: 'Miles per hour',
		},
		conversionFactor: 0.621371,
		step: 0.1,
		autoStep: 1,

		minValue: 0,
		maxValue: 62.1371,
	} as UnitData,
	FPS: {
		unitCode: 'FPS' as const,
		unitShort: { unitName: 'ft/s', unitNamePlural: 'ft/s' },
		unitLong: {
			unitName: 'Foot per second',
			unitNamePlural: 'Feet per second',
		},
		conversionFactor: 0.911344,
		step: 0.1,
		minValue: 0,
		maxValue: 91.1344,
	} as UnitData,
	STEP: {
		unitCode: 'STEP' as const,
		unitShort: { unitName: 'step', unitNamePlural: 'steps' },
		unitLong: { unitName: 'Step', unitNamePlural: 'Steps' },
		conversionFactor: 1,
		step: 1,
		minValue: 0,
		maxValue: 100000,
	} as UnitData,
	PERCENT: {
		unitCode: 'PERCENT' as const,
		unitShort: { unitName: '%', unitNamePlural: '%' },
		unitLong: { unitName: 'Percent', unitNamePlural: 'Percent' },
		conversionFactor: 1,
		step: 0.5,
		autoStep: 1,

		minValue: -3,
		maxValue: 40,
	} as UnitData,
	WATT: {
		unitCode: 'WATT' as const,
		unitShort: { unitName: 'W', unitNamePlural: 'W' },
		unitLong: { unitName: 'Watt', unitNamePlural: 'Watts' },
		conversionFactor: 1,
		step: 1,
		minValue: 0,
		maxValue: 5000,
	} as UnitData,
	KW: {
		unitCode: 'KW' as const,
		unitShort: { unitName: 'kW', unitNamePlural: 'kW' },
		unitLong: { unitName: 'Kilowatt', unitNamePlural: 'Kilowatts' },
		conversionFactor: 0.001,
		step: 0.001,
		autoStep: 1,

		minValue: 0,
		maxValue: 5,
	} as UnitData,

	LAP: {
		unitCode: 'LAP' as const,
		unitShort: { unitName: 'Lap', unitNamePlural: 'Laps' },
		unitLong: { unitName: 'Lap', unitNamePlural: 'Laps' },
		conversionFactor: 1,
		step: 1,
		minValue: 0,
		maxValue: 999,
	} as UnitData,
	REP: {
		unitCode: 'REP' as const,
		unitShort: { unitName: 'Reps', unitNamePlural: 'Reps' },
		unitLong: { unitName: 'Repetition', unitNamePlural: 'Repetitions' },
		conversionFactor: 1,
		step: 1,
		minValue: 0,
		maxValue: 999,
	} as UnitData,
	RPE: {
		unitCode: 'RPE' as const,
		unitShort: { unitName: 'RPE', unitNamePlural: 'RPE' },
		unitLong: {
			unitName: 'Rate of Perceived Exhaustion',
			unitNamePlural: 'Rate of Perceived Exhaustion',
		},
		conversionFactor: 1,
		step: 1,
		minValue: 1,
		maxValue: 10,
	} as UnitData,
}

export type UnitCode = keyof typeof UNIT_DATA
