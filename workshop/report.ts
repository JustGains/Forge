/**
 * ForgeWorkshop aggregation and reporting: one JSON artifact with everything,
 * one human report with the story. Every failing scenario keeps a repro id.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { WORKSHOP_DIR } from './catalog'
import type { EdgeCaseRecord } from './edges'
import type { JourneyEvaluation, ScenarioEvaluation } from './metrics'
import type { ColdScenario } from './scenarios'

export type ColdRunRecord = {
  scenario: ColdScenario
  evaluation: ScenarioEvaluation
  notices: string[]
  events: string[]
  titles: string
  shuffleJaccard: number | null
  deterministic: boolean | null
}

export type WorkshopRunSummary = {
  label: string
  startedAtIso: string
  runSeed: number
  catalogSize: number
  coldCount: number
  journeyCount: number
  journeySessionCount: number
  totalGenerations: number
  violationsByCategory: Record<string, number>
  warningsByCategory: Record<string, number>
  failingScenarioIds: string[]
}

function categorize(message: string): string {
  const rules: Array<[RegExp, string]> = [
    [/^duplicate lift/, 'duplicate-lift'],
    [/split got/, 'split-violation'],
    [/needs unavailable equipment/, 'equipment-leak'],
    [/rest .* out of range/, 'rest-range'],
    [/reps .* out of range/, 'reps-range'],
    [/high reps/, 'high-reps'],
    [/RPE .* out of range/, 'rpe-range'],
    [/weight .* out of range/, 'weight-range'],
    [/unrounded weight/, 'unrounded-weight'],
    [/bodyweight-only plan prescribed/, 'bodyweight-load-leak'],
    [/warmup .*>= working/, 'warmup-heavier'],
    [/stranded .* group/, 'stranded-group'],
    [/superset group .* members/, 'superset-size'],
    [/circuit group .* members/, 'circuit-size'],
    [/missing catalog codes/, 'adapter-missing-codes'],
    [/emitted a completed set/, 'adapter-completed-set'],
    [/emitted a logged value/, 'adapter-logged-value'],
    [/silent overrun/, 'silent-overrun'],
    [/unconfessed/, 'unconfessed-omission'],
    [/quiet underfill/, 'quiet-underfill'],
    [/phase order/, 'phase-order'],
    [/empty workout/, 'empty-workout'],
    [/missing from catalog/, 'selection-missing-code'],
  ]
  for (const [pattern, category] of rules) {
    if (pattern.test(message)) return category
  }
  return 'other'
}

function tally(messages: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const message of messages) {
    const category = categorize(message)
    counts[category] = (counts[category] ?? 0) + 1
  }
  return counts
}

function quantile(sortedValues: number[], fraction: number): number | null {
  if (sortedValues.length === 0) return null
  const position = (sortedValues.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const weight = position - lower
  return sortedValues[lower]! * (1 - weight) + sortedValues[upper]! * weight
}

function formatQuantiles(values: number[], digits = 2): string {
  const sorted = [...values].sort((left, right) => left - right)
  const p10 = quantile(sorted, 0.1)
  const p50 = quantile(sorted, 0.5)
  const p90 = quantile(sorted, 0.9)
  if (p10 == null || p50 == null || p90 == null) return 'n/a'
  return `p10 ${p10.toFixed(digits)} · p50 ${p50.toFixed(digits)} · p90 ${p90.toFixed(digits)}`
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const groupKey = key(item)
    const bucket = groups.get(groupKey) ?? []
    bucket.push(item)
    groups.set(groupKey, bucket)
  }
  return groups
}

export function writeWorkshopReport(options: {
  label: string
  runSeed: number
  startedAtIso: string
  catalogSize: number
  coldRecords: ColdRunRecord[]
  journeys: JourneyEvaluation[]
  edgeRecords?: EdgeCaseRecord[]
}): { summary: WorkshopRunSummary; reportPath: string; dataPath: string } {
  const { coldRecords, journeys } = options
  const edgeRecords = options.edgeRecords ?? []
  const runsDir = resolve(WORKSHOP_DIR, 'runs')
  mkdirSync(runsDir, { recursive: true })
  const stamp = options.startedAtIso.replace(/[:.]/g, '-')
  const dataPath = resolve(runsDir, `${stamp}-${options.label}.json`)
  const reportPath = resolve(runsDir, `${stamp}-${options.label}.md`)

  const allViolations = [
    ...coldRecords.flatMap((record) => record.evaluation.violations),
    ...journeys.flatMap((journey) => journey.perSession.flatMap((session) => session.violations)),
    ...edgeRecords.flatMap((edge) => [...edge.evaluation.violations, ...edge.edgeViolations]),
  ]
  const allWarnings = [
    ...coldRecords.flatMap((record) => record.evaluation.warnings),
    ...journeys.flatMap((journey) => journey.perSession.flatMap((session) => session.warnings)),
  ]
  const journeySessionCount = journeys.reduce((sum, journey) => sum + journey.sessionCount, 0)
  const failingScenarioIds = coldRecords
    .filter((record) => record.evaluation.violations.length > 0)
    .map((record) => record.scenario.id)

  const summary: WorkshopRunSummary = {
    label: options.label,
    startedAtIso: options.startedAtIso,
    runSeed: options.runSeed,
    catalogSize: options.catalogSize,
    coldCount: coldRecords.length,
    journeyCount: journeys.length,
    journeySessionCount,
    totalGenerations: coldRecords.length + journeySessionCount + edgeRecords.length,
    violationsByCategory: tally(allViolations),
    warningsByCategory: tally(allWarnings),
    failingScenarioIds,
  }

  writeFileSync(dataPath, JSON.stringify({ summary, coldRecords, journeys, edgeRecords }, null, 1))

  const lines: string[] = []
  lines.push(`# ForgeWorkshop run: ${options.label}`)
  lines.push('')
  lines.push(`Started ${options.startedAtIso} · run seed ${options.runSeed} · catalog ${options.catalogSize} exercises`)
  lines.push(`${summary.totalGenerations} generations (${summary.coldCount} cold + ${journeySessionCount} journey sessions across ${journeys.length} journeys)`)
  lines.push('')

  lines.push('## Hard violations')
  lines.push('')
  const violationEntries = Object.entries(summary.violationsByCategory).sort((a, b) => b[1] - a[1])
  if (violationEntries.length === 0) {
    lines.push('None. Every generated workout passed every hard invariant.')
  } else {
    lines.push('| Category | Count |')
    lines.push('|---|---:|')
    for (const [category, count] of violationEntries) lines.push(`| ${category} | ${count} |`)
    lines.push('')
    lines.push('Failing cold scenarios: ' + (failingScenarioIds.slice(0, 40).join(', ') || 'none'))
    const failingJourneys = journeys.filter((journey) => journey.violationCount > 0)
    if (failingJourneys.length > 0) {
      lines.push('Failing journeys: ' + failingJourneys.map((journey) => `${journey.key} (${journey.violationCount})`).join(', '))
    }
  }
  lines.push('')

  lines.push('## Warnings')
  lines.push('')
  const warningEntries = Object.entries(summary.warningsByCategory).sort((a, b) => b[1] - a[1])
  if (warningEntries.length === 0) lines.push('None.')
  else {
    lines.push('| Category | Count |')
    lines.push('|---|---:|')
    for (const [category, count] of warningEntries) lines.push(`| ${category} | ${count} |`)
  }
  lines.push('')

  const metric = (name: string) =>
    coldRecords.map((record) => record.evaluation.metrics[name]).filter((value): value is number => value != null)
  lines.push('## Cold-scenario quality')
  lines.push('')
  lines.push(`- Utilization (guided/requested): ${formatQuantiles(metric('utilization'))}`)
  lines.push(`- Fill ratio (lifts generated/requested): ${formatQuantiles(metric('fillRatio'))}`)
  lines.push(`- Load coverage (weighted lifts with a load): ${formatQuantiles(metric('loadCoverage'))}`)
  lines.push(`- Bucket entropy (working-set spread): ${formatQuantiles(metric('bucketEntropy'))}`)
  lines.push(`- Equipment switches between adjacent lifts: ${formatQuantiles(metric('equipmentSwitches'), 1)}`)
  lines.push(`- Generation time ms: ${formatQuantiles(metric('elapsedMs'), 0)}`)
  const shuffles = coldRecords
    .map((record) => record.shuffleJaccard)
    .filter((value): value is number => value != null)
  if (shuffles.length > 0) {
    lines.push(`- Shuffle overlap (Jaccard, lower = fresher shuffles): ${formatQuantiles(shuffles)}`)
  }
  const determinismChecks = coldRecords.filter((record) => record.deterministic != null)
  const determinismFailures = determinismChecks.filter((record) => record.deterministic === false)
  lines.push(`- Determinism: ${determinismChecks.length - determinismFailures.length}/${determinismChecks.length} re-runs byte-identical${determinismFailures.length > 0 ? ` — FAILURES: ${determinismFailures.map((record) => record.scenario.id).join(', ')}` : ''}`)
  lines.push('')

  lines.push('### By goal')
  lines.push('')
  lines.push('| Goal | Scenarios | Violations | Median utilization | Median fill |')
  lines.push('|---|---:|---:|---:|---:|')
  for (const [goal, records] of groupBy(coldRecords, (record) => record.scenario.goal)) {
    const violationCount = records.reduce((sum, record) => sum + record.evaluation.violations.length, 0)
    const utilizations = records.map((record) => record.evaluation.metrics.utilization).filter((value): value is number => value != null).sort((a, b) => a - b)
    const fills = records.map((record) => record.evaluation.metrics.fillRatio).filter((value): value is number => value != null).sort((a, b) => a - b)
    lines.push(`| ${goal} | ${records.length} | ${violationCount} | ${quantile(utilizations, 0.5)?.toFixed(2) ?? 'n/a'} | ${quantile(fills, 0.5)?.toFixed(2) ?? 'n/a'} |`)
  }
  lines.push('')

  lines.push('### By gear')
  lines.push('')
  lines.push('| Gear | Scenarios | Violations | Median utilization | Median load coverage |')
  lines.push('|---|---:|---:|---:|---:|')
  for (const [gear, records] of groupBy(coldRecords, (record) => record.scenario.gear)) {
    const violationCount = records.reduce((sum, record) => sum + record.evaluation.violations.length, 0)
    const utilizations = records.map((record) => record.evaluation.metrics.utilization).filter((value): value is number => value != null).sort((a, b) => a - b)
    const coverages = records.map((record) => record.evaluation.metrics.loadCoverage).filter((value): value is number => value != null).sort((a, b) => a - b)
    lines.push(`| ${gear} | ${records.length} | ${violationCount} | ${quantile(utilizations, 0.5)?.toFixed(2) ?? 'n/a'} | ${quantile(coverages, 0.5)?.toFixed(2) ?? 'n/a'} |`)
  }
  lines.push('')

  lines.push('### By duration')
  lines.push('')
  lines.push('| Minutes | Scenarios | Violations | Median utilization |')
  lines.push('|---:|---:|---:|---:|')
  for (const [duration, records] of [...groupBy(coldRecords, (record) => String(record.scenario.durationMinutes))].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const violationCount = records.reduce((sum, record) => sum + record.evaluation.violations.length, 0)
    const utilizations = records.map((record) => record.evaluation.metrics.utilization).filter((value): value is number => value != null).sort((a, b) => a - b)
    lines.push(`| ${duration} | ${records.length} | ${violationCount} | ${quantile(utilizations, 0.5)?.toFixed(2) ?? 'n/a'} |`)
  }
  lines.push('')

  if (edgeRecords.length > 0) {
    lines.push('## Edge cases')
    lines.push('')
    lines.push('| Edge | Result | Notes |')
    lines.push('|---|---|---|')
    for (const edge of edgeRecords) {
      const problems = [...edge.evaluation.violations, ...edge.edgeViolations]
      lines.push(`| ${edge.key} | ${problems.length === 0 ? 'ok' : 'FAIL'} | ${problems.join('; ') || edge.notices.join(', ') || 'clean'} |`)
    }
    lines.push('')
  }

  lines.push('## Journeys (back-to-back training)')
  lines.push('')
  lines.push('| Journey | Sessions | Violations | Bucket balance | Neglected | Fresh respect | Repeat ratio | Accessory repeat | Exact repeats | Double-day overlap | Rx error | Progression |')
  lines.push('|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const journey of journeys) {
    lines.push([
      `| ${journey.key}`,
      `${journey.sessionCount}`,
      `${journey.violationCount}`,
      journey.bucketBalance.toFixed(2),
      journey.neglectedBuckets.join('/') || 'none',
      journey.freshRecoveryRespect == null ? 'n/a' : journey.freshRecoveryRespect.toFixed(3),
      journey.repeatRatio == null ? 'n/a' : journey.repeatRatio.toFixed(2),
      journey.accessoryRepeatRatio == null ? 'n/a' : journey.accessoryRepeatRatio.toFixed(2),
      `${journey.exactRepeatCount}`,
      journey.doubleDayBucketOverlap == null ? 'n/a' : journey.doubleDayBucketOverlap.toFixed(2),
      journey.prescriptionError == null ? 'n/a' : journey.prescriptionError.toFixed(2),
      journey.progressionShare == null ? 'n/a' : journey.progressionShare.toFixed(2),
    ].join(' | ') + ' |')
  }
  lines.push('')
  lines.push('Reading guide: bucket balance is min/max working sets across trained buckets (higher = more even). Fresh respect is mean usage of picked buckets minus the all-bucket mean at generation time (negative = the generator favors fresher muscles). Repeat ratio is lift overlap with the previous 3 sessions. Rx error is the median relative gap between prescribed loads and the simulated athlete\'s true capability once history exists.')
  lines.push('')

  writeFileSync(reportPath, lines.join('\n'))
  return { summary, reportPath, dataPath }
}
