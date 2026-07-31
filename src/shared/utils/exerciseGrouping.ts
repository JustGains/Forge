import type { WorkoutData } from '@justgains/shared/src/api/types/WorkoutData'

export interface GroupedItem {
  type: 'group' | 'exercise'
  groupId?: number | null
  groupType?: string | null
  groupName?: string | null
  exercises: WorkoutData[]
}

/**
 * Remove the matched exercise from its group, and auto-ungroup any orphan
 * left behind.
 *
 * A "superset / circuit / dropset" group with only one remaining member is
 * semantically meaningless — a superset of one is just… an exercise. The
 * drag-reorder path (`useWorkoutSortableData.handleReorder`) already handles
 * this implicitly by re-evaluating every exercise's neighbors after a drop;
 * the per-exercise menu "Ungroup" action touches only the target, so without
 * this helper it can leave a solo-member superset on screen.
 *
 * Callers pass a predicate so the matching key (entryKey, exerciseCode,
 * index, etc.) stays their concern.
 *
 * Example: Superset(A, B). Menu-ungroup on A →
 *   A.exerciseGroupId = null (direct effect)
 *   B.exerciseGroupId = null (orphan cleanup — only 1 member remained)
 *
 * Superset(A, B, C). Menu-ungroup on A →
 *   A.exerciseGroupId = null
 *   B, C unchanged (still a valid 2-member group)
 */
export function removeExerciseFromGroup<T extends WorkoutData>(
  exercises: T[],
  matches: (exercise: T) => boolean,
): T[] {
  const targetGroupIds = new Set<number>()
  for (const exercise of exercises) {
    if (matches(exercise) && exercise.exerciseGroupId != null) {
      targetGroupIds.add(exercise.exerciseGroupId)
    }
  }

  // Pass 1: strip the group fields from the matched exercise(s).
  let result = exercises.map((ex): T => {
    if (!matches(ex)) return ex
    return {
      ...ex,
      exerciseGroupId: null,
      exerciseGroupType: null,
      exerciseGroupName: null,
    } as T
  })

  // If the target wasn't in a group, there's nothing to clean up.
  if (targetGroupIds.size === 0) return result

  // Pass 2: a caller may match repeated exercise codes in more than one
  // group. Clean every affected group rather than only the first match.
  const remainingCounts = new Map<number, number>()
  for (const exercise of result) {
    const groupId = exercise.exerciseGroupId
    if (groupId != null && targetGroupIds.has(groupId)) {
      remainingCounts.set(groupId, (remainingCounts.get(groupId) ?? 0) + 1)
    }
  }

  result = result.map((ex): T => {
    const groupId = ex.exerciseGroupId
    if (groupId == null || !targetGroupIds.has(groupId) || (remainingCounts.get(groupId) ?? 0) >= 2) {
      return ex
    }
    return {
      ...ex,
      exerciseGroupId: null,
      exerciseGroupType: null,
      exerciseGroupName: null,
    } as T
  })
  return result
}

/**
 * Self-heal hydrated group metadata in the same order the editor renders it.
 *
 * A valid group is one contiguous run of 2+ members. A legacy id reused after
 * a break keeps its first valid run and clears later runs, preventing duplicate
 * headers. Conflicting non-null types clear that run rather than guessing;
 * sparse type metadata is repaired when the run has one unambiguous type.
 * All production group types are preserved, including warm-up, cooldown,
 * interval, circuit, and section groups — this is not Optim-specific.
 *
 * Returns the same array reference when everything is already healthy, so
 * the caller's memoisation / shallow-equality checks won't trip unnecessarily.
 */
