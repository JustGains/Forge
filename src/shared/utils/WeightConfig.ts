export type MeasurementSystem = 'metric' | 'imperial'

export type PlateConfig = {
  weight: number
  hexColor: string
  thickness: number
  height: number
}

export type BarWeight = {
  value: number
  label: string
}

export type SystemConfig = {
  unit: string
  plates: PlateConfig[]
  barWeights: BarWeight[]
  defaultBarWeight: number
  presets: Array<{ value: number; label: string }>
}

export const WEIGHT_CONFIGS: Record<MeasurementSystem, SystemConfig> = {
  metric: {
    unit: 'kg',
    defaultBarWeight: 20,
    barWeights: [
      { value: 20, label: '20 kg (Standard)' },
      { value: 15, label: "15 kg (Women's)" },
      { value: 10, label: '10 kg (Technique)' },
      { value: 9, label: '9 kg (Smith Machine)' },
      { value: 7.5, label: '7.5 kg (Junior)' },
      { value: 0, label: 'No Bar (Plates Only)' },
    ],
    plates: [
      { weight: 25, hexColor: '#EF4444', thickness: 3.4, height: 85 },
      { weight: 20, hexColor: '#3B82F6', thickness: 3, height: 80 },
      { weight: 15, hexColor: '#FACC15', thickness: 2.8, height: 78 },
      { weight: 10, hexColor: '#22C55E', thickness: 2.5, height: 75 },
      { weight: 5, hexColor: '#FFFFFF', thickness: 2.2, height: 70 },
      { weight: 2.5, hexColor: '#000000', thickness: 1.8, height: 65 },
      { weight: 1.25, hexColor: '#6B7280', thickness: 1.5, height: 60 },
      { weight: 0.5, hexColor: '#D1D5DB', thickness: 1.2, height: 55 },
    ],
    presets: [
      { value: 60, label: '60kg' },
      { value: 80, label: '80kg' },
      { value: 100, label: '100kg' },
      { value: 120, label: '120kg' },
      { value: 140, label: '140kg' },
      { value: 160, label: '160kg' },
    ],
  },
  imperial: {
    unit: 'lbs',
    defaultBarWeight: 45,
    barWeights: [
      { value: 45, label: '45 lbs (Standard)' },
      { value: 35, label: "35 lbs (Women's)" },
      { value: 25, label: '25 lbs (Technique)' },
      { value: 20, label: '20 lbs (Smith Machine)' },
      { value: 15, label: '15 lbs (Training)' },
      { value: 0, label: 'No Bar (Plates Only)' },
    ],
    plates: [
      { weight: 55, hexColor: '#EF4444', thickness: 3.4, height: 85 },
      { weight: 45, hexColor: '#3B82F6', thickness: 3.2, height: 82 },
      { weight: 35, hexColor: '#FACC15', thickness: 3, height: 78 },
      { weight: 25, hexColor: '#22C55E', thickness: 2.8, height: 75 },
      { weight: 10, hexColor: '#374151', thickness: 2.5, height: 70 },
      { weight: 5, hexColor: '#6B7280', thickness: 2.2, height: 65 },
      { weight: 2.5, hexColor: '#9CA3AF', thickness: 1.8, height: 60 },
    ],
    presets: [
      { value: 135, label: '135lbs' },
      { value: 185, label: '185lbs' },
      { value: 225, label: '225lbs' },
      { value: 275, label: '275lbs' },
      { value: 315, label: '315lbs' },
      { value: 405, label: '405lbs' },
    ],
  },
}

export const MAX_PLATES_PER_SIDE = 10

export function calculatePlatesForWeight(
  targetWeightPerSide: number,
  availablePlates: readonly PlateConfig[],
  excludeWeights: number[] = [55],
): number[] {
  const plates: number[] = []
  let remaining = targetWeightPerSide

  const sortedPlates = [...availablePlates]
    .filter(plate => !excludeWeights.includes(plate.weight))
    .sort((a, b) => b.weight - a.weight)

  for (const plate of sortedPlates) {
    if (plate.weight <= 0) continue
    while (
      remaining >= plate.weight &&
      plates.filter(p => p === plate.weight).length < MAX_PLATES_PER_SIDE
    ) {
      plates.push(plate.weight)
      remaining = Math.round((remaining - plate.weight) * 100) / 100
      if (plates.length >= MAX_PLATES_PER_SIDE) break
    }
    if (plates.length >= MAX_PLATES_PER_SIDE) break
  }

  return plates.sort((a, b) => b - a)
}
