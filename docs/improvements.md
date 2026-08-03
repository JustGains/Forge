# What JustGains improved over the recovered Fitbod engine

The core of Forge is identical to the local workout generator we recovered
from Fitbod's Android app (version 8.24.1): the same exercise-count model,
the same six-utility ranking, the same recovery windows, and the same 21
scheme tables, checked byte for byte against the recovered data. That core is
still fully intact in this repo. Call `generateOptimDemo` with no policy
flags and you get the recovered behavior, unchanged.

Every improvement below is optional and layered on top, and all of them are
switched on together by `generateForgeWorkout`. Each one was built to fix a
specific, measured defect, and each was tested with the bundled workshop
harness: hundreds of generated workouts per run, twelve simulated multi-week
athletes, and zero invariant violations across roughly 13,000 generations
during development.

## 1. Grouping that actually happens

The recovered engine pairs only accidental neighbors, and its tier data
(absent for a foreign catalog) misclassifies popular accessories as
protected competition lifts. In practice that meant a user asking for
circuits got plain straight sets 68% of the time, and supersets failed 53%
of the time.

Three policies fix this without touching authored safety boundaries:

- core-phase movements may pair with each other (a plank next to a crunch is
  ordinary programming, whatever its popularity score says)
- accessories whose "tier one" label came from popularity inference, not
  from authored data, may pair; genuine competition lifts remain protected
- a compatible partner can be pulled adjacent instead of hoping the shuffle
  left it there; prescriptions never change, pinned lifts never move
- when a requested mode still cannot form, the engine retries with one extra
  core movement before giving up, and only keeps the retry if the time
  ceiling and every existing lift survive intact

Measured result: circuit fallback 68% → 11%, superset failure 53% → 12%.

## 2. Loads that converge on the athlete

The recovered load loop caps progress at 107% of the last prescription. An
athlete who lifts exactly what the app says (which is what most people do)
produces "target met, no surprise", so the estimate crawls. Simulated
compliant athletes stayed roughly 60% below their real capability forever.

The logged-effort catch-up policy widens that cap to 118%, but only when the
athlete's own logged RPE proves the session was too easy, and never past
what the logged arithmetic itself supports. Simulated athletes now reach
their true working loads in about ten exposures, and a 100-session
simulation converges to a 0% median prescription error with no runaway
(overshoot self-corrects through failed reps and honest RPE).

## 3. Time windows that get used

The recovered duration model prices exercise slots optimistically, so long
sessions came up short: a 90-minute request typically produced about 70
minutes of work with no explanation.

Forge prices its emitted work honestly (work plus rest plus transitions),
then fills: first with additional compatible movements, then by topping up
accessory volume with copies of each lift's own final working set, up to 90%
of the window and never past it. Full-gym utilization for 45 to 90 minute
requests went from the high 70s to 91 to 100%. Sessions that genuinely
cannot fill (a 90-minute bodyweight-only powerlifting request, say) stay
short and say so, instead of padding with junk volume.

## 4. Cold starts without lies

The recovered engine falls back to a hardcoded 20 kg when it knows nothing.
Forge never invents a load: it walks direct history, then a one-hop strength
relationship, then a demographic warm-start table, and if all three come up
empty the load is visibly open. Executable-load mode goes further and
refuses to emit any barbell number that cannot be built from a real bar and
plate inventory.

## 5. Honesty as a feature

The recovered engine reports a static time estimate and nothing else. Forge
returns typed notices for everything it could not honor: a duration
shortfall or overrun, an omitted cardio finisher, a circuit that fell back
to straight sets, circuit loads that were reduced to a stated reserve. The
generating UI can promise: nothing on this plan is silently wrong.

## 6. Favorites that matter

The recovered ranking includes a favorite bonus, and Forge honors it
end to end (+0.5 utility). It is small on purpose: a favorite breaks ties
and nudges rotation, it does not override recovery or programming.

## 7. A test harness as part of the product

The `workshop/` directory batch-generates workouts across the whole control
matrix (goal, experience, split, duration, gear, grouping), simulates
multi-week athletes who actually complete their sessions and feed the
results back, and enforces hard invariants: split purity, equipment
feasibility, rep and rest and RPE ranges, group integrity, duration
confession, determinism. Quality metrics (window utilization, muscle
balance, accessory variety, prescription error against a known synthetic
athlete) are aggregated per run and diffable between runs. If you change the
engine, the workshop tells you what you actually changed.
