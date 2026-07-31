/**
 * ForgeWorkshop: batch-test the Forge generator against the real mobile seed
 * catalog. Cold scenarios sweep the whole control matrix; journeys train an
 * athlete back-to-back and feed every completed session back into history so
 * recovery, balance, progression, and variety face the same conditions users
 * create.
 *
 *   bun run workshop                        # default 500-generation run
 *   bun run workshop --count 120            # smaller cold batch
 *   bun run workshop --label my-change      # tag the artifacts
 *   bun run workshop --repro cold-17        # one scenario, full trace
 *   bun run workshop --catalog my.json      # bring your own exercise catalog
 */
import { loadWorkshopCatalog } from './catalog'
import { compareRuns } from './compare'
import { runEdgeCases } from './edges'
import { evaluateGeneration, evaluateJourney, selectionJaccard } from './metrics'
import { writeWorkshopReport, type ColdRunRecord } from './report'
import {
  buildColdScenarios,
  WORKSHOP_PERSONAS,
  type ColdScenario,
} from './scenarios'
import {
  buildWorkshopCatalog,
  generateForWorkshop,
  emptyUsageStats,
  runJourney,
  type GenerationRequest,
  type JourneyPlanTemplate,
  type WorkshopCatalog,
} from './simulate'

const GENERATION_DATE_ISO = '2026-07-15T17:00:00.000Z'
const JOURNEY_START_ISO = '2026-06-01T17:00:00.000Z'
const DEFAULT_RUN_SEED = 20260730

/** Back-to-back heavy: daily training, AM/PM doubles, streaks, rotations. */
const JOURNEY_TEMPLATES: JourneyPlanTemplate[] = [
  { key: 'alex-daily-fresh', personaKey: 'alex-intermediate-strength', sessions: 14, restPattern: [1], split: 'fresh', durationMinutes: 45, grouping: 'straight' },
  { key: 'alex-am-pm-doubles', personaKey: 'alex-intermediate-strength', sessions: 10, restPattern: [0, 1], split: 'fresh', durationMinutes: 30, grouping: 'straight' },
  { key: 'bella-home-circuit-days', personaKey: 'bella-beginner-tone', sessions: 12, restPattern: [1, 1, 2], split: 'fresh', durationMinutes: 30, grouping: 'circuits' },
  { key: 'bella-lunch-streak', personaKey: 'bella-beginner-tone', sessions: 7, restPattern: [1], split: 'fresh', durationMinutes: 20, grouping: 'straight', warmupSets: false },
  { key: 'carlos-ppl', personaKey: 'carlos-intermediate-bodybuilding', sessions: 12, restPattern: [1], split: 'ppl', durationMinutes: 60, grouping: 'straight' },
  { key: 'dana-powerlifting-week', personaKey: 'dana-advanced-powerlifting', sessions: 10, restPattern: [1, 2], split: 'fresh', durationMinutes: 75, grouping: 'straight', rpeLoggingRate: 1 },
  { key: 'eli-bodyweight-daily', personaKey: 'eli-beginner-bodyweight', sessions: 14, restPattern: [1], split: 'fresh', durationMinutes: 30, grouping: 'straight', rpeLoggingRate: 0 },
  { key: 'fran-knee-home', personaKey: 'fran-intermediate-knee', sessions: 10, restPattern: [2], split: 'fresh', durationMinutes: 40, grouping: 'straight', cooldown: true },
  { key: 'greg-olympic-block', personaKey: 'greg-advanced-olympic', sessions: 10, restPattern: [1, 2], split: 'fresh', durationMinutes: 60, grouping: 'straight' },
  { key: 'hana-upper-lower', personaKey: 'hana-intermediate-strength', sessions: 12, restPattern: [1], split: 'upperLower', durationMinutes: 50, grouping: 'straight' },
  { key: 'ivan-easing-in', personaKey: 'ivan-beginner-home', sessions: 8, restPattern: [2, 3], split: 'fresh', durationMinutes: 30, grouping: 'straight', cardio: true },
  { key: 'jude-anonymous-supersets', personaKey: 'jude-anonymous-general', sessions: 8, restPattern: [1, 2], split: 'fresh', durationMinutes: 45, grouping: 'supersets' },
]

function requestForScenario(scenario: ColdScenario): GenerationRequest {
  return {
    durationMinutes: scenario.durationMinutes,
    goal: scenario.goal,
    experience: scenario.experience,
    split: scenario.split,
    gear: scenario.gear,
    grouping: scenario.grouping,
    warmupSets: scenario.warmupSets,
    cardio: scenario.cardio,
    cooldown: scenario.cooldown,
    seed: scenario.seed,
    generationDateIso: scenario.generationDateIso,
  }
}

function contextForScenario(scenario: ColdScenario) {
  return {
    completedWorkouts: [],
    muscleUsageStats: emptyUsageStats(),
    bodyWeightKg: scenario.persona.bodyWeightKg,
    gender: scenario.persona.gender,
    ageYears: scenario.persona.ageYears,
    injuries: scenario.persona.injuries,
  }
}