export function normalizeExerciseGroups<T extends WorkoutData>(
  exercises: T[],
): T[] {
  if (exercises.length === 0) return exercises

  const renderedOrder = exercises
    .map((exercise, index) => ({ exercise, index }))
    .sort((a, b) =>
      ((a.exercise.exerciseOrder ?? 0) - (b.exercise.exerciseOrder ?? 0)) ||
      (a.index - b.index))
  const keptIndexes = new Set<number>()
  const claimedGroupIds = new Set<number>()
  const repairedTypes = new Map<number, T['exerciseGroupType']>()

  let runStart = 0
  while (runStart < renderedOrder.length) {
    const groupId = renderedOrder[runStart].exercise.exerciseGroupId ?? null
    if (groupId == null) {
      runStart += 1
      continue
    }

    let runEnd = runStart + 1
    while (
      runEnd < renderedOrder.length &&
      renderedOrder[runEnd].exercise.exerciseGroupId === groupId
    ) {
      runEnd += 1
    }

    const run = renderedOrder.slice(runStart, runEnd)
    const nonNullTypes = new Set(
      run
        .map(({ exercise }) => exercise.exerciseGroupType)
        .filter((type): type is NonNullable<T['exerciseGroupType']> => type != null),
    )
    const hasUnambiguousType = nonNullTypes.size <= 1
    if (run.length >= 2 && hasUnambiguousType && !claimedGroupIds.has(groupId)) {
      claimedGroupIds.add(groupId)
      const [canonicalType] = nonNullTypes
      for (const { exercise, index } of run) {
        keptIndexes.add(index)
        if (canonicalType != null && exercise.exerciseGroupType == null) {
          repairedTypes.set(index, canonicalType)
        }
      }
    }

    runStart = runEnd
  }

  let changed = false
  const normalized = exercises.map((exercise, index): T => {
    const groupId = exercise.exerciseGroupId ?? null
    if (groupId == null) {
      if (exercise.exerciseGroupType == null && exercise.exerciseGroupName == null) return exercise
      changed = true
      return {
        ...exercise,
        exerciseGroupId: null,
        exerciseGroupType: null,
        exerciseGroupName: null,
      } as T
    }

    if (!keptIndexes.has(index)) {
      changed = true
      return {
        ...exercise,
        exerciseGroupId: null,
        exerciseGroupType: null,
        exerciseGroupName: null,
      } as T
    }

    const repairedType = repairedTypes.get(index)
    if (repairedType == null) return exercise
    changed = true
    return { ...exercise, exerciseGroupType: repairedType } as T
  })

  return changed ? normalized : exercises
}

/**
 * Move an exercise up or down in the list while treating groups as atomic
 * units — so a menu "Move Up / Move Down" action can never split a superset
 * into two non-contiguous members (each of which would render as its own
 * "Superset, 1 exercise" header, the same orphan-group bug class as
 * `handleUngroupExercise` / `handleRemoveExercise`).
 *
 * Algorithm (after picking the `index ± 1` neighbor):
 *
 * 1. **Mover and immediate neighbor share a group id** (or both are
 *    ungrouped) → simple position swap. Order within the group or among the
 *    ungrouped neighbors changes; no group is ever split.
 *
 * 2. **Ungrouped mover vs. grouped neighbor** → the mover jumps past the
 *    neighbor's *entire* contiguous group as if the group were one slot.
 *    Matches the user's mental model: the Superset header is one thing.
 *
 * 3. **Grouped mover vs. ungrouped or different-group neighbor** → the
 *    mover's entire group slides as a block past the outside element(s), so
 *    every member stays together. Preserving the group is more valuable
 *    than moving just the tapped exercise out of it; users who actually
 *    want to ungroup have Ungroup in the menu.
 *
 * `exerciseOrder` is reassigned to match new indices so downstream code
 * that sorts by `exerciseOrder` (e.g. `buildGroupedItems`) stays correct.
 *
 * Returns the same array reference for no-ops (first item moving up, last
 * moving down) to keep memoisation stable.
 */
