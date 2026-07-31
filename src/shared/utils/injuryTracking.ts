export type InjuryTrackingState = {
	enabledItems: string[]
	customItems: string[]
}

export const DEFAULT_INJURY_OPTIONS = [
	'ACL Tear',
	'Ankle Sprain',
	'Bursitis',
	'Carpal Tunnel Syndrome',
	'Concussion',
	'Contusion',
	'Dislocation',
	'Fracture',
	'Groin Strain',
	'Hamstring Strain',
	'Herniated Disc',
	'IT Band Syndrome',
	'Tennis Elbow',
	'MCL Sprain',
	'Meniscus Tear',
	'Muscle Strain',
	"Patellar Tendonitis (Jumper's Knee)",
	'Plantar Fasciitis',
	'Quadriceps Contusion',
	'Repetitive Strain Injury',
	'Rotator Cuff Tear',
	'Sciatica',
	'Shin Splints',
	'Shoulder Impingement',
	'Stress Fracture',
	'Tendinitis',
	'Thoracic Outlet Syndrome',
	'Turf Toe',
	'Whiplash',
	'Wrist Sprain',
] as const

export const EMPTY_INJURY_TRACKING: InjuryTrackingState = {
	enabledItems: [],
	customItems: [],
}

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ')

export const sanitizeInjuryLabel = (value: string) => normalizeWhitespace(value)

export const normalizeInjuryTrackingKey = (value: string) =>
	sanitizeInjuryLabel(value).toLowerCase()

const DEFAULT_INJURY_OPTION_MAP = new Map(
	DEFAULT_INJURY_OPTIONS.map(label => [normalizeInjuryTrackingKey(label), label]),
)

const sanitizeStringList = (value: unknown): string[] => {
	if (!Array.isArray(value)) return []

	const seen = new Set<string>()
	const result: string[] = []

	for (const item of value) {
		if (typeof item !== 'string') continue

		const label = sanitizeInjuryLabel(item)
		if (!label) continue

		const normalizedKey = normalizeInjuryTrackingKey(label)
		if (seen.has(normalizedKey)) continue

		seen.add(normalizedKey)
		result.push(label)
	}

	return result
}

export const isDefaultInjuryOption = (label: string) =>
	DEFAULT_INJURY_OPTION_MAP.has(normalizeInjuryTrackingKey(label))

const toCanonicalDefaultLabel = (label: string) =>
	DEFAULT_INJURY_OPTION_MAP.get(normalizeInjuryTrackingKey(label)) ?? label

export const sanitizeInjuryTracking = (
	value: Partial<InjuryTrackingState> | null | undefined,
): InjuryTrackingState => {
	const customItems = sanitizeStringList(value?.customItems).filter(
		item => !isDefaultInjuryOption(item),
	)

	const allowedKeys = new Set<string>([
		...DEFAULT_INJURY_OPTIONS.map(normalizeInjuryTrackingKey),
		...customItems.map(normalizeInjuryTrackingKey),
	])

	const enabledItems = sanitizeStringList(value?.enabledItems)
		.map(toCanonicalDefaultLabel)
		.filter(item => allowedKeys.has(normalizeInjuryTrackingKey(item)))

	return {
		enabledItems,
		customItems,
	}
}

export const getUserInjuryTracking = (userPrivateMeta: unknown): InjuryTrackingState => {
	if (!userPrivateMeta || typeof userPrivateMeta !== 'object') {
		return EMPTY_INJURY_TRACKING
	}

	return sanitizeInjuryTracking(
		(userPrivateMeta as { injuryTracking?: Partial<InjuryTrackingState> | null })
			.injuryTracking,
	)
}

export const getInjuryTrackingOptions = (
	injuryTracking: InjuryTrackingState,
): string[] => {
	const sanitized = sanitizeInjuryTracking(injuryTracking)

	return [...DEFAULT_INJURY_OPTIONS, ...sanitized.customItems]
}

export const isInjuryEnabled = (
	injuryTracking: InjuryTrackingState,
	label: string,
) => {
	const normalizedKey = normalizeInjuryTrackingKey(label)

	return sanitizeInjuryTracking(injuryTracking).enabledItems.some(
		item => normalizeInjuryTrackingKey(item) === normalizedKey,
	)
}

export const toggleInjuryEnabled = (
	injuryTracking: InjuryTrackingState,
	label: string,
) => {
	const sanitized = sanitizeInjuryTracking(injuryTracking)
	const canonicalLabel = toCanonicalDefaultLabel(sanitizeInjuryLabel(label))
	const normalizedKey = normalizeInjuryTrackingKey(canonicalLabel)
	const isEnabled = sanitized.enabledItems.some(
		item => normalizeInjuryTrackingKey(item) === normalizedKey,
	)

	return sanitizeInjuryTracking({
		...sanitized,
		enabledItems: isEnabled
			? sanitized.enabledItems.filter(
				item => normalizeInjuryTrackingKey(item) !== normalizedKey,
			)
			: [...sanitized.enabledItems, canonicalLabel],
	})
}

export const addCustomInjury = (
	injuryTracking: InjuryTrackingState,
	rawLabel: string,
) => {
	const sanitizedLabel = sanitizeInjuryLabel(rawLabel)
	if (!sanitizedLabel) {
		return sanitizeInjuryTracking(injuryTracking)
	}

	const matchingDefault = DEFAULT_INJURY_OPTION_MAP.get(
		normalizeInjuryTrackingKey(sanitizedLabel),
	)

	if (matchingDefault) {
		const current = sanitizeInjuryTracking(injuryTracking)
		if (isInjuryEnabled(current, matchingDefault)) {
			return current
		}

		return sanitizeInjuryTracking({
			...current,
			enabledItems: [...current.enabledItems, matchingDefault],
		})
	}

	const current = sanitizeInjuryTracking(injuryTracking)

	return sanitizeInjuryTracking({
		customItems: [...current.customItems, sanitizedLabel],
		enabledItems: [...current.enabledItems, sanitizedLabel],
	})
}

export const removeCustomInjury = (
	injuryTracking: InjuryTrackingState,
	label: string,
) => {
	const normalizedKey = normalizeInjuryTrackingKey(label)
	const sanitized = sanitizeInjuryTracking(injuryTracking)

	return sanitizeInjuryTracking({
		customItems: sanitized.customItems.filter(
			item => normalizeInjuryTrackingKey(item) !== normalizedKey,
		),
		enabledItems: sanitized.enabledItems.filter(
			item => normalizeInjuryTrackingKey(item) !== normalizedKey,
		),
	})
}

export const setUserPrivateMetaInjuryTracking = <
	T extends Record<string, unknown> | null | undefined,
>(
	userPrivateMeta: T,
	injuryTracking: InjuryTrackingState,
) => ({
	...(userPrivateMeta ?? {}),
	injuryTracking: sanitizeInjuryTracking(injuryTracking),
})
