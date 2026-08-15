# KAREN — Decision Validation v0

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Phase:** historical-validation  
**Status:** Instrument scaffold + smoke — **EDGE CLAIM: NONE**  
**Separate from:** Behavioural E2E harness (`test:karen-e2e-behavioural*`)

Mirror of worktree research note. See worktree for latest run artifacts.

## Run

```bash
cd .tmp/karen-final-integration
npm run test:karen-decision-validation:v0
npm run test:karen-decision-validation:pit
```

## Guarantees

- Bars at evaluation time *t* have `time <= asOf` only.  
- Poison-future bars never enter engine inputs; leak → INVALID.  
- Outcomes scored only after DecisionEnvelope freeze.  
- Production path: `evaluateAnalysisQualityGate` + desk pipeline (history suppressed).  
- No trading-logic changes in v0. No edge claim.

## Next

Larger chronological dataset + trading-logic correctness analysis.