function runColdBatch(
  catalog: WorkshopCatalog,
  scenarios: ColdScenario[],
): ColdRunRecord[] {
  const records: ColdRunRecord[] = []
  for (const [index, scenario] of scenarios.entries()) {
    const request = requestForScenario(scenario)
    const outcome = generateForWorkshop(catalog, request, contextForScenario(scenario))
    const evaluation = evaluateGeneration(catalog, request, outcome)

    // Spot checks on a deterministic subsample: identical re-run must match
    // byte-for-byte; a shuffle (seed+1) should move the selection.
    const spot = index % 12 === 0
    let deterministic: boolean | null = null
    let shuffleJaccard: number | null = null
    if (spot) {
      const rerun = generateForWorkshop(catalog, request, contextForScenario(scenario))
      deterministic =
        JSON.stringify(rerun.workoutData) === JSON.stringify(outcome.workoutData)
      const shuffled = generateForWorkshop(
        catalog,
        { ...request, seed: request.seed + 1 },
        contextForScenario(scenario),
      )
      shuffleJaccard = selectionJaccard(outcome.result, shuffled.result)
    }

    records.push({
      scenario,
      evaluation,
      notices: outcome.notices,
      events: evaluation.violations.length > 0 ? outcome.result.events : [],
      titles: '',
      shuffleJaccard,
      deterministic,
    })
    if ((index + 1) % 50 === 0) {
      console.log(`  cold ${index + 1}/${scenarios.length}`)
    }
  }
  return records
}

function reproScenario(catalog: WorkshopCatalog, scenarios: ColdScenario[], id: string) {
  const scenario = scenarios.find((candidate) => candidate.id === id)
  if (!scenario) {
    console.error(`No scenario ${id} in this run configuration.`)
    process.exit(1)
  }
  const request = requestForScenario(scenario)
  const outcome = generateForWorkshop(catalog, request, contextForScenario(scenario))
  const evaluation = evaluateGeneration(catalog, request, outcome)
  console.log(JSON.stringify({
    scenario,
    notices: outcome.notices,
    counts: outcome.result.counts,
    durationEstimate: outcome.result.durationEstimate,
    guidedMinutes: outcome.guidedMinutes,
    evaluation,
    events: outcome.result.events,
    exercises: outcome.result.exercises.map((exercise) => ({
      code: exercise.code,
      phase: exercise.phase,
      bucket: exercise.primaryBucket,
      group: exercise.groupId != null ? `${exercise.groupType}#${exercise.groupId}` : null,
      schemeSource: exercise.schemeSource,
      sets: exercise.sets.map((set) =>
        [
          set.setType === 'warmup' ? 'W' : 'S',
          set.reps != null ? `${set.reps}r` : null,
          set.weightKg != null ? `${set.weightKg}kg` : null,
          set.durationSeconds != null ? `${set.durationSeconds}s` : null,
          set.targetRpe != null ? `RPE${set.targetRpe}` : null,
          `rest${set.restSeconds}`,
        ].filter(Boolean).join(' ')),
      trace: exercise.trace,
    })),
  }, null, 2))
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (name: string): string | null => {
    const index = args.indexOf(`--${name}`)
    return index >= 0 ? args[index + 1] ?? null : null
  }

  const compareIndex = args.indexOf('--compare')
  if (compareIndex >= 0) {
    const pathA = args[compareIndex + 1]
    const pathB = args[compareIndex + 2]
    if (!pathA || !pathB) {
      console.error('Usage: --compare <runA.json> <runB.json>')
      process.exit(1)
    }
    compareRuns(pathA, pathB)
    return
  }

  const coldCount = Number(flag('count') ?? 373)
  const label = flag('label') ?? 'baseline'
  const runSeed = Number(flag('seed') ?? DEFAULT_RUN_SEED)
  // Scheme selection is day-of-year driven; --date proves date robustness.
  const generationDateIso = flag('date')
    ? new Date(`${flag('date')}T17:00:00.000Z`).toISOString()
    : GENERATION_DATE_ISO
  const startedAtIso = new Date().toISOString()

  console.log('Loading mobile seed catalog...')
  const exercises = await loadWorkshopCatalog()
  const catalog = buildWorkshopCatalog(exercises)
  console.log(`Catalog ready: ${exercises.length} exercises, ${catalog.allEquipmentCodes.length} equipment codes (${catalog.homeEquipmentCodes.length} home).`)

  const scenarios = buildColdScenarios({
    count: coldCount,
    runSeed,
    generationDateIso,
  })

  const repro = flag('repro')
  if (repro) {
    reproScenario(catalog, scenarios, repro)
    return
  }

  console.log(`Running ${scenarios.length} cold scenarios...`)
  const coldRecords = runColdBatch(catalog, scenarios)

  console.log('Running edge cases...')
  const edgeRecords = runEdgeCases(catalog)
  for (const edge of edgeRecords) {
    const problems = [...edge.evaluation.violations, ...edge.edgeViolations]
    console.log(`  ${problems.length === 0 ? 'ok  ' : 'FAIL'} ${edge.key}${problems.length > 0 ? ': ' + problems.join('; ') : ''}`)
  }

  console.log(`Running ${JOURNEY_TEMPLATES.length} journeys...`)
  const journeys = JOURNEY_TEMPLATES.map((template, index) => {
    const persona = WORKSHOP_PERSONAS.find((candidate) => candidate.key === template.personaKey)
    if (!persona) throw new Error(`Unknown persona ${template.personaKey}`)
    const records = runJourney(catalog, persona, template, {
      startDateIso: JOURNEY_START_ISO,
      runSeed: runSeed ^ (index * 15485863),
    })
    const evaluation = evaluateJourney(catalog, template.key, persona.key, records)
    console.log(`  ${template.key}: ${records.length} sessions, ${evaluation.violationCount} violations`)
    return evaluation
  })

  const { summary, reportPath, dataPath } = writeWorkshopReport({
    label,
    runSeed,
    startedAtIso,
    catalogSize: exercises.length,
    coldRecords,
    journeys,
    edgeRecords,
  })

  console.log('')
  console.log(`Total generations: ${summary.totalGenerations}`)
  console.log(`Violations: ${JSON.stringify(summary.violationsByCategory)}`)
  console.log(`Warnings: ${JSON.stringify(summary.warningsByCategory)}`)
  console.log(`Report: ${reportPath}`)
  console.log(`Data: ${dataPath}`)
}

await main()
