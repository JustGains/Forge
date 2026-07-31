import { describe, expect, it } from 'vitest'

import {
  calculateOptimExerciseCounts,
  defaultOptimDemoInputs,
  estimatedExerciseSeconds,
  type OptimDemoResult,
} from './optimDemoEngine'
import { emptyMuscleUsageCounts } from '../utils/muscleUsage'
import {
  buildIntervalWorkoutSteps,
  getIntervalSessionRemainingSeconds,
} from '../utils/intervalWorkout'

import {
  OPTIM_DURATION_FILL_TARGET_UTILIZATION,
  OPTIM_TRANSITION_SECONDS_PER_EXERCISE,
  estimateOptimGuidedSessionMinutes,
  fillOptimExtraWorkingSetsToSessionTarget,
  estimateOptimSessionMinutes,
  estimateOptimSessionUtilization,
  estimateOptimStrengthStageUtilization,
  fitOptimOptionalStagesToSessionTarget,
  isOptimDurationFillImprovement,
  isOptimCoreRestoreImprovement,
  optimDurationFillCounts,
  resolveOptimCoreRestoreTarget,
  trimOptimWarmupsToSessionTarget,
  trimOptimWorkingSetsToGuidedTarget,
  withOptimSessionEstimate,
} from './optimDurationPolicy'

const exercise = (
  code: string,
  phase: 'strength' | 'core',
  groupId: number | null = null,
  normalSetCount = 3,
  groupType: 'superset' | 'circuit' = 'superset',
): OptimDemoResult['exercises'][number] => ({
  code,
  name: code,
  phase,
  primaryBucket: phase === 'core' ? 'core' : 'chest',
  primaryMuscles: [],
  equipmentCodes: [],
  score: 1,
  scoreBreakdown: null,
  rank: 1,
  schemeSource: 'test',
  maxEffort: false,
  weightedBodyweight: false,
  theoreticalMaxKg: null,
  groupId,
  groupType: groupId == null ? null : groupType,
  sets: Array.from({ length: normalSetCount }, (_, index) => ({
    setNumber: index + 1,
    setType: 'normal' as const,
    reps: 10,
    restSeconds: 60,
  })),
  trace: [],
})

const stageExercise = (
  code: string,
  phase: 'mobilityWarmup' | 'cardio' | 'mobilityCooldown',
): OptimDemoResult['exercises'][number] => ({
  ...exercise(code, 'strength', null, 1),
  phase,
  primaryBucket: null,
  sets: [{
    setNumber: 1,
    setType: 'normal',
    durationSeconds: 45,
    restSeconds: 0,
  }],
})

function result(
  exercises: OptimDemoResult['exercises'],
  projectedMinutes: number,
  strengthBudgetMinutes = 46,
): OptimDemoResult {
  const computed = calculateOptimExerciseCounts(strengthBudgetMinutes, 'general')
  return {
    generatedAt: '2026-07-17T00:00:00.000Z',
    durationEstimate: {
      requestedMinutes: 46,
      projectedMinutes,
      utilization: projectedMinutes / 46,
      strengthBudgetMinutes,
    },
    counts: {
      computedNonCore: computed.nonCore,
      computedCore: computed.core,
      requestedNonCore: computed.nonCore,
      requestedCore: computed.core,
      generatedStrength: exercises.filter((item) => item.phase === 'strength').length,
      generatedCore: exercises.filter((item) => item.phase === 'core').length,
      generatedCardio: 0,
      generatedMobility: 0,
    },
    muscleUsage: emptyMuscleUsageCounts(),
    recoveryWindowDays: 0,
    availabilityRatio: 1,
    exercises,
    rankedCandidates: [],
    rejectedCandidates: [],
    events: [],
    dataNotes: [],
  }
}

