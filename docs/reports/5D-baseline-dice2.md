# 5D Bench — dice 2 (multi-dice regression, PHASE-5D 5D-3c/5D-6)

> Generated 2026-08-16, seed 42, dice 2, games: non-Pro 100, Pro 10.
> Weights: committed `EVAL_WEIGHTS` + `SCALE_PARAMS` (see src/oracle/ai/evaluate.ts). Hard = v1 `scoreMove` (F-1).
> **Placement proxy:** v1 ends at the first winner (`win.ts:34`), so 1st = winner;
> 2nd–4th ranked by finished-token count then colorETF. "A beats B" = rank(A) < rank(B).
> Each game: seat0=A, seat1=B, seat2/3 = Easy fillers.

## Placement (A beats B)

| Pairing | Games | A beats B | mean rank A | mean rank B | terminated |
|---|---:|---:|---:|---:|---:|
| medium:easy | 100 | 52% | 2.39 | 2.43 | 100% |
| hard:easy | 100 | 50% | 2.42 | 2.49 | 100% |
| hard:medium | 100 | 55% | 2.22 | 2.49 | 100% |
| pro:medium | 10 | 70% | 1.7 | 2.7 | 100% |
| pro:hard | 10 | 60% | 2.2 | 2.1 | 100% |

## Mean turns-to-finish per pairing (F-1 stall early-warning; lower = faster)

| Pairing | mean turns |
|---|---:|
| medium:easy | 1285 |
| hard:easy | 1270 |
| hard:medium | 1317 |
| pro:medium | 1311 |
| pro:hard | 1226 |

## Gates (5D — regression-only, F-3: no ladder-adoption claims)

- Stall-guard: 100% termination on every pairing (no F-1 recurrence)
- Speed: mean turns at dice 2 < the dice-1 baseline (~1800 on this harness)
- Placement rates are recorded, NOT interpreted (n too small for claims)
