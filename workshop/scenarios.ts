/**
 * ForgeWorkshop scenario space: deterministic personas and a stratified,
 * seeded sample over the full control matrix the product exposes (goal,
 * experience, split, duration, gear, grouping, optional stages).
 */
import type {
  OptimDemoExperience,
  OptimDemoGoal,
  OptimDemoSplit,
} from '@justgains/shared/src/optim'
import type { OptimGeneratorGroupingMode } from '@justgains/shared/src/optim'

/** Deterministic 32-bit PRNG so every run is reproducible from one seed. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!
}

export type WorkshopGear = 'bodyweight' | 'home' | 'full'

export type WorkshopPersona = {
  key: string
  gender: 'male' | 'female' | null
  ageYears: number | null
  bodyWeightKg: number | null
  experience: OptimDemoExperience
  goal: OptimDemoGoal
  gear: WorkshopGear
  injuries: string[]
  /** Relative strength per bucket (1RM ≈ factor × bodyweight) for the journey simulator. */
  strengthFactors: Record<string, number>
}

/**
 * Ten deliberately varied athletes. Strength factors are rough barbell-1RM /
 * bodyweight ratios for their level; the exercise-specific spread is derived
 * per code in the simulator.
 */
export const WORKSHOP_PERSONAS: WorkshopPersona[] = [
  {
    key: 'alex-intermediate-strength',
    gender: 'male', ageYears: 30, bodyWeightKg: 82,
    experience: 'intermediate', goal: 'strength', gear: 'full', injuries: [],
    strengthFactors: { legs: 1.4, back: 1.1, chest: 0.95, shoulders: 0.6, arms: 0.45, core: 0.5 },
  },
  {
    key: 'bella-beginner-tone',
    gender: 'female', ageYears: 27, bodyWeightKg: 61,
    experience: 'beginner', goal: 'muscleTone', gear: 'home', injuries: [],
    strengthFactors: { legs: 0.9, back: 0.65, chest: 0.5, shoulders: 0.35, arms: 0.3, core: 0.4 },
  },
  {
    key: 'carlos-intermediate-bodybuilding',
    gender: 'male', ageYears: 45, bodyWeightKg: 95,
    experience: 'intermediate', goal: 'bodybuilding', gear: 'full', injuries: [],
    strengthFactors: { legs: 1.3, back: 1.05, chest: 1.0, shoulders: 0.6, arms: 0.5, core: 0.45 },
  },
  {
    key: 'dana-advanced-powerlifting',
    gender: 'female', ageYears: 35, bodyWeightKg: 70,
    experience: 'advanced', goal: 'powerlifting', gear: 'full', injuries: [],
    strengthFactors: { legs: 1.8, back: 1.3, chest: 1.0, shoulders: 0.7, arms: 0.55, core: 0.6 },
  },
  {
    key: 'eli-beginner-bodyweight',
    gender: 'male', ageYears: 19, bodyWeightKg: 68,
    experience: 'beginner', goal: 'general', gear: 'bodyweight', injuries: [],
    strengthFactors: { legs: 1.0, back: 0.8, chest: 0.7, shoulders: 0.45, arms: 0.4, core: 0.5 },
  },
  {
    key: 'fran-intermediate-knee',
    gender: 'female', ageYears: 52, bodyWeightKg: 66,
    experience: 'intermediate', goal: 'general', gear: 'home', injuries: ['Knee'],
    strengthFactors: { legs: 0.95, back: 0.75, chest: 0.55, shoulders: 0.4, arms: 0.35, core: 0.45 },
  },
  {
    key: 'greg-advanced-olympic',
    gender: 'male', ageYears: 33, bodyWeightKg: 88,
    experience: 'advanced', goal: 'olympic', gear: 'full', injuries: [],
    strengthFactors: { legs: 1.7, back: 1.35, chest: 1.0, shoulders: 0.85, arms: 0.5, core: 0.6 },
  },
  {
    key: 'hana-intermediate-strength',
    gender: 'female', ageYears: 41, bodyWeightKg: 75,
    experience: 'intermediate', goal: 'strength', gear: 'full', injuries: [],
    strengthFactors: { legs: 1.2, back: 0.9, chest: 0.7, shoulders: 0.5, arms: 0.4, core: 0.5 },
  },
  {
    key: 'ivan-beginner-home',
    gender: 'male', ageYears: 60, bodyWeightKg: 78,
    experience: 'beginner', goal: 'general', gear: 'home', injuries: ['Lower back'],
    strengthFactors: { legs: 0.85, back: 0.65, chest: 0.55, shoulders: 0.35, arms: 0.3, core: 0.35 },
  },
  {
    key: 'jude-anonymous-general',
    gender: null, ageYears: null, bodyWeightKg: null,
    experience: 'intermediate', goal: 'general', gear: 'full', injuries: [],
    strengthFactors: { legs: 1.1, back: 0.85, chest: 0.75, shoulders: 0.5, arms: 0.4, core: 0.45 },
  },
]

