# How Forge works

Here is the whole algorithm, step by step, in plain language. Nothing is
hand-waved: every rule below is implemented in `src/shared/optim/`, and every
generated workout carries a per-exercise `trace` plus a result-level `events`
list, so you can always see which rules fired and why.

Forge is deterministic. Run it with the same catalog, the same athlete, and
the same seed, and it produces the identical workout every time, byte for
byte. There is no LLM, no server, and no randomness at generation time. The
only variety comes from a seed the user can roll and from the calendar
itself.

## The pipeline at a glance

```
catalog + athlete + settings
   │
   1. decide how many exercises fit the time window
   2. throw out everything the athlete cannot or should not do
   3. score what survives (six simple utilities, summed)
   4. pick exercises position by position, most important first
   5. prescribe sets, reps, loads, and rest for each pick
   6. optionally group work into supersets or circuits
   7. wrap the lifting in optional cardio and mobility stages
   8. check the clock, trim or top up, and confess anything that did not fit
   │
   a finished, editable, fully explained workout
```

## 1. How many exercises fit

Every exercise slot has a time price that depends on its importance. The
first, heaviest lift of the day is budgeted at 15 minutes, the second at 12,
the third at 10, and everything after that at 7. Core work is 5 minutes a
slot. Short sessions get a small discount on those prices, because warm-ups
and setup overlap more when there is less of everything.

A session starts from a floor of 2 main lifts and 2 core movements. As the
requested duration climbs past the price of each additional slot, the count
grows. The muscle-tone goal adds two extra lifts and one extra core movement
on top, because tone programming is deliberately higher volume at lower
loads.

## 2. Who gets thrown out

Hard filters remove an exercise entirely when any of these is true:

- it is above the athlete's experience level
- the athlete's equipment cannot support it (every required implement must be
  available; bodyweight-only mode admits only true bodyweight movements)
- it is cardio, distance, or mobility work (those live in their own stages)
- the athlete manually excluded it
- it does not fit the selected split (a pull day rejects chest pressing;
  arm exercises are sorted by their actual muscle, so triceps work counts as
  push and biceps work counts as pull)
- the goal is powerlifting or Olympic weightlifting and the movement is not
  an authentic competition-pattern lift (a labeled fallback pool of strength
  movements fills the gaps when the authentic pool runs dry)
- a manual muscle-target filter is active and the movement's primary muscle
  is outside it (core work is exempt)

Nothing is filtered silently. Every rejection is recorded with its reason in
`rejectedCandidates`.

## 3. How survivors are scored

Each eligible exercise gets a score that is a plain, unweighted sum of six
utilities. No machine learning, no tuning knobs, just six honest opinions
added together:

| Utility | What it says | Range |
|---|---|---|
| Catalog rating | "This is a well-regarded movement" (popularity / 5) | 0 to 1 |
| Muscle freshness | "This muscle has recovered" (1 - usage, times 4) | 0 to 4 |
| History recency | "You have not done this in a while" | 0 to 2 |
| Primary muscle utility | "This muscle matters" (catalog weighting) | 0 to 1 |
| Focus utility | "You asked to focus on this" | 0 or 0.6 |
| Favorite | "You favorited this" | 0 or 0.5 |

Muscle freshness is the loudest voice on purpose. It is what makes
back-to-back training rotate muscle groups without any explicit plan.

## 4. How picks are made

Selection walks position by position. Position 0 wants a tier-one lift for
the current goal (a squat, a bench, a clean, depending on what you train
for). Later positions relax toward accessories. Within each position the
highest score wins, with three tie-breaking preferences applied inside a
narrow competitive window:

- prefer a movement pattern the session does not have yet
- prefer staying at the same equipment station as the previous lift
- rotate accessories the athlete used recently, when an equivalent
  alternative exists (main lifts deliberately repeat, because progressing a
  lift requires doing the lift)

Full-body sessions also reserve a lower-body, a push, and a pull role so a
"full body" workout cannot quietly become a chest day. A user's pinned
starting exercises are honored first and never moved.

## 5. Muscle recovery, the quiet scheduler

Every completed workout deposits fatigue on the muscles it worked: a large
share on primary movers, a small share on secondaries. That fatigue decays
linearly over roughly six days (a little faster for beginners, a little
slower for strength and powerlifting athletes, whose sessions run deeper).

