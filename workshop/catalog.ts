/**
 * Workshop catalog loader: bring your own exercises. Pass any JSON file that
 * is either `{ "exercises": ExerciseListItem[] }` or a bare array, via
 * `--catalog <path>`. Without the flag, the bundled sample catalog is used,
 * which is small but balanced enough for every workshop scenario.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ExerciseListItem } from '@justgains/shared/src/api/types/ExerciseListItem'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export const WORKSHOP_DIR = join(REPO_ROOT, '.runs')

const DEFAULT_CATALOG_PATH = join(REPO_ROOT, 'examples/sample-catalog.json')

export async function loadWorkshopCatalog(options?: {
  path?: string
}): Promise<ExerciseListItem[]> {
  mkdirSync(WORKSHOP_DIR, { recursive: true })

  const flagIndex = process.argv.indexOf('--catalog')
  const path = options?.path ??
    (flagIndex >= 0 ? resolve(process.argv[flagIndex + 1] ?? '') : DEFAULT_CATALOG_PATH)
  if (!existsSync(path)) {
    throw new Error(`Catalog file not found: ${path}`)
  }

  const payload = JSON.parse(readFileSync(path, 'utf8')) as
    | { exercises?: ExerciseListItem[] }
    | ExerciseListItem[]
  const exercises = Array.isArray(payload) ? payload : payload.exercises ?? []
  if (exercises.length === 0) {
    throw new Error(`Catalog file has no exercises: ${path}`)
  }

  return exercises
}
