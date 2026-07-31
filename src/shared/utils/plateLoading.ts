/**
 * Plate-loading classification for the weight-entry plate calculator.
 *
 * Three things decide which plate UI an exercise gets:
 *   - `isPlateLoaded`  → exercise carries the `PLATE_LOADED` tag. Gates the
 *                        plate calculator on at all. Non-plate-loaded weight
 *                        fields get the plain number pad.
 *   - `isSingleStack`  → the weight loads at a SINGLE point (no two-sided
 *                        mirroring): the `WEIGHT_PER_SIDE` tag OR any of the
 *                        single-point-loader machines/attachments below.
 *                        Plate-loaded + single-stack → single-stack view.
 *                        Plate-loaded + not single-stack → barbell view.
 *
 * The API serializes `isPlateLoaded` / `isSingleStack` (only when true). When
 * those are absent — older cached payloads that predate the fields — we derive
 * the same answer from the tags + equipment that every payload already carries,
 * so the feature works offline/immediately without a forced cache rebuild.
 *
 * Keep `SINGLE_STACK_EQUIPMENT_CODES` in sync with the server set in
 * `JustGains-API/.../Entities/Dtos/Exercises/ExerciseDto.cs`.
 */

export type PlateLoadingMode = 'none' | 'barbell' | 'single'

export const PLATE_LOADED_TAG = 'PLATE_LOADED'
export const WEIGHT_PER_SIDE_TAG = 'WEIGHT_PER_SIDE'

/**
 * Plate-loaded equipment that loads at a single point (no balanced two-sided
 * load), so it shows the single-stack plate view instead of the barbell view.
 */
export const SINGLE_STACK_EQUIPMENT_CODES: ReadonlySet<string> = new Set([
	'LANDMINE_ATTACHMENT',
	'PLATE_LOADED_T_BAR_ROW_MACHINE',
	'PLATE_LOADED_ROW_MACHINE',
	'PLATE_LOADED_HIGH_ROW_MACHINE',
	'PLATE_LOADED_INCLINE_CHEST_PRESS_MACHINE',
	'SEATED_CALF_RAISE_MACHINE',
	'SEATED_CALF_PRESS_MACHINE',
	'STANDING_CALF_RAISE_MACHINE',
	'DONKEY_CALF_RAISE_MACHINE',
	'PLATE_LOADED_CALF_RAISE_MACHINE',
	'HACK_SQUAT_MACHINE',
	'LEG_PRESS_MACHINE',
])

const FIXED_WEIGHT_IMPLEMENT_CODES: ReadonlySet<string> = new Set([
	'DUMBBELLS',
	'KETTLEBELLS',
])

const PLATE_CAPABLE_EQUIPMENT_CODES: ReadonlySet<string> = new Set([
	'BARBELL',
	'EZ_CURL_BAR',
	'HAMMER_CURL_BAR',
	'SAFETY_SQUAT_BAR',
	'SMITH_MACHINE',
	'TRAP_BAR',
	'WEIGHT_PLATES',
	'LANDMINE_ATTACHMENT',
	...SINGLE_STACK_EQUIPMENT_CODES,
])

/**
 * Minimal structural shape — intentionally NOT tied to the generated
 * `ExerciseListItem`/`Exercise` types so this compiles before `buildsdk` adds
 * the new boolean fields, and accepts any object that carries the tags +
 * equipment (the local cached exercise record, a DTO, etc.).
 */
export interface PlateLoadingExercise {
	isPlateLoaded?: boolean | null
	isSingleStack?: boolean | null
	exerciseTags?: (string | null | undefined)[] | null
	exerciseEquipment?: {
		required?: (string | null | undefined)[][] | null
		optional?: (string | null | undefined)[][] | null
	} | null
}

function hasTag(exercise: PlateLoadingExercise, tagCode: string): boolean {
	return Boolean(
		exercise.exerciseTags?.some(
			(tag) => (tag ?? '').trim().toUpperCase() === tagCode,
		),
	)
}

function equipmentCodes(exercise: PlateLoadingExercise): string[] {
	const eq = exercise.exerciseEquipment
	if (!eq) return []
	return [...(eq.required ?? []), ...(eq.optional ?? [])]
		.flat()
		.map((code) => (code ?? '').trim().toUpperCase())
		.filter(Boolean)
}

function usesSingleStackEquipment(exercise: PlateLoadingExercise): boolean {
	return equipmentCodes(exercise).some((code) =>
		SINGLE_STACK_EQUIPMENT_CODES.has(code),
	)
}

function usesFixedWeightImplementWithoutPlateHardware(exercise: PlateLoadingExercise): boolean {
	const codes = equipmentCodes(exercise)
	return codes.some((code) => FIXED_WEIGHT_IMPLEMENT_CODES.has(code))
		&& !codes.some((code) => PLATE_CAPABLE_EQUIPMENT_CODES.has(code))
}

/** Whether the exercise's weight is loaded with plates (gates the calculator). */
export function resolveIsPlateLoaded(exercise: PlateLoadingExercise): boolean {
	// Prefer the server-computed flag (only ever sent when true); otherwise
	// derive from the tags the payload already carries.
	if (exercise.isPlateLoaded != null) return Boolean(exercise.isPlateLoaded)
	return hasTag(exercise, PLATE_LOADED_TAG)
}

/** Whether the plates load at a single point (single-stack vs barbell view). */
export function resolveIsSingleStack(exercise: PlateLoadingExercise): boolean {
	if (exercise.isSingleStack != null) return Boolean(exercise.isSingleStack)
	return hasTag(exercise, WEIGHT_PER_SIDE_TAG) || usesSingleStackEquipment(exercise)
}

/** The plate-calculator mode for an exercise's weight field. */
export function resolvePlateLoadingMode(
	exercise: PlateLoadingExercise | null | undefined,
): PlateLoadingMode {
	if (!exercise) return 'none'
	// Some legacy catalog rows carry a stale PLATE_LOADED flag even though the
	// only implement is a fixed dumbbell or kettlebell. Equipment is stronger
	// mechanical evidence here: showing a 20 kg bar calculator for an 8 kg
	// dumbbell would make an otherwise executable prescription impossible.
	if (usesFixedWeightImplementWithoutPlateHardware(exercise)) return 'none'
	if (!resolveIsPlateLoaded(exercise)) return 'none'
	return resolveIsSingleStack(exercise) ? 'single' : 'barbell'
}
