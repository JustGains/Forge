import { describe, expect, it } from 'vitest'

import {
  getOptimExerciseProductAwareWarmStartPrediction,
  getOptimExerciseProductWarmStartPrediction,
  getOptimExerciseWarmStartPrediction,
  OPTIM_PRODUCT_WARM_START_METADATA_STATS,
  OPTIM_WARM_START_METADATA_STATS,
} from './optimExerciseWarmStartMetadata'
import generatedProductMetadata from './optimExerciseProductWarmStartMetadata.generated.json'
import generatedMetadata from './optimExerciseWarmStartMetadata.generated.json'

const deadlift = { exerciseCode: 'BARBELL.DEADLIFT' }

describe('Optim exercise warm-start metadata overlay', () => {
  it('keeps only strict weighted source rows and omits anomalous cells instead of capping them', () => {
    expect(OPTIM_WARM_START_METADATA_STATS).toEqual({
      schemaVersion: 1,
      ageBucketInterpretation: 'age decade; inferred from recovered API quantization and value distributions',
      ageBuckets: [20, 30, 40, 50, 60],
      sourceCsvRowCount: 65248,
      sourceExerciseCount: 1406,
      mappingCount: 1103,
      mappedLiveCodeCount: 644,
      strictSourceCodeCount: 166,
      sourceExcludedModalityCodeCount: 6,
      canonicalExcludedModalityCodeCount: 1,
      compatibilityExclusionCount: 1,
      reviewedRedirectCount: 6,
      reviewedResolutionCount: 1,
      warmStartRecordCount: 166,
      predictionCellCount: 26110,
      rejectedCellCount: 40,
      reviewCodeCount: 25,
    })
    expect(getOptimExerciseWarmStartPrediction(
      { exerciseCode: 'CABLE.SEATED.REVERSE.SHRUG' },
      { gender: 'Female', goal: 'powerlifting', experience: 'advanced', ageYears: 20 },
    )).toBeNull()
  })

  it('keeps reviewed generic-lift redirects explicit without resolving collapsed variants', () => {
    const profile = { gender: 'Male', goal: 'general', experience: 'intermediate', ageYears: 40 } as const
    const squat = getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.SQUAT' }, profile)
    const highBarSquat = getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.HIGH.BAR.SQUAT' }, profile)
    const bench = getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.BENCH.PRESS' }, profile)

    expect(squat).toMatchObject({ predictedMaxKg: 51.9, sourceRowId: '181', sourceName: 'Back Squat' })
    expect(squat?.predictedMaxKg).toBe(highBarSquat?.predictedMaxKg)
    expect(bench).toMatchObject({ predictedMaxKg: 47.1, sourceRowId: '184', sourceName: 'Barbell Bench Press' })
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.WIDE.BENCH.PRESS' }, profile)).toBeNull()
  })

  it('recovers warm starts for mechanically identical live code renames', () => {
    // Why: renamed catalog codes should retain exact recovered source data,
    // while implement changes and merely similar variants stay unassigned.
    const profile = { gender: 'Male', goal: 'general', experience: 'intermediate', ageYears: 40 } as const
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'DUMBBELL.INCLINE.CHEST.PRESS' }, profile))
      .toMatchObject({ predictedMaxKg: 16.7, sourceRowId: '228', sourceName: 'Dumbbell Incline Bench Press' })
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'DUMBBELL.BENCH.SEATED.PRESS' }, profile))
      .toMatchObject({ predictedMaxKg: 15.2, sourceRowId: '442', sourceName: 'Dumbbell Shoulder Press' })
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'DUMBBELL.PUSH.PRESS' }, profile)).toBeNull()
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'LANDMINE.PRESS' }, profile)).toBeNull()
  })

  it('pins exact source rows instead of averaging mechanically distinct Olympic lifts', () => {
    const profile = { gender: 'Male', goal: 'general', experience: 'intermediate', ageYears: 40 } as const

    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.POWER.CLEAN' }, profile))
      .toMatchObject({ predictedMaxKg: 34.8, sourceRowId: '314', sourceName: 'Power Clean' })
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.POWER.SNATCH' }, profile))
      .toMatchObject({ predictedMaxKg: 21.8, sourceRowId: '316', sourceName: 'Power Snatch' })
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.HANG.SNATCH' }, profile)).toBeNull()
  })

  it('keeps exact collapsed-source reviews in a separately gated product dataset', () => {
    // Why: reviewed exact matches can improve user workouts without changing
    // direct callers that depend on the original conservative dataset.
    const profile = { gender: 'Male', goal: 'general', experience: 'intermediate', ageYears: 40 } as const

    expect(OPTIM_PRODUCT_WARM_START_METADATA_STATS).toEqual({
      schemaVersion: 1,
      productOnly: true,
      legacyWarmStartDatasetUnchanged: true,
      reviewedRedirectCount: 2,
      reviewedResolutionCount: 2,
      legacyExclusionCount: 2,
      warmStartRecordCount: 4,
      predictionCellCount: 602,
    })
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.HANG.SNATCH' }, profile)).toBeNull()
    expect(getOptimExerciseProductWarmStartPrediction({ exerciseCode: 'BARBELL.HANG.SNATCH' }, profile))
      .toMatchObject({ predictedMaxKg: 17, sourceRowId: '264', sourceName: 'Hang Snatch', productOnly: true })
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'DUMBBELL.BENT.OVER.ROW' }, profile)).toBeNull()
    expect(getOptimExerciseProductWarmStartPrediction({ exerciseCode: 'DUMBBELL.BENT.OVER.ROW' }, profile))
      .toMatchObject({
        predictedMaxKg: 16.5,
        sourceRowId: '493',
        sourceName: 'Dumbbell Bent Over Row',
        productOnly: true,
      })
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.SPLIT.JERK' }, profile)).toBeNull()
    expect(getOptimExerciseProductWarmStartPrediction({ exerciseCode: 'BARBELL.SPLIT.JERK' }, profile))
      .toMatchObject({ predictedMaxKg: 29.6, sourceRowId: '369', sourceName: 'Split Jerk', productOnly: true })
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'HIP.THRUSTS' }, profile)).toBeNull()
    expect(getOptimExerciseProductAwareWarmStartPrediction({ exerciseCode: 'HIP.THRUSTS' }, profile))
      .toMatchObject({
        predictedMaxKg: 29.2,
        sourceRowId: '188',
        sourceName: 'Barbell Hip Thrust',
        productOnly: true,
      })
    for (const exerciseCode of [
      'DUMBBELL.STANDING.SINGLE.LEG.CALF.RAISE',
      'DUMBBELL.SINGLE.LEG.GLUTE.BRIDGE',
      'BARBELL.ROLLOUT',
      'WEIGHTED.DECLINE.TWIST.SIT.UP',
    ]) {
      expect(getOptimExerciseProductWarmStartPrediction({ exerciseCode }, profile)).toBeNull()
    }
    expect(generatedProductMetadata.reviewedResolutions.map(resolution => resolution.sourceRowId))
      .toEqual(['264', '493'])
    expect(generatedProductMetadata.reviewedRedirects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        exerciseCode: 'BARBELL.SPLIT.JERK',
        sourceRowId: '369',
        mappingAssignedCode: 'BARBELL.POWER.JERK',
      }),
      expect.objectContaining({
        exerciseCode: 'HIP.THRUSTS',
        sourceRowId: '188',
        sourceName: 'Barbell Hip Thrust',
        mappingAssignedCode: 'BARBELL-STAGGERED-STANCE-HIP-THRUST',
        targetCanonicalBodyweightOverride: true,
        mappedTargetSources: [
          {
            sourceRowId: '101',
            expectedName: 'Hip Thrust',
            expectedExternalResourceId: 450,
            expectedLive: false,
            expectedIsBodyweight: true,
          },
          {
            sourceRowId: '665',
            expectedName: 'Hip Thrust',
            expectedExternalResourceId: 175,
            expectedLive: true,
            expectedIsBodyweight: true,
          },
        ],
      }),
    ]))
  })

  it('excludes mismatched legacy implement data only through the product seam', () => {
    // Why: direct engine callers retain the recovered mapping, while the user
    // product must not prescribe free-barbell load from a Smith-machine row.
    const profile = { gender: 'Male', goal: 'general', experience: 'intermediate', ageYears: 40 } as const

    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.STIFF-LEGGED-DEADLIFT' }, profile))
      .toMatchObject({ predictedMaxKg: 41.9, sourceRowId: '458', sourceName: 'Smith Machine Stiff-Legged Deadlift' })
    expect(getOptimExerciseProductAwareWarmStartPrediction(
      { exerciseCode: 'BARBELL.STIFF-LEGGED-DEADLIFT' },
      profile,
    )).toBeNull()
    expect(getOptimExerciseProductAwareWarmStartPrediction(deadlift, profile))
      .toEqual(getOptimExerciseWarmStartPrediction(deadlift, profile))
    expect(getOptimExerciseWarmStartPrediction(
      { exerciseCode: 'BARBELL-STAGGERED-STANCE-HIP-THRUST' },
      profile,
    )).toMatchObject({ predictedMaxKg: 29.2, sourceRowId: '188', sourceName: 'Barbell Hip Thrust' })
    expect(getOptimExerciseProductAwareWarmStartPrediction(
      { exerciseCode: 'BARBELL-STAGGERED-STANCE-HIP-THRUST' },
      profile,
    )).toBeNull()
    expect(generatedProductMetadata.legacyExclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        exerciseCode: 'BARBELL-STAGGERED-STANCE-HIP-THRUST',
        sourceRowId: '188',
        mappingAssignedCode: 'BARBELL-STAGGERED-STANCE-HIP-THRUST',
      }),
      expect.objectContaining({
        exerciseCode: 'BARBELL.STIFF-LEGGED-DEADLIFT',
        sourceRowId: '458',
        mappingAssignedCode: 'BARBELL.STIFF-LEGGED-DEADLIFT',
      }),
    ]))
  })

  it('keeps product records disjoint from legacy records and exclusions', () => {
    // Why: the product sidecar is an opt-in compatibility seam. A stale or
    // hand-edited artifact must not silently override a legacy record twice.
    const legacyCodes = new Set(Object.keys(generatedMetadata.records))
    const productCodes = new Set(Object.keys(generatedProductMetadata.records))

    expect([...productCodes].filter(code => legacyCodes.has(code))).toEqual([])
    for (const exclusion of generatedProductMetadata.legacyExclusions) {
      expect(legacyCodes.has(exclusion.exerciseCode)).toBe(true)
      expect(productCodes.has(exclusion.exerciseCode)).toBe(false)
    }
  })

  it('uses the exact generic bent-over-row source instead of reverse-grip data', () => {
    const profile = { gender: 'Male', goal: 'general', experience: 'intermediate', ageYears: 40 } as const

    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.REAR.DELT.ROW' }, profile))
      .toMatchObject({ predictedMaxKg: 32.7, sourceRowId: '195', sourceName: 'Bent Over Barbell Row' })
    expect(getOptimExerciseWarmStartPrediction(
      { exerciseCode: 'BARBELL.REVERSE.GRIP.BENT.OVER.ROW' },
      profile,
    )).toBeNull()
  })

  it('keeps reviewed source provenance explicit so mapping drift requires re-review', () => {
    expect(generatedMetadata.reviewedRedirects.find(redirect => redirect.exerciseCode === 'BARBELL.REAR.DELT.ROW'))
      .toMatchObject({
        sourceRowId: '195',
        sourceName: 'Bent Over Barbell Row',
        externalResourceId: 44,
        mappingAssignedCode: 'BARBELL.REVERSE.GRIP.BENT.OVER.ROW',
        canonicalMetadataAvailable: true,
      })
    expect(generatedMetadata.reviewedRedirects.find(redirect => redirect.exerciseCode === 'BARBELL.POWER.SNATCH'))
      .toMatchObject({
        sourceRowId: '316',
        sourceName: 'Power Snatch',
        externalResourceId: 274,
        mappingAssignedCode: 'BARBELL.HANG.SNATCH',
      })
    expect(generatedMetadata.reviewedRedirects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        exerciseCode: 'DUMBBELL.INCLINE.CHEST.PRESS',
        sourceRowId: '228',
        mappingAssignedCode: 'DUMBBELL.INCLINE.BENCH.PRESS',
        canonicalMetadataAvailable: false,
      }),
      expect.objectContaining({
        exerciseCode: 'DUMBBELL.BENCH.SEATED.PRESS',
        sourceRowId: '442',
        mappingAssignedCode: 'DUMBBELL.SEATED.SHOULDER.PRESS',
        canonicalMetadataAvailable: false,
      }),
    ]))
    expect(generatedMetadata.reviewedResolutions).toEqual([expect.objectContaining({
      exerciseCode: 'BARBELL.POWER.CLEAN',
      sourceRowId: '314',
      sourceName: 'Power Clean',
      externalResourceId: 272,
      mappedSourceRows: [
        { sourceRowId: '211', expectedName: 'Clean', expectedExternalResourceId: 84 },
        { sourceRowId: '262', expectedName: 'Hang Power Clean', expectedExternalResourceId: 169 },
        { sourceRowId: '314', expectedName: 'Power Clean', expectedExternalResourceId: 272 },
      ],
    })])
    expect(generatedMetadata.records['BARBELL.POWER.CLEAN'].assignment)
      .toBe('reviewed-collapsed-source-resolution')
  })

  it('resolves the recovered demographic value with the API age quantization', () => {
    expect(getOptimExerciseWarmStartPrediction(
      deadlift,
      { gender: 'Male', goal: 'general', experience: 'intermediate', ageYears: 44 },
    )).toEqual({
      predictedMaxKg: 61.1,
      gender: 'male',
      goal: 'general',
      experience: 'intermediate',
      ageBucket: 40,
      sourceRowId: '219',
      sourceName: 'Deadlift',
    })
    expect(getOptimExerciseWarmStartPrediction(
      deadlift,
      { gender: 'Male', goal: 'general', experience: 'intermediate', ageYears: 45 },
    )?.predictedMaxKg).toBe(50.7)
  })

  it('clamps age inputs to the supported 20–60 warm-start buckets', () => {
    // Why: profiles outside the recovered age range still need a bounded,
    // deterministic lookup instead of falling off the metadata table.
    const profile = { gender: 'Male', goal: 'general', experience: 'intermediate' } as const
    expect(getOptimExerciseWarmStartPrediction(deadlift, { ...profile, ageYears: 12 }))
      .toEqual(getOptimExerciseWarmStartPrediction(deadlift, { ...profile, ageYears: 20 }))
    expect(getOptimExerciseWarmStartPrediction(deadlift, { ...profile, ageYears: 82 }))
      .toEqual(getOptimExerciseWarmStartPrediction(deadlift, { ...profile, ageYears: 60 }))
  })

  it('maps the existing profile and Optim vocabularies without inventing unknown demographics', () => {
    expect(getOptimExerciseWarmStartPrediction(
      deadlift,
      { gender: 'MTF', goal: 'muscleTone', experience: 'advanced', ageYears: 30 },
    )?.predictedMaxKg).toBe(33.6)
    expect(getOptimExerciseWarmStartPrediction(
      deadlift,
      { gender: 'FTM', goal: 'muscleTone', experience: 'advanced', ageYears: 30 },
    )?.predictedMaxKg).toBe(74.3)
    expect(getOptimExerciseWarmStartPrediction(
      deadlift,
      { gender: 'Potato', goal: 'general', experience: 'intermediate', ageYears: 30 },
    )).toBeNull()
    expect(getOptimExerciseWarmStartPrediction(
      deadlift,
      { gender: 'Male', goal: 'general', experience: 'intermediate' },
    )).toBeNull()
  })

  it('leaves collapsed, missing-demographic, and custom records unset', () => {
    const profile = { gender: 'Male', goal: 'general', experience: 'intermediate', ageYears: 30 } as const
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'BARBELL.WIDE.BENCH.PRESS' }, profile)).toBeNull()
    expect(getOptimExerciseWarmStartPrediction({ exerciseCode: 'CUSTOM.PRESS' }, profile)).toBeNull()
    expect(getOptimExerciseWarmStartPrediction(
      deadlift,
      { gender: 'Male', goal: 'olympic', experience: 'beginner', ageYears: 20 },
    )).toBeNull()
  })
})
