/**
 * Compare two ForgeWorkshop run artifacts: violation deltas, quality-metric
 * medians, notice rates, and per-journey changes. Usage:
 *   bun run forge:workshop -- --compare <runA.json> <runB.json>
 */
import { readFileSync } from 'node:fs'

type RunData = {
  summary: { label: string; violationsByCategory: Record<string, number> }
  coldRecords: Array<{
    scenario: { grouping: string; durationMinutes: number }
    evaluation: { metrics: Record<string, number> }
    notices: string[]
  }>
  journeys: Array<Record<string, unknown> & { key: string }>
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]!
}

const formatDelta = (before: number | null, after: number | null, digits = 2): string => {
  if (before == null || after == null) return 'n/a'
  const delta = after - before
  return `${before.toFixed(digits)} → ${after.toFixed(digits)} (${delta >= 0 ? '+' : ''}${delta.toFixed(digits)})`
}

export function compareRuns(pathA: string, pathB: string): void {
  const runA = JSON.parse(readFileSync(pathA, 'utf8')) as RunData
  const runB = JSON.parse(readFileSync(pathB, 'utf8')) as RunData
  console.log(`\nComparing ${runA.summary.label} → ${runB.summary.label}\n`)

  const violationsA = Object.values(runA.summary.violationsByCategory).reduce((sum, count) => sum + count, 0)
  const violationsB = Object.values(runB.summary.violationsByCategory).reduce((sum, count) => sum + count, 0)
  console.log(`Violations: ${violationsA} → ${violationsB}`)

  for (const metric of ['utilization', 'fillRatio', 'loadCoverage', 'bucketEntropy', 'elapsedMs']) {
    const valuesA = runA.coldRecords.map((record) => record.evaluation.metrics[metric]).filter((value): value is number => value != null)
    const valuesB = runB.coldRecords.map((record) => record.evaluation.metrics[metric]).filter((value): value is number => value != null)
    console.log(`median ${metric}: ${formatDelta(median(valuesA), median(valuesB), metric === 'elapsedMs' ? 0 : 2)}`)
  }

  const noticeRate = (run: RunData, notice: string, grouping?: string): number => {
    const pool = grouping ? run.coldRecords.filter((record) => record.scenario.grouping === grouping) : run.coldRecords
    if (pool.length === 0) return 0
    return pool.filter((record) => record.notices.includes(notice)).length / pool.length
  }
  console.log(`circuitFallback rate: ${formatDelta(noticeRate(runA, 'circuitFallback', 'circuits'), noticeRate(runB, 'circuitFallback', 'circuits'))}`)
  console.log(`supersetUnavailable rate: ${formatDelta(noticeRate(runA, 'supersetUnavailable', 'supersets'), noticeRate(runB, 'supersetUnavailable', 'supersets'))}`)
  console.log(`durationShortfall rate: ${formatDelta(noticeRate(runA, 'durationShortfall'), noticeRate(runB, 'durationShortfall'))}`)

  console.log('\nJourneys:')
  for (const journeyB of runB.journeys) {
    const journeyA = runA.journeys.find((candidate) => candidate.key === journeyB.key)
    if (!journeyA) continue
    const numeric = (journey: Record<string, unknown>, field: string): number | null => {
      const value = journey[field]
      return typeof value === 'number' ? value : null
    }
    const parts: string[] = []
    for (const field of ['prescriptionError', 'progressionShare', 'repeatRatio', 'accessoryRepeatRatio', 'bucketBalance']) {
      const before = numeric(journeyA, field)
      const after = numeric(journeyB, field)
      if (before == null && after == null) continue
      parts.push(`${field} ${formatDelta(before, after)}`)
    }
    console.log(`  ${journeyB.key}: ${parts.join(' · ')}`)
  }
}
