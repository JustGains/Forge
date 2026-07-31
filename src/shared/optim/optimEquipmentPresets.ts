const OPTIM_HOME_EQUIPMENT_CODES = new Set([
  'AB_ROLLER',
  'ADJUSTABLE_BENCH',
  'ANKLE_WEIGHTS',
  'BOX',
  'CHAIR',
  'CHIN_UP_BAR',
  'DIP_BARS',
  'DUMBBELLS',
  'EXERCISE_BENCH',
  'EXERCISE_MAT',
  'FLAT_BENCH',
  'FOAM_ROLLER',
  'GYMNASTIC_RINGS',
  'INCLINE_BENCH',
  'JUMP_ROPE',
  'KETTLEBELLS',
  'MEDICINE_BALL',
  'MINI-LOOP_BANDS',
  'PLYOMETRIC_BOX',
  'PULL_UP_BAR',
  'PUSH_UP_BARS',
  'RESISTANCE_BANDS',
  'SUSPENSION_TRAINER',
  'SUSPENSION_TRAINER_OR_TRX',
  'TOWEL',
  'TRX',
  'WEIGHTED_VEST',
  'YOGA_BLOCK',
  'YOGA_MAT',
])

/** Equipment covered by the UI promise: dumbbells, bands, a bench, and common compact home gear. */
export function isOptimHomeEquipmentCode(code: string): boolean {
  return OPTIM_HOME_EQUIPMENT_CODES.has(code.trim().toUpperCase())
}
