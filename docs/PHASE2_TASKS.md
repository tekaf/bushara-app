# Phase 2 Tasks Tracking

الحالة العامة: **No execution yet**  
الغرض: تتبع تنفيذ Phase 2 فقط بطريقة منظمة قبل وأثناء التنفيذ.

## Status Legend

- `pending`: لم يبدأ
- `in_progress`: قيد التنفيذ
- `done`: مكتمل
- `blocked`: متوقف بسبب عائق

---

## Execution Order

1. Backend Foundations (BE)
2. Provider Abstraction (PR)
3. Core Scheduling + Worker (API/WK)
4. Cancel/Reschedule Controls (API)
5. Retry + Status + Recovery (API/WK)
6. UI Flows (UI)
7. Test & Acceptance (TS)

---

## 1) Backend Foundations

- [x] **BE-01** — Schema Extension — `done`  
  Additive schema updates for `invites`, `guests`, and new `send_jobs`/`send_logs` collections without breaking legacy data.

- [x] **BE-02** — Workflow Transition Rules — `done`  
  Centralize invitation send workflow transitions and enforce valid state moves.

- [x] **BE-03** — Job Lock + Idempotency Model — `done`  
  Define lock fields and idempotency keys to prevent duplicate processing or double-send during retries/restarts.

---

## 2) Provider Abstraction

- [x] **PR-01** — WhatsApp Provider Interface — `done`  
  Introduce `WhatsAppProviderService` contract (`sendMessage`, `normalizeError`, optional status fetch) used by worker logic.

- [ ] **PR-02** — Default Provider Adapter — `pending`  
  Implement first provider adapter and map provider errors to transient/permanent classes.

---

## 3) Core Scheduling + Worker

- [x] **API-01** — Schedule Send Endpoint — `done`  
  Create schedule API with prerequisites validation and job creation for approved invitations.

- [x] **WK-01** — Dispatch Trigger — `done`  
  Pull due jobs and acquire processing lock safely.

- [x] **WK-02** — Job Processor Engine — `done`  
  Process guests with batching/throttling/concurrency controls and persist statuses/logs.

---

## 4) Cancel / Reschedule

- [x] **API-02** — Cancel Schedule Endpoint — `done`  
  Support schedule cancellation before sending starts and move invite back to `ready_for_scheduling`.

- [x] **API-03** — Reschedule Endpoint — `done`  
  Allow editing send time before execution starts.

---

## 5) Retry + Status + Recovery

- [x] **API-04** — Retry Failed Endpoint — `done`  
  Manual retry endpoint for failed guests under defined retry policy.

- [x] **API-05** — Send Status Endpoint — `done`  
  Return invitation-level summary and guest-level send breakdown.

- [x] **WK-03** — Retry Policy Engine — `done`  
  Enforce `maxAttempts`, auto-retry transient errors, and final failure state.

- [x] **WK-04** — Restart Recovery Logic — `done`  
  Reclaim expired locks and resume processing safely without duplicate sends.

---

## 6) UI Flows

- [x] **UI-01** — Scheduling Panel (User) — `done`  
  UI for selecting send time/timezone and confirming schedule.

- [x] **UI-02** — Cancel/Reschedule Controls — `done`  
  UI actions to cancel or reschedule while invite is still schedulable.

- [x] **UI-03** — Send Monitoring View — `done`  
  Display progress and statuses (`scheduled/sending/partially_sent/sent`) with live refresh.

- [x] **UI-04** — Retry Failed Action — `done`  
  UI trigger for retrying failed guests and reflecting updates immediately.

---

## 7) Test & Acceptance

- [ ] **TS-01** — Unit Tests: Workflow/Validation — `pending`  
  Verify transition guards and prerequisites logic.

- [ ] **TS-02** — Unit Tests: Provider Error Mapping — `pending`  
  Validate transient vs permanent error classification.

- [ ] **TS-03** — Integration: Schedule to Dispatch — `pending`  
  Confirm full path from scheduling to worker processing.

- [ ] **TS-04** — Concurrency/Idempotency Tests — `pending`  
  Simulate duplicate dispatch and worker restart to ensure no double-send.

- [ ] **TS-05** — API Acceptance Tests — `pending`  
  Validate schedule/cancel/reschedule/retry/status endpoints end-to-end.

- [ ] **TS-06** — UI Acceptance Tests — `pending`  
  Validate user flows for scheduling, monitoring, and retry actions.

---

## Phase 2 Exit Condition

- All critical tickets (`BE-03`, `WK-02`, `WK-04`, `API-01`, `API-05`, `TS-04`, `TS-05`) are `done`.
- Acceptance test report for Phase 2 is `PASS`.
- No duplicate send observed under retry/restart scenarios.

## Notes

- Transition `ready_for_scheduling -> approved` remains as-is for now by explicit decision.
- Re-evaluate later to tighten the state machine if fallback is proven unnecessary.
