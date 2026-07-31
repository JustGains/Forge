export type ExerciseTypeData = {
	exerciseTypeCode: string
	exerciseTypeName: string
	exerciseTypeExerciseMeasurements: string[]
}

export const EXERCISE_TYPES = [
	{
		exerciseTypeCode: 'ASSISTED_BODYWEIGHT',
		exerciseTypeName: 'Assisted Bodyweight',
		exerciseTypeExerciseMeasurements: ['BODYWEIGHT_MINUS_ASSISTANCE', 'REPS'],
	},
	{
		exerciseTypeCode: 'BODYWEIGHT_REPS',
		exerciseTypeName: 'Bodyweight & Reps',
		exerciseTypeExerciseMeasurements: ['REPS'],
	},
	{
		exerciseTypeCode: 'CYCLING',
		exerciseTypeName: 'Wattage Cycling (Peloton)',
		exerciseTypeExerciseMeasurements: ['WATTAGE', 'DURATION', 'DISTANCE'],
	},
	{
		exerciseTypeCode: 'DISTANCE_DURATION',
		exerciseTypeName: 'Distance & Duration',
		exerciseTypeExerciseMeasurements: ['DISTANCE', 'DURATION'],
	},
	{
		exerciseTypeCode: 'DURATION',
		exerciseTypeName: 'Duration',
		exerciseTypeExerciseMeasurements: ['DURATION'],
	},
	{
		exerciseTypeCode: 'EXERCISE_BANDS',
		exerciseTypeName: 'Exercise Bands',
		exerciseTypeExerciseMeasurements: ['RESISTANCE_BAND', 'REPS'],
	},
	{
		exerciseTypeCode: 'JUMP_TRAINING',
		exerciseTypeName: 'Jump Training',
		exerciseTypeExerciseMeasurements: ['JUMP_HEIGHT', 'REPS'],
	},
	{
		exerciseTypeCode: 'REPS_ONLY',
		exerciseTypeName: 'Reps Only',
		exerciseTypeExerciseMeasurements: ['REPS'],
	},
	{
		exerciseTypeCode: 'ROWING',
		exerciseTypeName: 'Rowing',
		exerciseTypeExerciseMeasurements: ['WATTAGE', 'DISTANCE', 'DURATION'],
	},
	{
		exerciseTypeCode: 'STATIC_STRETCHES',
		exerciseTypeName: 'Static Stretching (Reps & Hold Time)',
		exerciseTypeExerciseMeasurements: ['DURATION', 'REPS'],
	},
	{
		exerciseTypeCode: 'STEPS',
		exerciseTypeName: 'Steps',
		exerciseTypeExerciseMeasurements: ['STEPS', 'DURATION'],
	},
	{
		exerciseTypeCode: 'ASSISTED_RESISTANCE_BAND',
		exerciseTypeName: 'Assisted Resistance Band',
		exerciseTypeExerciseMeasurements: ['ASSISTED_RESISTANCE_BAND', 'REPS'],
	},
	{
		exerciseTypeCode: 'SWIMMING',
		exerciseTypeName: 'Swimming',
		exerciseTypeExerciseMeasurements: ['LAPS', 'DISTANCE'],
	},
	{
		exerciseTypeCode: 'TREADMILL',
		exerciseTypeName: 'Treadmill',
		exerciseTypeExerciseMeasurements: [
			'TREADMILL_INCLINE_PERCENTAGE',
			'SPEED',
			'DURATION',
			'DISTANCE',
		],
	},
	{
		exerciseTypeCode: 'VIDEO_ONLY',
		exerciseTypeName: 'Video Only',
		exerciseTypeExerciseMeasurements: ['DURATION'],
	},
	{
		exerciseTypeCode: 'WALKING',
		exerciseTypeName: 'Walking',
		exerciseTypeExerciseMeasurements: ['DURATION', 'DISTANCE', 'STEPS'],
	},
	{
		exerciseTypeCode: 'WEIGHTED_BODYWEIGHT',
		exerciseTypeName: 'Weighted Bodyweight',
		exerciseTypeExerciseMeasurements: ['REPS', 'BODYWEIGHT_PLUS_WEIGHT'],
	},
	{
		exerciseTypeCode: 'WEIGHT_DISTANCE',
		exerciseTypeName: 'Weighted Distance',
		exerciseTypeExerciseMeasurements: ['DISTANCE', 'WEIGHT'],
	},
	{
		exerciseTypeCode: 'WEIGHT_REPS',
		exerciseTypeName: 'Weight & Reps',
		exerciseTypeExerciseMeasurements: ['REPS', 'WEIGHT'],
	},
	{
		exerciseTypeCode: 'WEIGHT_REPS_TEMPO',
		exerciseTypeName: 'Weight / Reps / Tempo',
		exerciseTypeExerciseMeasurements: ['TEMPO', 'WEIGHT', 'REPS'],
	},
	{
		exerciseTypeCode: 'YOGA',
		exerciseTypeName: 'Yoga Pose',
		exerciseTypeExerciseMeasurements: ['HOLD_DURATION', 'REPS'],
	},
] as ExerciseTypeData[]

/**
 * Follow-along video exercises: DURATION is the only measurement, workout logs
 * cannot change the logged value (it mirrors the video length), templates can
 * only change the placeholder, and these exercises are hidden from
 * Flexicon/search results.
 */
export const VIDEO_ONLY_EXERCISE_TYPE_CODE = 'VIDEO_ONLY'

export const isVideoOnlyExerciseType = (
	exerciseTypeCode?: string | null,
): boolean => exerciseTypeCode === VIDEO_ONLY_EXERCISE_TYPE_CODE

/**
 * Mirrors the server's ExerciseTypeData.SearchHiddenExerciseTypeCodes: types
 * excluded from library search/browse for regular users. Admins see them in
 * exercise lists, tagged as admin-only.
 */
export const SEARCH_HIDDEN_EXERCISE_TYPE_CODES = [
	VIDEO_ONLY_EXERCISE_TYPE_CODE,
]

export const isSearchHiddenExerciseType = (
	exerciseTypeCode?: string | null,
): boolean =>
	!!exerciseTypeCode &&
	SEARCH_HIDDEN_EXERCISE_TYPE_CODES.includes(exerciseTypeCode)