describe('Optim product duration policy', () => {
  it('adds only non-overlapping intermediate final rests to the guided estimate', () => {
    // Why: the player offers a final-set rest before the next exercise, but
    // the session estimate already reserves 30 seconds for that transition.
    // Counting both in full would overstate the user's guided workout time.
    const exercises = [
      exercise('PRESS', 'strength'),
      exercise('ROW', 'strength'),
      exercise('CRUNCH', 'core'),
    ]
    exercises[0].sets.at(-1)!.restSeconds = 90
    exercises[1].sets.at(-1)!.restSeconds = 60
    exercises[2].sets.at(-1)!.restSeconds = 45
    const plan = result(exercises, 20)
    const snapshot = structuredClone(plan)

    expect(estimateOptimSessionMinutes(plan)).toBe(21.5)
    expect(estimateOptimGuidedSessionMinutes(plan)).toBe(23)
    expect(plan).toEqual(snapshot)

    plan.exercises[0].isUnilateral = true
    expect(estimateOptimGuidedSessionMinutes(plan)).toBe(23)
  })

  it('does not count a post-workout rest in the guided estimate', () => {
    const finalExercise = exercise('PRESS', 'strength')
    finalExercise.sets.at(-1)!.restSeconds = 300
    const plan = result([finalExercise], 20)

    expect(estimateOptimGuidedSessionMinutes(plan))
      .toBe(estimateOptimSessionMinutes(plan))
  })

  it('does not add back the interval player terminal rest for a timed group', () => {
    // Why: timed groups omit the final scheduled rest before returning to the
    // workout, even when another exercise follows the group.
    const timed = (code: string) => ({
      ...exercise(code, 'core', 1, 3, 'superset'),
      sets: Array.from({ length: 3 }, (_, index) => ({
        setNumber: index + 1,
        setType: 'normal' as const,
        durationSeconds: 30,
        restSeconds: 60,
      })),
    })
    const plan = result([
      timed('HOLD_A'),
      timed('HOLD_B'),
      exercise('PRESS', 'strength'),
    ], 20)

    expect(estimateOptimSessionMinutes(plan)).toBe(21.5)
    expect(estimateOptimGuidedSessionMinutes(plan)).toBe(22)
  })

  it('keeps the timed-group allowance close to the real interval-player schedule', () => {
    // Why: the per-exercise 30-second allowance currently offsets the final
    // rests retained between timed group members. Pin that near-cancellation
    // against the runtime oracle before either side can drift independently.
    const timedEngineExercise = (code: string) => ({
      ...exercise(code, 'core', 1, 3, 'superset'),
      sets: Array.from({ length: 3 }, (_, index) => ({
        setNumber: index + 1,
        setType: 'normal' as const,
        durationSeconds: 30,
        restSeconds: 30,
      })),
    })
    const engineExercises = [
      timedEngineExercise('HOLD_A'),
      timedEngineExercise('HOLD_B'),
    ]
    const currentEstimate = engineExercises.reduce(
      (total, item) =>
        total + estimatedExerciseSeconds(item) + OPTIM_TRANSITION_SECONDS_PER_EXERCISE,
      0,
    )
    const steps = buildIntervalWorkoutSteps(engineExercises.map((item) => ({
      entryKey: item.code,
      exercise: {
        exerciseCode: item.code,
        exerciseData: item.sets.map((set) => ({
          setNumber: set.setNumber,
          setMeasurements: [
            { measurementCode: 'DURATION', measurementPlaceholder: set.durationSeconds },
            { measurementCode: 'REST', measurementPlaceholder: set.restSeconds },
          ],
        })),
      },
    })), 'superset')
    const intervalSchedule = getIntervalSessionRemainingSeconds(steps, {
      phase: 'countdown',
      currentIndex: 0,
      pendingNextIndex: null,
      completedStepIds: new Set(),
      phaseElapsedSeconds: 0,
    })

    expect(currentEstimate).toBe(360)
    expect(intervalSchedule).toBe(335)
    expect(Math.abs(currentEstimate - intervalSchedule))
      .toBeLessThanOrEqual(OPTIM_TRANSITION_SECONDS_PER_EXERCISE * engineExercises.length)
  })

  it('offers a bounded closest-fit staircase only for underfilled automatic plans', () => {
    const inputs = defaultOptimDemoInputs()
    const underfilled = {
      ...result([exercise('PRESS', 'strength'), exercise('CRUNCH', 'core')], 20),
      rankedCandidates: Array.from({ length: 8 }, (_, index) => ({
        code: `EXERCISE_${index}`,
        name: `Exercise ${index}`,
        score: 1,
        primaryBucket: null,
        isCore: false,
        breakdown: {},
      })) as OptimDemoResult['rankedCandidates'],
    }
    expect(optimDurationFillCounts(
      { ...inputs, durationMinutes: 90 },
      underfilled,
    )).toEqual([5, 6, 7])
    expect(optimDurationFillCounts(
      { ...inputs, durationMinutes: 30 },
      underfilled,
    )).toEqual([5])
    expect(optimDurationFillCounts(
      { ...inputs, durationMinutes: 60 },
      underfilled,
    )).toEqual([5, 6])
    expect(optimDurationFillCounts(
      { ...inputs, durationMinutes: 90, bodyweightOnly: true },
      underfilled,
    )).toEqual([5])
    expect(optimDurationFillCounts(
      { ...inputs, durationMinutes: 90, circuitsEnabled: true },
      underfilled,
    )).toEqual([5])
    const underfilledCircuit = {
      ...underfilled,
      exercises: underfilled.exercises.map((item) => ({
        ...item,
        groupId: 1,
        groupType: 'circuit' as const,
      })),
    }
    expect(optimDurationFillCounts(
      { ...inputs, durationMinutes: 90, circuitsEnabled: true },
      underfilledCircuit,
    )).toEqual([5, 6, 7])
    // Why: once a real bodyweight circuit forms, the recovered rest reduction
    // creates the same safe search headroom as an equipped circuit. Fallbacks
    // stay restricted so a failed circuit request cannot bloat straight sets.
    expect(optimDurationFillCounts(
      { ...inputs, durationMinutes: 90, circuitsEnabled: true, bodyweightOnly: true },
      underfilledCircuit,
    )).toEqual([5, 6, 7])
    expect(optimDurationFillCounts(
      { ...inputs, durationMinutes: 90, circuitsEnabled: true, bodyweightOnly: true },
      underfilled,
    )).toEqual([5])
    expect(optimDurationFillCounts(
      { ...inputs, nonCoreCountOverride: 3 },
      underfilled,
    )).toEqual([])
    expect(optimDurationFillCounts(
      { ...inputs, goal: 'powerlifting' },
      underfilled,
    )).toEqual([])
    expect(optimDurationFillCounts(
      { ...inputs, goal: 'olympic' },
      underfilled,
    )).toEqual([])
    expect(estimateOptimSessionMinutes(underfilled)).toBe(21)
    expect(withOptimSessionEstimate(underfilled).durationEstimate).toMatchObject({
      sessionProjectedMinutes: 21,
      sessionUtilization: 0.457,
    })
    expect(estimateOptimStrengthStageUtilization(underfilled))
      .toBe(estimateOptimSessionUtilization(underfilled))

    const saturatedStrength = exercise('LONG_HOLD', 'strength', null, 1)
    saturatedStrength.sets[0] = {
      ...saturatedStrength.sets[0],
      reps: undefined,
      durationSeconds: 2040,
      restSeconds: 0,
    }
    const strengthFilled = {
      ...underfilled,
      exercises: [saturatedStrength],
      durationEstimate: {
        ...underfilled.durationEstimate!,
        projectedMinutes: 34,
        utilization: 34 / 46,
      },
    }
    expect(estimateOptimStrengthStageUtilization(strengthFilled)).toBe(0.75)
    expect(optimDurationFillCounts(inputs, strengthFilled)).toEqual([])

    for (const strengthBudgetMinutes of [undefined, 0]) {
      expect(optimDurationFillCounts(inputs, {
        ...underfilled,
        durationEstimate: {
          ...underfilled.durationEstimate!,
          strengthBudgetMinutes,
        },
      })).toEqual([])
    }
  })

  it('keeps strength fill stable when optional stages grow inside a longer session', () => {
    // Why: cardio using more of an 85-minute window must not suppress a safe
    // strength movement when the engine's strength budget is unchanged.
    const cardio = stageExercise('RUN', 'cardio')
    cardio.sets[0].durationSeconds = 42 * 60
    const optionalHeavy = {
      ...result([
        exercise('PRESS', 'strength'),
        exercise('CRUNCH', 'core'),
        cardio,
      ], 50),
      durationEstimate: {
        requestedMinutes: 60,
        projectedMinutes: 50,
        utilization: 50 / 60,
        strengthBudgetMinutes: 46,
      },
      rankedCandidates: Array.from({ length: 8 }, (_, index) => ({
        code: `EXERCISE_${index}`,
        name: `Exercise ${index}`,
        score: 1,
        primaryBucket: null,
        isCore: false,
        breakdown: {},
      })) as OptimDemoResult['rankedCandidates'],
    }

    expect(withOptimSessionEstimate(optionalHeavy).durationEstimate?.sessionUtilization)
      .toBeGreaterThan(OPTIM_DURATION_FILL_TARGET_UTILIZATION)
    expect(estimateOptimStrengthStageUtilization(optionalHeavy))
      .toBeLessThan(OPTIM_DURATION_FILL_TARGET_UTILIZATION)
    expect(optimDurationFillCounts(
      { ...defaultOptimDemoInputs(), durationMinutes: 60 },
      optionalHeavy,
    )).toEqual([5, 6])
  })

  it('accepts only useful, unique, within-window fill that retains the original work', () => {
    const base = result([exercise('PRESS', 'strength'), exercise('CRUNCH', 'core')], 20)
    const candidate = {
      ...result([
        exercise('PRESS', 'strength', null, 2),
        exercise('ROW', 'strength'),
        exercise('CRUNCH', 'core'),
    ], 27.5),
      counts: {
        ...result([], 29).counts,
        requestedNonCore: 2,
        generatedStrength: 2,
        requestedCore: 1,
        generatedCore: 1,
      },
    }
    expect(isOptimDurationFillImprovement(base, candidate, 30)).toBe(true)
    expect(isOptimDurationFillImprovement(base, {
      ...candidate,
      durationEstimate: { ...candidate.durationEstimate!, projectedMinutes: 31 },
    }, 30)).toBe(false)
    expect(isOptimDurationFillImprovement(base, {
      ...candidate,
      exercises: [exercise('ROW', 'strength'), exercise('CRUNCH', 'core')],
    }, 30)).toBe(false)
    expect(isOptimDurationFillImprovement(base, {
      ...candidate,
      exercises: [...candidate.exercises, exercise('ROW', 'strength')],
    }, 30)).toBe(false)

    const longFinalRest = exercise('PRESS', 'strength')
    longFinalRest.sets.at(-1)!.restSeconds = 180
    const guidedBase = result([longFinalRest, exercise('CRUNCH', 'core')], 20)
    const shorterGuidedCandidate = {
      ...candidate,
      durationEstimate: {
        ...candidate.durationEstimate!,
        projectedMinutes: 20.5,
      },
      exercises: [
        exercise('PRESS', 'strength'),
        exercise('ROW', 'strength'),
        exercise('CRUNCH', 'core'),
      ],
    }
    // Why: an added movement can regroup work and erase more final-rest time
    // than its set subtotal adds. A duration-fill candidate must improve the
    // clock the user experiences, not only the legacy subtotal.
    expect(estimateOptimGuidedSessionMinutes(shorterGuidedCandidate))
      .toBeLessThan(estimateOptimGuidedSessionMinutes(guidedBase)!)
    expect(isOptimDurationFillImprovement(guidedBase, shorterGuidedCandidate, 30)).toBe(false)
  })

  it('permits a bounded high-volume concession and equivalent core rotation', () => {
    // Why: a longer plan may exchange two of six sets from one lift for a
    // compatible movement, and core seeding may select an equivalent variant.
    // Neither should make five extra minutes yield less total work.
    const base = result([
      exercise('PRESS', 'strength', null, 6),
      exercise('CRUNCH', 'core', null, 3),
    ], 20)
    const candidate = {
      ...result([
        exercise('PRESS', 'strength', null, 4),
        exercise('ROW', 'strength', null, 3),
        exercise('PLANK', 'core', null, 3),
      ], 27.5),
      counts: {
        ...result([], 28).counts,
        requestedNonCore: 2,
        generatedStrength: 2,
        requestedCore: 1,
        generatedCore: 1,
      },
    }

    expect(isOptimDurationFillImprovement(base, candidate, 30)).toBe(true)
    expect(isOptimDurationFillImprovement(base, {
      ...candidate,
      exercises: [
        exercise('PRESS', 'strength', null, 3),
        exercise('ROW', 'strength', null, 3),
        exercise('PLANK', 'core', null, 3),
      ],
    }, 30)).toBe(false)
    expect(isOptimDurationFillImprovement(base, {
      ...candidate,
      exercises: [
        exercise('PRESS', 'strength', null, 4),
        exercise('ROW', 'strength', null, 3),
        exercise('PLANK', 'core', null, 2),
      ],
    }, 30)).toBe(false)
  })

  it('protects requested grouping and pinned starting work while accessories may rotate', () => {
    const groupedBase = result([
      exercise('PRESS', 'strength', 1),
      exercise('ROW', 'strength', 1),
      exercise('CRUNCH', 'core'),
    ], 20)
    const dissolved = {
      ...result([
        exercise('PRESS', 'strength'),
        exercise('ROW', 'strength'),
        exercise('CURL', 'strength'),
        exercise('CRUNCH', 'core'),
      ], 27),
      counts: {
        ...result([], 27).counts,
        requestedNonCore: 3,
        generatedStrength: 3,
        requestedCore: 1,
        generatedCore: 1,
      },
    }
    expect(isOptimDurationFillImprovement(groupedBase, dissolved, 30)).toBe(false)

    const pinned = exercise('HINGE', 'strength')
    pinned.trace = ['Pinned by starting-exercise input']
    const pinnedBase = result([
      exercise('PRESS', 'strength'),
      exercise('ROW', 'strength'),
      pinned,
      exercise('CRUNCH', 'core'),
    ], 20)
    const rotated = {
      ...dissolved,
      exercises: [
        exercise('PRESS', 'strength'),
        exercise('ROW', 'strength'),
        exercise('CURL', 'strength'),
        exercise('FLY', 'strength'),
        exercise('CRUNCH', 'core'),
      ],
      counts: { ...dissolved.counts, requestedNonCore: 4, generatedStrength: 4 },
    }
    expect(isOptimDurationFillImprovement(pinnedBase, rotated, 30)).toBe(false)
  })

  it('allows equivalent mobility rotation while locking optional-stage prescriptions and cardio identity', () => {
    // Why: adding a lift can make a different cooldown more relevant. That
    // should not veto useful work when the stage duration is unchanged, while
    // an explicitly selected cardio exercise must never silently change.
    const base = result([
      exercise('PRESS', 'strength'),
      exercise('CRUNCH', 'core'),
      stageExercise('CHEST_COOLDOWN', 'mobilityCooldown'),
    ], 20)
    const rotated = {
      ...result([
        exercise('PRESS', 'strength'),
        exercise('ROW', 'strength'),
        exercise('CRUNCH', 'core'),
        stageExercise('BACK_COOLDOWN', 'mobilityCooldown'),
      ], 26.5),
      counts: {
        ...result([], 28).counts,
        requestedNonCore: 2,
        generatedStrength: 2,
        requestedCore: 1,
        generatedCore: 1,
      },
    }
    expect(isOptimDurationFillImprovement(base, rotated, 30)).toBe(true)
    expect(isOptimDurationFillImprovement(base, {
      ...rotated,
      exercises: rotated.exercises.map((item) => item.phase === 'mobilityCooldown'
        ? {
            ...item,
            sets: [{ ...item.sets[0], durationSeconds: 30 }],
          }
        : item),
    }, 30)).toBe(false)

    const cardioBase = {
      ...base,
      exercises: [
        exercise('PRESS', 'strength'),
        exercise('CRUNCH', 'core'),
        stageExercise('BIKE', 'cardio'),
      ],
    }
    expect(isOptimDurationFillImprovement(cardioBase, {
      ...rotated,
      exercises: [
        exercise('PRESS', 'strength'),
        exercise('ROW', 'strength'),
        exercise('CRUNCH', 'core'),
        stageExercise('ROWER', 'cardio'),
      ],
    }, 30)).toBe(false)
  })

  it('tops up accessory volume with copied final sets only through the extra-set seam', () => {
    // Why: exercise-count fill alone left long windows around 75% used. The
    // top-up may only append a copy of a lift's own final working set, never
    // touch grouped or max-effort work, and never break the hard ceiling.
    const base = result([
      exercise('MAIN', 'strength'),
      exercise('ACCESSORY_A', 'strength'),
      exercise('GROUPED_A', 'strength', 1),
      exercise('GROUPED_B', 'strength', 1),
      { ...exercise('MAX_EFFORT', 'strength'), maxEffort: true },
      exercise('CORE_FINISHER', 'core'),
    ], 20)
    const inputs = {
      ...defaultOptimDemoInputs({ generationDate: new Date('2026-07-17T00:00:00.000Z') }),
      durationMinutes: 46,
      durationFillExtraSetsEnabled: true,
    }

    const omitted = fillOptimExtraWorkingSetsToSessionTarget(base, {
      ...inputs,
      durationFillExtraSetsEnabled: undefined,
    })
    expect(omitted).toBe(base)
    const overridden = fillOptimExtraWorkingSetsToSessionTarget(base, {
      ...inputs,
      nonCoreCountOverride: 4,
    })
    expect(overridden).toBe(base)

    // A 46-minute request sits in the long-window regime: two copied sets.
    const filled = fillOptimExtraWorkingSetsToSessionTarget(base, inputs)
    const setCountsByCode = new Map(
      filled.exercises.map((item) => [item.code, item.sets.length]),
    )
    expect(setCountsByCode.get('MAIN')).toBe(5)
    expect(setCountsByCode.get('ACCESSORY_A')).toBe(5)
    expect(setCountsByCode.get('CORE_FINISHER')).toBe(5)
    expect(setCountsByCode.get('GROUPED_A')).toBe(3)
    expect(setCountsByCode.get('GROUPED_B')).toBe(3)
    expect(setCountsByCode.get('MAX_EFFORT')).toBe(3)
    const accessory = filled.exercises.find((item) => item.code === 'ACCESSORY_A')!
    expect(accessory.sets.at(-1)).toEqual({ ...accessory.sets.at(-3)!, setNumber: 5 })
    expect(accessory.trace.at(-1)).toContain('added one working set')
    const guided = estimateOptimGuidedSessionMinutes(filled)
    expect(guided).not.toBeNull()
    expect(guided!).toBeLessThanOrEqual(46)
    expect(filled.events.at(-1)).toContain('working sets of accessory volume')

    // Below the long-window threshold each lift may gain only one set.
    const shortBase = result([
      exercise('MAIN', 'strength'),
      exercise('ACCESSORY_A', 'strength'),
    ], 12)
    Object.assign(shortBase.durationEstimate!, { requestedMinutes: 40 })
    const shortFilled = fillOptimExtraWorkingSetsToSessionTarget(shortBase, inputs)
    expect(shortFilled.exercises.map((item) => item.sets.length)).toEqual([4, 4])

    // A session already near its window is left alone.
    const nearFull = result([exercise('ONLY', 'strength')], 45)
    Object.assign(nearFull.durationEstimate!, { requestedMinutes: 10 })
    expect(fillOptimExtraWorkingSetsToSessionTarget(nearFull, inputs)).toBe(nearFull)

    // Olympic strength work keeps its recovered volume; core may still fill.
    const olympic = fillOptimExtraWorkingSetsToSessionTarget(base, {
      ...inputs,
      goal: 'olympic',
    })
    expect(olympic.exercises.find((item) => item.code === 'MAIN')?.sets).toHaveLength(3)
    expect(olympic.exercises.find((item) => item.code === 'CORE_FINISHER')?.sets).toHaveLength(5)
  })

  it('trims lower-priority ramp sets before a session estimate can exceed its window', () => {
    const press = exercise('PRESS', 'strength')
    press.sets = [
      { setNumber: 1, setType: 'warmup', reps: 5, restSeconds: 45 },
      { setNumber: 2, setType: 'warmup', reps: 5, restSeconds: 45 },
      ...press.sets.map((set, index) => ({ ...set, setNumber: index + 3 })),
    ]
    const over = {
      ...result([press], 5.5),
      durationEstimate: {
        requestedMinutes: 5,
        projectedMinutes: 5.5,
        utilization: 1.1,
      },
    }
    const trimmed = trimOptimWarmupsToSessionTarget(over)

    expect(trimmed.exercises[0].sets.filter((set) => set.setType === 'warmup')).toHaveLength(1)
    expect(trimmed.exercises[0].sets.filter((set) => set.setType === 'normal')).toHaveLength(3)
    expect(trimmed.durationEstimate).toMatchObject({
      projectedMinutes: 4.5,
      sessionProjectedMinutes: 5,
      sessionUtilization: 1,
    })
    expect(trimmed.events).toContainEqual(expect.stringContaining('removed 1 lower-priority ramp set'))
  })

  it('trims ramp sets when guided intermediate rest crosses an otherwise exact target', () => {
    // Why: WorkoutScreen starts the REST timer after an exercise's final set.
    // A plan that fits only because the engine omits that rest misses the
    // user's selected window even though its legacy session estimate is exact.
    const press = exercise('PRESS', 'strength')
    press.sets = [
      { setNumber: 1, setType: 'warmup', reps: 5, restSeconds: 60 },
      ...press.sets.map((set, index) => ({ ...set, setNumber: index + 2 })),
    ]
    const exactLegacy = {
      ...result([press, exercise('CRUNCH', 'core', null, 1)], 5.25),
      durationEstimate: {
        requestedMinutes: 6.25,
        projectedMinutes: 5.25,
        utilization: 5.25 / 6.25,
      },
    }

    expect(estimateOptimSessionMinutes(exactLegacy)).toBe(6.3)
    expect(estimateOptimGuidedSessionMinutes(exactLegacy)).toBe(6.8)

    const trimmed = trimOptimWarmupsToSessionTarget(exactLegacy)
    expect(trimmed.exercises[0].sets.some((set) => set.setType === 'warmup')).toBe(false)
    expect(trimmed.exercises[0].sets.filter((set) => set.setType === 'normal')).toHaveLength(3)
    expect(estimateOptimGuidedSessionMinutes(trimmed)).toBe(5.5)
  })

  it('targets only the recovered 46-49 strength-budget core regression', () => {
    const inputs = defaultOptimDemoInputs()
    expect(resolveOptimCoreRestoreTarget(inputs, result([], 20, 45))).toBeNull()
    expect(resolveOptimCoreRestoreTarget(inputs, result([], 20, 46))).toBe(2)
    expect(resolveOptimCoreRestoreTarget(inputs, result([], 20, 49))).toBe(2)
    expect(resolveOptimCoreRestoreTarget(inputs, {
      ...result([], 20, 50),
      counts: { ...result([], 20, 50).counts, computedCore: 2 },
    })).toBeNull()
    expect(resolveOptimCoreRestoreTarget({ ...inputs, coreCountOverride: 1 }, result([], 20))).toBeNull()
  })

  it('accepts a material core restore with only a bounded one-set concession', () => {
    const base = result([exercise('PRESS', 'strength', null, 4), exercise('CRUNCH', 'core')], 20)
    const appended = result([
      exercise('PRESS', 'strength', null, 3),
      exercise('CRUNCH', 'core'),
      exercise('PLANK', 'core'),
    ], 24)
    expect(isOptimCoreRestoreImprovement(base, appended, 46)).toBe(true)

    const twoSetConcession = result([
      exercise('PRESS', 'strength', null, 2),
      exercise('CRUNCH', 'core'),
      exercise('PLANK', 'core', null, 4),
    ], 24)
    expect(isOptimCoreRestoreImprovement(base, twoSetConcession, 46)).toBe(false)

    const pairedWithAppendedCore = result([
      exercise('PRESS', 'strength', null, 3),
      exercise('CRUNCH', 'core', 1),
      exercise('PLANK', 'core', 1),
    ], 24)
    expect(isOptimCoreRestoreImprovement(base, pairedWithAppendedCore, 46)).toBe(true)
    const circuitPairedWithAppendedCore = result([
      exercise('PRESS', 'strength', null, 3),
      exercise('CRUNCH', 'core', 1, 3, 'circuit'),
      exercise('PLANK', 'core', 1, 3, 'circuit'),
    ], 24)
    expect(isOptimCoreRestoreImprovement(base, circuitPairedWithAppendedCore, 46)).toBe(true)
    const regroupedStrength = result([
      exercise('PRESS', 'strength', 1, 3),
      exercise('CRUNCH', 'core', 1),
      exercise('PLANK', 'core'),
    ], 24)
    expect(isOptimCoreRestoreImprovement(base, regroupedStrength, 46)).toBe(false)
    const ambiguousCoreGroup = result([
      exercise('PRESS', 'strength', null, 3),
      exercise('CRUNCH', 'core', 1),
      exercise('PLANK', 'core', 2),
    ], 24)
    expect(isOptimCoreRestoreImprovement(base, ambiguousCoreGroup, 46)).toBe(false)
    expect(isOptimCoreRestoreImprovement(base, result(appended.exercises, 47), 46)).toBe(false)
    expect(isOptimCoreRestoreImprovement(base, result(appended.exercises, 23), 24)).toBe(false)
  })

  it('shortens a trailing cooldown before sacrificing selected stages or working sets', () => {
    // Why: a real 25-minute specialized plan can exceed the selected window
    // by only transition overhead when no ramp sets exist to trim.
    const cooldown = stageExercise('COOLDOWN', 'mobilityCooldown')
    cooldown.sets[0].durationSeconds = 60
    const over = {
      ...result([
        exercise('PRESS', 'strength'),
        cooldown,
      ], 4.5),
      durationEstimate: {
        requestedMinutes: 5.8,
        projectedMinutes: 4.5,
        utilization: 4.5 / 5.8,
      },
    }
    const fitted = fitOptimOptionalStagesToSessionTarget(over)

    expect(fitted.exercises.map((item) => item.code)).toEqual(['PRESS', 'COOLDOWN'])
    expect(fitted.exercises[0].sets).toEqual(over.exercises[0].sets)
    expect(fitted.exercises[1].sets[0].durationSeconds).toBe(48)
    expect(fitted.durationEstimate?.sessionProjectedMinutes).toBe(5.3)
    expect(estimateOptimGuidedSessionMinutes(fitted)).toBe(5.8)
    expect(fitted.events).toContainEqual(expect.stringContaining('preserving every strength and core working set'))
  })

  it('removes a working set only when it is a closer guided-time match', () => {
    // Why: short strength plans can have no ramp or optional work left to
    // trim. One set should go only when its work+rest is closer to the user's
    // target than keeping the small overrun.
    const plan = result([
      exercise('PRESS', 'strength'),
      exercise('ROW', 'strength'),
      exercise('CRUNCH', 'core'),
    ], 10.5)
    plan.durationEstimate = {
      requestedMinutes: 12,
      projectedMinutes: 10.5,
      utilization: 10.5 / 12,
      sessionProjectedMinutes: 12,
      sessionUtilization: 1,
    }

    const trimmed = trimOptimWorkingSetsToGuidedTarget(plan)
    expect(trimmed.exercises.map((item) =>
      item.sets.filter((set) => set.setType === 'normal').length)).toEqual([3, 3, 2])
    expect(estimateOptimGuidedSessionMinutes(trimmed)).toBe(11.5)
    expect(trimmed.events).toContainEqual(expect.stringContaining('closer to the selected window'))

    const smallOverrun = {
      ...plan,
      durationEstimate: {
        ...plan.durationEstimate,
        requestedMinutes: 12.7,
      },
    }
    expect(trimOptimWorkingSetsToGuidedTarget(smallOverrun)).toBe(smallOverrun)
  })

  it('removes a complete grouped round instead of unbalancing its members', () => {
    const plan = result([
      exercise('HOLD_A', 'core', 1),
      exercise('HOLD_B', 'core', 1),
    ], 7)
    plan.durationEstimate = {
      requestedMinutes: 6,
      projectedMinutes: 7,
      utilization: 7 / 6,
      sessionProjectedMinutes: 8,
      sessionUtilization: 8 / 6,
    }

    const trimmed = trimOptimWorkingSetsToGuidedTarget(plan)
    expect(trimmed.exercises.map((item) =>
      item.sets.filter((set) => set.setType === 'normal').length)).toEqual([2, 2])
    expect(trimmed.exercises.every((item) => item.groupId === 1)).toBe(true)
    expect(estimateOptimGuidedSessionMinutes(trimmed)).toBe(5.5)
  })

  it('fails closed when the restore changes composition or is not a strict aggregate improvement', () => {
    const base = result([exercise('PRESS', 'strength'), exercise('CRUNCH', 'core')], 20)
    const validExercises = [
      exercise('PRESS', 'strength'),
      exercise('CRUNCH', 'core'),
      exercise('PLANK', 'core'),
    ]

    expect(isOptimCoreRestoreImprovement(base, result([
      exercise('ROW', 'strength'),
      exercise('CRUNCH', 'core'),
      exercise('PLANK', 'core'),
    ], 24), 46)).toBe(false)
    expect(isOptimCoreRestoreImprovement(base, result([
      ...validExercises,
      exercise('DEAD_BUG', 'core'),
    ], 25), 46)).toBe(false)
    expect(isOptimCoreRestoreImprovement(base, result(validExercises, 20), 46)).toBe(false)
  })
})
