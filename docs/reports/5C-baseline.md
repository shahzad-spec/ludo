# 5C Baseline — Placement Ladder

> Generated 2026-08-14, seed 42, games: non-Pro 200, Pro 30.
> Weights: committed `EVAL_WEIGHTS` + `SCALE_PARAMS` (see src/oracle/ai/evaluate.ts). Hard = v1 `scoreMove` (F-1).
> **Placement proxy:** v1 ends at the first winner (`win.ts:34`), so 1st = winner;
> 2nd–4th ranked by finished-token count then colorETF. "A beats B" = rank(A) < rank(B).
> Each game: seat0=A, seat1=B, seat2/3 = Easy fillers.

## Placement (A beats B)

| Pairing | Games | A beats B | mean rank A | mean rank B | terminated |
|---|---:|---:|---:|---:|---:|
| medium:easy | 200 | 60% | 2.18 | 2.57 | 100% |
| hard:easy | 200 | 62% | 2.1 | 2.6 | 100% |
| hard:medium | 200 | 51% | 2.29 | 2.36 | 100% |
| pro:medium | 30 | 60% | 2.03 | 2.43 | 100% |
| pro:hard | 30 | 50% | 2.2 | 2.17 | 100% |

## Mean turns-to-finish per pairing (F-1 stall early-warning; lower = faster)

| Pairing | mean turns |
|---|---:|
| medium:easy | 1867 |
| hard:easy | 1809 |
| hard:medium | 1853 |
| pro:medium | 1886 |
| pro:hard | 1706 |

## Target gates (5C-4)

- Placement ordering: Pro > Hard > Medium > Easy
- Hard placement-beats Medium ≥ 55% (F-1: Hard stays on scoreMove — its only lever
  is the shared ETF-anchored scale constants, not EVAL_WEIGHTS; demote to ≥52% +
  backlog if unreachable, never silent)
- Pro placement-beats Medium ≥ 65% at ≥ 30 games (sample-size rule: n=10 is noise)
- All `it.skip` P-tests (P-2/P-3/P-4/P-5/P-8) unskipped and green (F-2)
- No tier stalls: mean turns-to-finish stays in normal range (no F-1 recurrence)