import type { WorkoutData } from '@justgains/shared/src/api'
import { workoutDataTypeEnum } from '@justgains/shared/src/api/types/WorkoutDataType'

export const WORKOUT_DATA_TYPES = {
	ExerciseVideo: {
		code: workoutDataTypeEnum.ExerciseVideo,
		label: 'Exercise Video',
		prefix: '_VIDEO_',
		maxSlots: 5,
	},
	Callout: {
		code: workoutDataTypeEnum.Callout,
		label: 'Callout',
		prefix: '_CALLOUT_',
		maxSlots: 10,
	},
	ExerciseList: {
		code: workoutDataTypeEnum.ExerciseList,
		label: 'Exercise List',
		prefix: '_EXERCISE_LIST_',
		maxSlots: 20,
	},
	PendingSync: {
		code: workoutDataTypeEnum.PendingSync,
		label: 'Pending Sync',
		prefix: '_PENDING_SYNC_',
		maxSlots: 1,
	},
} as const

export type WorkoutDataTypeCode = keyof typeof WORKOUT_DATA_TYPES

export type VideoAdditionalData = {
	exerciseLink: string
	caption?: string
	alertType?: string
}

export type CalloutAlertType = 'info' | 'warning' | 'success' | 'tip'

export type CalloutAdditionalData = {
	message: string
	alertType?: CalloutAlertType
}

export type ExerciseListCardOption = {
	exerciseCode: string
	exerciseName: string
	exerciseThumbnailUrl?: string | null
	publishStatusCode?: string | null
	creatorProfileId?: string | null
	exerciseMeasurements?: string[] | null
	exerciseTags?: string[] | null
	isWeightPerSide?: boolean | null
}

export type ExerciseListCardAdditionalData = {
	exerciseListId?: string | null
	exerciseListSlotCode?: string | null
	exerciseListName: string
	isImportedExerciseList?: boolean | null
	exerciseListOptions: ExerciseListCardOption[]
	selectedExerciseCode?: string | null
	selectedExerciseName?: string | null
	selectedExerciseThumbnailUrl?: string | null
}

export function isSpecialWorkoutData(workoutData: WorkoutData): boolean {
	return (
		workoutData.workoutDataType != null ||
		(workoutData.exerciseCode?.startsWith('_') ?? false)
	)
}

export function isExerciseVideo(workoutData: WorkoutData): boolean {
	return workoutData.workoutDataType === workoutDataTypeEnum.ExerciseVideo
}

export function isCallout(workoutData: WorkoutData): boolean {
	return workoutData.workoutDataType === workoutDataTypeEnum.Callout
}

export function isExerciseList(workoutData: WorkoutData): boolean {
	return (
		workoutData.workoutDataType === workoutDataTypeEnum.ExerciseList ||
		workoutData.exerciseCode?.startsWith(WORKOUT_DATA_TYPES.ExerciseList.prefix) ===
		true
	)
}

export function isPendingSync(workoutData: WorkoutData): boolean {
	return workoutData.workoutDataType === workoutDataTypeEnum.PendingSync
}

export function getExerciseListAdditionalData(
	workoutData: WorkoutData,
): ExerciseListCardAdditionalData | null {
	if (!isExerciseList(workoutData)) {
		return null
	}

	return parseAdditionalData<ExerciseListCardAdditionalData>(workoutData)
}

export function getExerciseListSelectedExerciseCode(
	workoutData: WorkoutData,
): string | null {
	return getExerciseListAdditionalData(workoutData)?.selectedExerciseCode ?? null
}

export function getResolvedWorkoutExerciseCode(
	workoutData: WorkoutData,
): string | null {
	if (isExerciseList(workoutData)) {
		return getExerciseListSelectedExerciseCode(workoutData)
	}

	return workoutData.exerciseCode ?? null
}

export function getExerciseListOptionCodes(workoutData: WorkoutData): string[] {
	return (
		getExerciseListAdditionalData(workoutData)?.exerciseListOptions
			?.map(option => option.exerciseCode)
			.filter(Boolean) ?? []
	)
}

export function isCountableWorkoutExercise(workoutData: WorkoutData): boolean {
	return !(
		isExerciseVideo(workoutData) ||
		isCallout(workoutData) ||
		isPendingSync(workoutData) ||
		workoutData.exerciseCode?.startsWith(WORKOUT_DATA_TYPES.ExerciseVideo.prefix) ||
		workoutData.exerciseCode?.startsWith(WORKOUT_DATA_TYPES.Callout.prefix) ||
		workoutData.exerciseCode?.startsWith(WORKOUT_DATA_TYPES.PendingSync.prefix)
	)
}

export function getCountableWorkoutExercises(
	workoutData: WorkoutData[] | null | undefined,
): WorkoutData[] {
	return (workoutData ?? []).filter(isCountableWorkoutExercise)
}

export function getNetExerciseCount(
	workoutData: WorkoutData[] | null | undefined,
): number {
	return getCountableWorkoutExercises(workoutData).length
}

export function parseAdditionalData<T>(workoutData: WorkoutData): T | null {
	if (!workoutData.additionalData) return null
	return workoutData.additionalData as T
}

export function getNextPlaceholderCode(
	prefix: string,
	existingWorkoutData: WorkoutData[],
): string {
	const usedCodes = new Set(
		existingWorkoutData
			.filter(wd => wd.exerciseCode?.startsWith(prefix))
			.map(wd => wd.exerciseCode),
	)
	for (let i = 1; i <= 99; i++) {
		const code = `${prefix}${String(i).padStart(2, '0')}`
		if (!usedCodes.has(code)) return code
	}
	throw new Error(`No available ${prefix} slots`)
}
