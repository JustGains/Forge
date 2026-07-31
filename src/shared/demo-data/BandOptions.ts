export type BandPalette = 'primary' | 'danger' | 'success' | 'info' | 'muted'

export const BAND_COLORS: Record<BandPalette, string> = {
  primary: '#FFB80A', // bold yellow
  danger: '#dc2626',  // bold red
  success: '#16a34a', // bold green
  info: '#0ea5e9',    // bold cyan
  muted: '#64748b',   // bold gray
}

export interface BandOption {
  label: string
  value: number
  color: BandPalette
  hexColor: string
}

export const BAND_OPTIONS: BandOption[] = [
  { label: 'Extra Light', value: 1, color: 'primary', hexColor: BAND_COLORS.primary },
  { label: 'Light', value: 2, color: 'danger', hexColor: BAND_COLORS.danger },
  { label: 'Medium', value: 3, color: 'success', hexColor: BAND_COLORS.success },
  { label: 'Heavy', value: 4, color: 'info', hexColor: BAND_COLORS.info },
  { label: 'Extra Heavy', value: 5, color: 'muted', hexColor: BAND_COLORS.muted },
]

export interface MobileBandOption extends BandOption {
  fullLabel: string
}

export const MOBILE_BAND_OPTIONS: MobileBandOption[] = [
  { label: 'XL', value: 1, color: 'primary', hexColor: BAND_COLORS.primary, fullLabel: 'Extra Light' },
  { label: 'L', value: 2, color: 'danger', hexColor: BAND_COLORS.danger, fullLabel: 'Light' },
  { label: 'M', value: 3, color: 'success', hexColor: BAND_COLORS.success, fullLabel: 'Medium' },
  { label: 'H', value: 4, color: 'info', hexColor: BAND_COLORS.info, fullLabel: 'Heavy' },
  { label: 'XH', value: 5, color: 'muted', hexColor: BAND_COLORS.muted, fullLabel: 'Extra Heavy' },
]

export function getBandOptionForValue(value: number | null | undefined): BandOption | null {
  if (value == null) return null
  return BAND_OPTIONS.find(o => o.value === value) ?? null
}

// Measurement codes rendered with the resistance-band selector (a band picker
// rather than a numeric input). Assisted bands reuse the same band levels.
export const BAND_MEASUREMENT_CODES = [
  'RESISTANCE_BAND',
  'ASSISTED_RESISTANCE_BAND',
]

export const isBandMeasurement = (
  measurementCode: string | null | undefined,
): boolean => !!measurementCode && BAND_MEASUREMENT_CODES.includes(measurementCode)

// Score-inversion base for assisted bands: a lighter band (lower value) is the
// harder variation and should score higher. invertedValue = BAND_INVERSION_BASE
// - value. Must stay above the highest band value. Keep in sync with
// MeasurementData.BandInversionBase on the API.
export const BAND_INVERSION_BASE = BAND_OPTIONS.length + 1