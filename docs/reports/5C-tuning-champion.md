# 5C Tuning — Champion

> ⚠️ REJECTED on a fresh seed (42, n=30): champion scored pro:medium 50% / pro:hard 50%,
> while the incumbent scored pro:medium 70% / pro:hard 50% on the SAME seed — the champion
> REGRESSED pro:medium. The holdout (seed 9000) "confirmed" within the n=30 noise band
> (CI ≈ ±18); seed 42 contradicts it. The +8 acceptance margin was too small for that
> band. Champion NOT shipped — incumbent weights kept. (Original run notes retained below
> for the record.)
>
> Holdout CONFIRMED (seed 9000 only — insufficient).
> Champion holdout points=166.7 vs incumbent 153.3 (unseen seeds 9000+).
> Tuning-seed fitness: points=190.0, meanTurns=1816. pro:medium 67% / pro:hard 67% / hard:medium 57%.

## Champion weights + scale (commit to `EVAL_WEIGHTS` + `SCALE_PARAMS` next session)

```json
{
  "weights": {
    "raceLead": 3,
    "shotPressure": 0.9,
    "exposure": -1,
    "mass": -1,
    "spread": 3,
    "homeLoaded": 2,
    "finishGap": 12
  },
  "scale": {
    "gapTurns": 10,
    "amplitude": 0.4
  }
}
```

## Acceptance parameters
- PRO_GAMES per pairing: 30
- improvement margin: >= 8 placement points
- F-1 guardrail: termination 100% AND mean turns <= 2500
- multipliers tried: [0.5,0.75,1.5,2]

Next: apply these to `src/oracle/ai/evaluate.ts`, re-run the benchmark, then unskip/redesign P-tests per F-2.