export function moveExerciseWithGroupAwareness<T extends WorkoutData>(
  exercises: T[],
  index: number,
  direction: 'up' | 'down',
): T[] {
  if (index < 0 || index >= exercises.length) return exercises

  const immediateNeighborIndex = direction === 'up' ? index - 1 : index + 1
  if (immediateNeighborIndex < 0 || immediateNeighborIndex >= exercises.length) {
    return exercises
  }

  const moverGid = exercises[index].exerciseGroupId ?? null
  const neighborGid = exercises[immediateNeighborIndex].exerciseGroupId ?? null

  // Case 1: within same group, or both ungrouped — simple index swap.
  if (moverGid === neighborGid) {
    const next = [...exercises]
    const tmp = next[index]
    next[index] = next[immediateNeighborIndex]
    next[immediateNeighborIndex] = tmp
    return reassignExerciseOrder(next)
  }

  // For Case 2 & 3 we need block swaps.
  const moverBlock = getGroupBlock(exercises, index, moverGid)
  const neighborBlock = getGroupBlock(exercises, immediateNeighborIndex, neighborGid)

  // Splice out both contiguous runs and reinsert in swapped order. Because
  // the blocks are adjacent, one splice covers both — no index shuffle.
  const next = [...exercises]
  if (direction === 'up') {
    // Array layout (up): [ ... neighborBlock, moverBlock, ... ]
    const firstStart = neighborBlock.start
    const totalSize = neighborBlock.size + moverBlock.size
    const moverSlice = next.slice(moverBlock.start, moverBlock.end + 1)
    const neighborSlice = next.slice(neighborBlock.start, neighborBlock.end + 1)
    next.splice(firstStart, totalSize, ...moverSlice, ...neighborSlice)
  } else {
    // Array layout (down): [ ... moverBlock, neighborBlock, ... ]
    const firstStart = moverBlock.start
    const totalSize = moverBlock.size + neighborBlock.size
    const moverSlice = next.slice(moverBlock.start, moverBlock.end + 1)
    const neighborSlice = next.slice(neighborBlock.start, neighborBlock.end + 1)
    next.splice(firstStart, totalSize, ...neighborSlice, ...moverSlice)
  }

  return reassignExerciseOrder(next)
}

/**
 * Return the contiguous range of indices that share `groupId` centered on
 * `index`. For a null `groupId` (the mover is ungrouped) the "block" is
 * just the single element at `index` — we never coalesce ungrouped
 * neighbors into a run because that would drag unrelated exercises along.
 */
function getGroupBlock<T extends WorkoutData>(
  arr: T[],
  index: number,
  groupId: number | null,
): { start: number; end: number; size: number } {
  if (groupId == null) {
    return { start: index, end: index, size: 1 }
  }
  let start = index
  let end = index
  while (start > 0 && (arr[start - 1].exerciseGroupId ?? null) === groupId) start--
  while (end < arr.length - 1 && (arr[end + 1].exerciseGroupId ?? null) === groupId) end++
  return { start, end, size: end - start + 1 }
}

function reassignExerciseOrder<T extends WorkoutData>(arr: T[]): T[] {
  return arr.map((e, i) => ({ ...e, exerciseOrder: i }) as T)
}

/**
 * Build a flat list of grouped + ungrouped items from sorted workout data.
 * Shared across Create, Edit, and preview screens.
 */
export function buildGroupedItems(workoutData: WorkoutData[]): GroupedItem[] {
  const sorted = [...workoutData].sort(
    (a, b) => (a.exerciseOrder ?? 0) - (b.exerciseOrder ?? 0),
  )
  const items: GroupedItem[] = []
  let currentGroup: GroupedItem | null = null

  for (const wd of sorted) {
    if (wd.exerciseGroupId != null) {
      if (currentGroup && currentGroup.groupId === wd.exerciseGroupId) {
        currentGroup.exercises.push(wd)
      } else {
        if (currentGroup) items.push(currentGroup)
        currentGroup = {
          type: 'group',
          groupId: wd.exerciseGroupId,
          groupType: wd.exerciseGroupType,
          groupName: wd.exerciseGroupName,
          exercises: [wd],
        }
      }
    } else {
      if (currentGroup) {
        items.push(currentGroup)
        currentGroup = null
      }
      items.push({ type: 'exercise', exercises: [wd] })
    }
  }
  if (currentGroup) items.push(currentGroup)
  return items
}