export const GOALS: OptimDemoGoal[] = [
  'strength', 'bodybuilding', 'general', 'muscleTone', 'powerlifting', 'olympic',
]
export const EXPERIENCES: OptimDemoExperience[] = ['beginner', 'intermediate', 'advanced']
export const SPLITS: OptimDemoSplit[] = ['fresh', 'fullBody', 'upper', 'lower', 'push', 'pull']
export const GEARS: WorkshopGear[] = ['bodyweight', 'home', 'full']
export const GROUPINGS: OptimGeneratorGroupingMode[] = ['straight', 'supersets', 'circuits']
export const DURATIONS = [15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 90]

export type ColdScenario = {
  id: string
  kind: 'cold'
  persona: WorkshopPersona
  goal: OptimDemoGoal
  experience: OptimDemoExperience
  split: OptimDemoSplit
  gear: WorkshopGear
  grouping: OptimGeneratorGroupingMode
  durationMinutes: number
  warmupSets: boolean
  cardio: boolean
  cooldown: boolean
  seed: number
  generationDateIso: string
}

/**
 * Stratified sample: every (goal × experience × split × gear × grouping) cell
 * appears before any repeats, with duration/toggles/persona drawn from the
 * cell's own deterministic stream. `count` cells are returned in a seeded
 * shuffle so any prefix is still a balanced sample.
 */
export function buildColdScenarios(options: {
  count: number
  runSeed: number
  generationDateIso: string
}): ColdScenario[] {
  const cells: Array<{
    goal: OptimDemoGoal
    experience: OptimDemoExperience
    split: OptimDemoSplit
    gear: WorkshopGear
    grouping: OptimGeneratorGroupingMode
  }> = []
  for (const goal of GOALS)
    for (const experience of EXPERIENCES)
      for (const split of SPLITS)
        for (const gear of GEARS)
          for (const grouping of GROUPINGS)
            cells.push({ goal, experience, split, gear, grouping })

  const shuffleRandom = mulberry32(options.runSeed)
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(shuffleRandom() * (index + 1))
    const held = cells[index]!
    cells[index] = cells[swap]!
    cells[swap] = held
  }

  const scenarios: ColdScenario[] = []
  for (let index = 0; index < options.count; index += 1) {
    const cell = cells[index % cells.length]!
    const random = mulberry32(options.runSeed ^ (index * 2654435761))
    const persona = pick(random, WORKSHOP_PERSONAS)
    scenarios.push({
      id: `cold-${index}`,
      kind: 'cold',
      persona,
      ...cell,
      durationMinutes: pick(random, DURATIONS),
      warmupSets: random() < 0.7,
      cardio: random() < 0.3,
      cooldown: random() < 0.3,
      seed: Math.floor(random() * 1_000_000),
      generationDateIso: options.generationDateIso,
    })
  }
  return scenarios
}
