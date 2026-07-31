import type { Muscle, MuscleGroup } from '@justgains/shared/src/api'
import type { ExerciseMuscle } from '../api/types/ExerciseMuscle'

export const MUSCLE_GROUPS = [
	{
		muscleGroupCode: 'UPPER_BODY',
		muscleGroupName: 'Upper Body',
		muscleGroupParent: null,
		muscleGroupType: 'main_group',
		muscleGroupMuscles: [],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/48aa78c5-3a2b-4b00-ab00-3ac867c0f156.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'LOWER_BODY',
		muscleGroupName: 'Lower Body',
		muscleGroupParent: null,
		muscleGroupType: 'main_group',
		muscleGroupMuscles: [],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/3bcbf217-1d47-4cb4-840b-c7d96478cd9b.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'ACCESSORIES',
		muscleGroupName: 'Accessories',
		muscleGroupParent: null,
		muscleGroupType: 'main_group',
		muscleGroupMuscles: [],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/889e0c66-7af3-42e7-a85e-b5974acf0089.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'CALVES_SHINS',
		muscleGroupName: 'Calves / Shins',
		muscleGroupParent: 'ACCESSORIES',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: [],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/1b1bdb15-58c7-4d09-9abf-9059b5ffaff6.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'CHEST',
		muscleGroupName: 'Chest',
		muscleGroupParent: 'UPPER_BODY',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: [],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/48aa78c5-3a2b-4b00-ab00-3ac867c0f156.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'QUADS',
		muscleGroupName: 'Quads',
		muscleGroupParent: 'LOWER_BODY',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: ['QUADRICEPS'],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/7a86f236-46cc-4b17-a8eb-c04db90a6cbe.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'CORE',
		muscleGroupName: 'Core',
		muscleGroupParent: 'UPPER_BODY',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: [],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/80ed8c57-83d8-4dfb-9ad6-63bd1308e347.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'TRAPEZIUS',
		muscleGroupName: 'Traps',
		muscleGroupParent: 'ACCESSORIES',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: [],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/47ec6bac-9b27-49b4-9532-b377d2180964.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'GLUTES_AND_HIPS',
		muscleGroupName: 'Glutes & Hips',
		muscleGroupParent: 'LOWER_BODY',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: [],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/5e958b0a-0bd7-4b8f-9011-da1649a1835e.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'HIP_ABDUCTORS',
		muscleGroupName: 'Hip Abductors (Outer Thighs)',
		muscleGroupParent: 'ACCESSORIES',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: [
			'TENSOR_FASCIAE_LATAE',
			'GLUTEUS_MEDIUS',
			'GLUTEUS_MINIMUS',
		],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/df886fde-893f-4ca9-99d3-16d0017b49ee.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'SHOULDERS',
		muscleGroupName: 'Shoulders',
		muscleGroupParent: 'UPPER_BODY',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: [],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/dd5009f5-eff7-4fb2-be10-9bb652a5dd36.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'BICEPS',
		muscleGroupName: 'Biceps',
		muscleGroupParent: 'UPPER_BODY',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: ['BRACHIALIS', 'BICEPS_BRACHII'],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/59f91f2d-9ef4-4144-a1b6-f3d37ec7f7e1.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'HIP_ADDUCTORS',
		muscleGroupName: 'Hip Adductors (Inner Thighs)',
		muscleGroupParent: 'ACCESSORIES',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: ['HIP_ADDUCTORS', 'PECTINEOUS', 'GRACILIS'],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/70066375-cf0b-42e1-a1a1-c70bd0a56da9.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'FOREARMS',
		muscleGroupName: 'Forearms',
		muscleGroupParent: 'ACCESSORIES',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: ['WRIST_FLEXORS', 'WRIST_EXTENSORS', 'BRACHIORADIALIS'],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/e8b98a8e-ccad-428a-b5fc-58b6aa1e7d3d.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'TRICEPS',
		muscleGroupName: 'Triceps',
		muscleGroupParent: 'UPPER_BODY',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: ['TRICEPS_BRACHII'],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/053413d5-ad04-43d7-befb-06d3730898f7.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'BACK',
		muscleGroupName: 'Back',
		muscleGroupParent: 'UPPER_BODY',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: [],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/fa479fd2-af2c-4fc8-ad67-7b0281cb9bde.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'NECK',
		muscleGroupName: 'Neck',
		muscleGroupParent: 'ACCESSORIES',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: ['LEVATOR_SCAPULAE', 'STERNOCLEIDOMASTOID', 'SPLENIUS'],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/889e0c66-7af3-42e7-a85e-b5974acf0089.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'LOWER_BACK',
		muscleGroupName: 'Lower Back',
		muscleGroupParent: 'UPPER_BODY',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: ['ERECTOR_SPINAE', 'QUADRATUS_LUMBORUM'],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/a999649b-f468-417e-866b-315dbd3b5fc7.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'ABS',
		muscleGroupName: 'Abs',
		muscleGroupParent: 'CORE',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['TRANSVERSE_ABDOMINUS', 'RECTUS_ABDOMINIS'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'CALVES',
		muscleGroupName: 'Calves',
		muscleGroupParent: 'CALVES_SHINS',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['GASTROCNEMIUS', 'POPLITEUS', 'SOLEUS'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'FRONT_DELTS',
		muscleGroupName: 'Front Delts',
		muscleGroupParent: 'SHOULDERS',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['ANTERIOR_DELTOID'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'GLUTES',
		muscleGroupName: 'Glutes',
		muscleGroupParent: 'GLUTES_AND_HIPS',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: [
			'GLUTEUS_MAXIMUS',
			'GLUTEUS_MINIMUS',
			'GLUTEUS_MEDIUS',
		],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'LATS_WIDTH',
		muscleGroupName: 'Lats (Width)',
		muscleGroupParent: 'BACK',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['LATISSIMUS_DORSI'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'TRAPS_UPPER_ACC',
		muscleGroupName: 'Traps (Upper)',
		muscleGroupParent: 'TRAPEZIUS',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['TRAPEZIUS_UPPER_FIBERS'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'UPPER_CHEST',
		muscleGroupName: 'Upper Chest',
		muscleGroupParent: 'CHEST',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['PECTORALIS_MAJOR_CLAVICULAR_HEAD'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
		},
	},
	{
		muscleGroupCode: 'HAMSTRINGS',
		muscleGroupName: 'Hamstrings',
		muscleGroupParent: 'LOWER_BODY',
		muscleGroupType: 'subgroup',
		muscleGroupMuscles: ['HAMSTRINGS'],
		muscleGroupThumbnail: {
			fileUrl:
				'https://m.justgains.com/uploads/3bcbf217-1d47-4cb4-840b-c7d96478cd9b.svg',
		},
	},
	{
		muscleGroupCode: 'HIP_FLEXORS_ROTATORS',
		muscleGroupName: 'Hip Flexors and Rotators',
		muscleGroupParent: 'GLUTES_AND_HIPS',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: [
			'SARTORIUS',
			'TENSOR_FASCIAE_LATAE',
			'DEEP_HIP_EXTERNAL_ROTATORS',
			'PECTINEOUS',
		],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'LOWER_CHEST',
		muscleGroupName: 'Lower Chest',
		muscleGroupParent: 'CHEST',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['PECTORALIS_MAJOR_STERNAL_HEAD'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'OBLIQUES',
		muscleGroupName: 'Obliques',
		muscleGroupParent: 'CORE',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['OBLIQUES'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'SIDE_DELTS',
		muscleGroupName: 'Side Delts',
		muscleGroupParent: 'SHOULDERS',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['LATERAL_DELTOID'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'TIBIALIS_ANTERIOR',
		muscleGroupName: 'Tibialis Anterior (Shins)',
		muscleGroupParent: 'CALVES_SHINS',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['TIBIALIS_ANTERIOR'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'TRAPS_MID_LOWER_ACC',
		muscleGroupName: 'Traps (Mid & Lower)',
		muscleGroupParent: 'TRAPEZIUS',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['TRAPEZIUS_MIDDLE_FIBERS', 'TRAPEZIUS_LOWER_FIBERS'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'CORE_LOWER_BACK',
		muscleGroupName: 'Lower Back',
		muscleGroupParent: 'CORE',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['QUADRATUS_LUMBORUM'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'INNER_CHEST',
		muscleGroupName: 'Inner Chest',
		muscleGroupParent: 'CHEST',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['PECTORALIS_MINOR'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'REAR_DELTS',
		muscleGroupName: 'Rear Delts',
		muscleGroupParent: 'SHOULDERS',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['POSTERIOR_DELTOID'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'RHOMBOIDS_SCAPULAR',
		muscleGroupName: 'Rhomboids/Scapular',
		muscleGroupParent: 'BACK',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['RHOMBOIDS'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'OTHER_BACK',
		muscleGroupName: 'Other',
		muscleGroupParent: 'BACK',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: ['TERES_MAJOR', 'SERRATUS_ANTERIOR'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'ROTATOR_CUFF',
		muscleGroupName: 'Rotator Cuff',
		muscleGroupParent: 'SHOULDERS',
		muscleGroupType: 'exercise_group',
		muscleGroupMuscles: [
			'INFRASPINATUS',
			'SUPRASPINATUS',
			'SUBSCAPULARIS',
			'TERES_MINOR',
		],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'TRAPS_UPPER_BACK',
		muscleGroupName: 'Traps (Upper)',
		muscleGroupParent: 'BACK',
		muscleGroupType: 'filter_group',
		muscleGroupMuscles: ['TRAPEZIUS_UPPER_FIBERS'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'TRAPS_MID_LOWER',
		muscleGroupName: 'Traps (Mid & Lower)',
		muscleGroupParent: 'BACK',
		muscleGroupType: 'filter_group',
		muscleGroupMuscles: ['TRAPEZIUS_LOWER_FIBERS', 'TRAPEZIUS_MIDDLE_FIBERS'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'HIP_FLEXORS',
		muscleGroupName: 'Hip Flexors',
		muscleGroupParent: 'CORE',
		muscleGroupType: 'filter_group',
		muscleGroupMuscles: ['ILIOPSOAS'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
	{
		muscleGroupCode: 'TRAPS_UPPER',
		muscleGroupName: 'Traps (Upper)',
		muscleGroupParent: 'SHOULDERS',
		muscleGroupType: 'filter_group',
		muscleGroupMuscles: ['TRAPEZIUS_UPPER_FIBERS'],
		muscleGroupThumbnail: {
			fileUrl: 'https://m.justgains.com/just-placeholders/muscle-group.svg',
			fileFormat: 'image/svg+xml',
		},
	},
] as MuscleGroup[]

export default MUSCLE_GROUPS

// Works well and is important because only the subgroups have the thumbnails
export const findSubgroup = (group: MuscleGroup): MuscleGroup | null => {
	if (group.muscleGroupType === 'subgroup') {
		return group
	}

	const parent = MUSCLE_GROUPS.find(
		g => g.muscleGroupCode === group.muscleGroupParent,
	)

	return parent ? findSubgroup(parent) : null
}

// Works - not used idt
export const getMuscleMuscleGroup = (
	muscleCode: string,
): MuscleGroup | null => {
	const group = findMuscleGroup(muscleCode)

	if (group) {
		return {
			...group,
			muscleGroupMuscles: [muscleCode],
		}
	}

	return null
}

export const getMuscleGroupsFromMuscles = (
	muscleCodes: string[],
): MuscleGroup[] => {
	const muscleGroupsMap = new Map<string, MuscleGroup>()

	muscleCodes.forEach(muscleCode => {
		const group = findMuscleGroup(muscleCode)

		if (group) {
			const groupKey = group.muscleGroupCode

			if (muscleGroupsMap.has(groupKey)) {
				const existingGroup = muscleGroupsMap.get(groupKey)!
				if (!existingGroup.muscleGroupMuscles?.includes(muscleCode)) {
					existingGroup.muscleGroupMuscles!.push(muscleCode)
				}
			} else {
				muscleGroupsMap.set(groupKey, {
					...group,
					muscleGroupMuscles: [muscleCode],
				})
			}
		}
	})

	return Array.from(muscleGroupsMap.values())
}

// I think this is the best one to use since it sorts by usage
export const getMuscleGroupsFromMuscleData = (
	muscleData: ExerciseMuscle[],
): MuscleGroup[] => {
	const groupsMap = new Map<
		string,
		{
			muscleGroup: MuscleGroup
			usage: number
			muscleCodes: Set<string>
		}
	>()

	// Build the groups
	for (const { muscleCode, targetPercentage = 0 } of muscleData) {
		if (!muscleCode) continue

		const muscleGroup = getMuscleMuscleGroup(muscleCode)
		if (!muscleGroup) continue

		const existing = groupsMap.get(muscleGroup.muscleGroupCode)

		if (existing) {
			existing.muscleCodes.add(muscleCode)
			existing.usage += targetPercentage
		} else {
			groupsMap.set(muscleGroup.muscleGroupCode, {
				muscleGroup,
				usage: targetPercentage,
				muscleCodes: new Set([muscleCode]),
			})
		}
	}

	// Sort by usage first, then map to MuscleGroup
	return Array.from(groupsMap.values())
		.sort((a, b) => b.usage - a.usage) // Sort while we still have usage
		.map(({ muscleGroup, muscleCodes }) => ({
			...muscleGroup,
			muscleGroupMuscles: Array.from(muscleCodes),
		}))
}

// Works but idt it's used
export const getMusclesMuscleGroups = (
	muscleCodes: string[],
): MuscleGroup[] => {
	const muscleGroupsMap = new Map<string, MuscleGroup>()

	muscleCodes.forEach(muscleCode => {
		const muscleGroup = getMuscleMuscleGroup(muscleCode)

		if (muscleGroup) {
			const existingGroup = muscleGroupsMap.get(muscleGroup.muscleGroupCode)

			if (existingGroup) {
				// Add muscle code to existing group's muscles array
				if (!existingGroup.muscleGroupMuscles?.includes(muscleCode)) {
					existingGroup.muscleGroupMuscles = [
						...(existingGroup.muscleGroupMuscles || []),
						muscleCode,
					]
				}
			} else {
				// Create a new group with this muscle code
				muscleGroupsMap.set(muscleGroup.muscleGroupCode, muscleGroup)
			}
		}
	})

	const sortedArray = Array.from(muscleGroupsMap.values()).sort((a, b) => {
		const muscleCountA = a.muscleGroupMuscles?.length || 0
		const muscleCountB = b.muscleGroupMuscles?.length || 0

		if (muscleCountA < muscleCountB) return -1
		if (muscleCountA > muscleCountB) return 1

		return 0
	})

	return sortedArray
}

export const findParentSubgroups = (
	muscleGroupCodes: string[],
): MuscleGroup[] => {
	const subgroups = new Set<MuscleGroup>()

	muscleGroupCodes.forEach(muscleGroupCode => {
		const exerciseGroup = MUSCLE_GROUPS.find(
			group =>
				group.muscleGroupCode === muscleGroupCode &&
				group.muscleGroupType === 'exercise_group',
		)

		if (exerciseGroup?.muscleGroupParent) {
			const subgroup = MUSCLE_GROUPS.find(
				group =>
					group.muscleGroupCode === exerciseGroup.muscleGroupParent &&
					group.muscleGroupType === 'subgroup',
			)
			if (subgroup) {
				subgroups.add(subgroup)
			}
		}
	})

	return Array.from(subgroups)
}

export const findMuscleGroup = (muscleCode: string): MuscleGroup | null => {
	const initialGroup = MUSCLE_GROUPS.find(group =>
		group.muscleGroupMuscles?.includes(muscleCode),
	)

	if (initialGroup) {
		const subGroup = findSubgroup(initialGroup)

		return subGroup || null
	}

	return null
}

// Type guard functions to determine the type of data
const isMuscleGroupArray = (items: any[]): items is MuscleGroup[] => {
	return items.length > 0 && 'muscleGroupCode' in items[0]
}

const isMuscleArray = (items: any[]): items is Muscle[] => {
	return (
		items.length > 0 && 'muscleCode' in items[0] && !('isPrimary' in items[0])
	)
}

const isExerciseMuscleArray = (items: any[]): items is ExerciseMuscle[] => {
	return items.length > 0 && 'muscleCode' in items[0] && 'isPrimary' in items[0]
}

export function getMuscleGroups(
	muscleItems: MuscleGroup[] | Muscle[] | ExerciseMuscle[] | null | undefined,
): MuscleGroup[] {
	if (!muscleItems || muscleItems.length === 0) {
		return []
	}

	// Case 1: MuscleGroup[]
	if (isMuscleGroupArray(muscleItems)) {
		return muscleItems
	}

	// Case 2: Muscle[]
	if (isMuscleArray(muscleItems)) {
		return getMuscleGroupsFromMuscles(
			muscleItems.map(muscle => muscle.muscleCode),
		)
	}

	// Case 3: ExerciseMuscle[]
	if (isExerciseMuscleArray(muscleItems)) {
		return getMuscleGroupsFromMuscleData(muscleItems)
	}

	return []
}