At generation time each muscle's remaining fatigue feeds the freshness
utility above. That is the whole recovery model, and it is enough: train
today, and tomorrow's "fresh muscles" session steers itself elsewhere.
Athletes can also say "my legs are still fried" through a manual recovery
input that overrides the math.

## 6. Sets and reps: the scheme tables

Prescriptions come from 21 recovered scheme tables: one per goal and tier,
247 rows in total. The day of year picks the row, offset by the exercise's
position, so Monday's squat scheme differs from Tuesday's without any
randomness. Bands, timed holds, bodyweight movements, and a handful of
special cases have their own override rules.

About one session in four, a qualifying lift is promoted to a max-effort
scheme: four sets, capped reps, longer rests. It never happens twice in a
row for the same lift and never on movements where chasing a max is unsafe
or meaningless.

## 7. Loads: honest numbers or no numbers

Forge's load pipeline has a strict honesty rule: it would rather leave a
load blank than invent one.

1. **Direct history wins.** Every past set of an exercise contributes an
   estimated one-rep max (an Epley-style formula with a set-count bonus).
   Daily maxima are smoothed exponentially, outliers are cleaned, and long
   inactivity decays the estimate by up to a third.
2. **Effort counts, not just weight.** If the athlete logged RPE, the reps
   they had in reserve raise the estimate. Beating a prescribed target
   raises it too, within a strict anticipation cap so one great day cannot
   compound into runaway prescriptions.
3. **Relationships bridge gaps.** A lift with no history can borrow one hop
   from a related lift's history through a recovered strength ratio
   (front squat from back squat, incline press from bench). Never two hops,
   never for max-effort or bodyweight work.
4. **Demographics warm-start cold accounts.** A brand-new athlete with a
   known gender, age, and experience gets a conservative first-use load from
   recovered demographic tables. If none of the above applies, the load
   stays open, visibly, instead of defaulting to a made-up number.
5. **Executable-load mode makes numbers real.** When enabled, barbell loads
   snap to weights you can actually build with a real bar and plates
   (metric or imperial), warm-up ramps are recomputed, and a target below
   the empty bar is omitted rather than rounded up into danger.

## 8. Rest, cardio, circuits, supersets, mobility, warm-ups

- **Rest** comes from a fixed ladder (30 to 300 seconds) indexed by goal,
  position, and whether the muscle is under-trained. Core resets to short
  rests. Bands rest 15 seconds.
- **Cardio**, when requested, takes a goal-scaled fraction of the session
  (5% for Olympic lifters up to 40% for muscle tone) as interval work, and
  reserves only the time its emitted sets actually need.
- **Circuits** group two or three compatible movements and halve their rests
  (with a floor). Competition lifts stay out of circuits. When circuit
  density would make prescribed loads dishonest, loads are reduced to a
  stated reserve with an explicit RPE target instead of silently kept.
- **Supersets** are pairs: adjacent, phase-matched, muscle-diverse, and
  equipment-compatible, so the athlete never tears down a station mid-pair.
  Rests are preserved because pairs execute set-major (A1, B1, A2, B2).
- **Mobility** bookends the session with up to ten 60-second movements
  biased toward the muscles actually trained today.
- **Warm-up ramps** precede qualifying heavy lifts at 60/75/90% of the
  working load, and are the first thing trimmed when the clock is tight.

## 9. The honesty layer

The requested duration is a hard ceiling, and the engine prices its own
output: work seconds plus rest seconds plus a transition allowance per
exercise. Around that price sit several policies:

- warm-ups, then working sets, are trimmed before the plan may overrun
- when the plan underuses a long window, compatible movements are added,
  then accessories gain copied working sets, up to 90% utilization, never
  past the ceiling
- when a requested grouping mode cannot form, one extra core movement is
  tried so the promise can be kept; failing that, the plan says so
- every compromise surfaces as a typed notice: `durationShortfall`,
  `circuitFallback`, `cardioOmitted`, and friends. The UI's job is only to
  translate them into sentences.

## 10. Everything is explainable

Each generated exercise carries its rank, its score breakdown (all six
utilities), the scheme table row it used, the origin of its load (history,
relationship, demographic, or open), and a running trace of every policy
that touched it. The result carries session-level events. If you ever wonder
"why did it pick that?", the answer is already in the object you are holding.
