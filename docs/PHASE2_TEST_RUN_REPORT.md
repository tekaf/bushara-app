# Phase 2 Test Run Report

تاريخ التشغيل: `2026-03-08`  
الملف الخام: `docs/PHASE2_TEST_RUN_REPORT.json`  
وضع المزود أثناء الاختبار: `mock`

## Result Summary

- **PASS:** 6
- **FAIL:** 4

## Scenario Results

- `P2-AC-01` — Schedule send success — **PASS**
- `P2-AC-02` — Schedule send rejects invalid preconditions — **PASS**
- `P2-AC-03` — Cancel schedule success before sending — **PASS**
- `P2-AC-04` — Reschedule success before sending — **PASS**
- `P2-AC-05/06/07` — Process job + provider mapping + auto retry behavior — **FAIL**
- `P2-AC-08` — Manual retry failed via API-04 — **FAIL** (blocked by AC-05/06/07)
- `P2-AC-09` — Send-status API consistency — **FAIL** (blocked by AC-08)
- `P2-AC-10/11` — Monitoring UI + Retry UI action — **FAIL** (blocked by AC-09)
- `P2-AC-12` — Stalled recovery / restart recovery — **PASS**
- `P2-AC-13` — Race basics: duplicate dispatch pickup prevented — **PASS**

## Failures Needing Closure

### 1) AC-05/06/07 — Process job / provider mapping / auto retry
- **Observed result:** `process-job` returned `500`.
- **Root cause from server logs:** Firestore rejected `send_logs.providerResponse` because it received non-plain object (`rawError` object in retry failure logs).
- **Required closure fix:** sanitize `providerResponse` before writing to Firestore (store plain JSON-safe fields only).

### 2) AC-08 — Manual retry failed
- **Observed result:** not executed due dependency failure.
- **Reason:** AC-08 requires a completed AC-05/06/07 run producing failed guests.
- **Required closure fix:** close AC-05/06/07 first, then re-run.

### 3) AC-09 — Send-status API
- **Observed result:** blocked by AC-08 dependency.
- **Required closure fix:** close AC-08 first, then re-run.

### 4) AC-10/11 — Monitoring UI + Retry UI
- **Observed result:** blocked by AC-09 dependency.
- **Required closure fix:** close AC-09 first, then re-run UI check.

## Closure Scope (Next Step)

- No Phase transition.
- Start **Phase 2 Failure Closure Round** only for:
  - `P2-AC-05/06/07` primary root cause
  - dependent rerun of `P2-AC-08`, `P2-AC-09`, `P2-AC-10/11`

