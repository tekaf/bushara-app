# Phase 2 Acceptance Tests

الهدف: التحقق الكامل من تدفق Phase 2 (Scheduling + Sending + Monitoring + Recovery) قبل أي مرحلة جديدة.

## Scope

- API-01: Schedule Send
- API-02: Cancel Schedule
- API-03: Reschedule Send
- API-04: Retry Failed (Manual)
- API-05: Send Status
- WK-01: Dispatch pickup
- WK-02: Process job engine
- WK-03: Auto retry transient/throttled
- WK-04: Stalled/restart recovery
- UI-03: Monitoring View
- UI-04: Retry Failed UI action
- Race basics: lock/idempotency + duplicate dispatch pickup

## Test Scenarios

- **P2-AC-01**: Schedule send success (paid + approved + valid future datetime + guests)
- **P2-AC-02**: Schedule send rejects invalid preconditions (past date / not paid / invalid workflow / no guests)
- **P2-AC-03**: Cancel schedule success before sending
- **P2-AC-04**: Reschedule success before sending (replace active job safely)
- **P2-AC-05**: Process job end-to-end (mock provider mixed outcomes)
- **P2-AC-06**: Provider success/failure mapping reflected in guests + send_logs
- **P2-AC-07**: Auto retry for transient/throttled only, maxAttempts=3 respected
- **P2-AC-08**: Manual retry failed via API-04
- **P2-AC-09**: Send-status API summary/breakdown/jobs consistency
- **P2-AC-10**: Monitoring UI shows current status + summary + active jobs
- **P2-AC-11**: Retry UI appears only with failed guests, disabled with active job, refreshes after action
- **P2-AC-12**: Stalled recovery reclaims dispatching/processing with expired/missing lock
- **P2-AC-13**: Basic race checks (single lock winner + no duplicate dispatch pickup)

## Execution Notes

- Provider mode for deterministic tests: `WHATSAPP_PROVIDER=mock`
- Local app URL: `http://localhost:3000`
- Final automated report path: `docs/PHASE2_TEST_RUN_REPORT.json`
- UI artifacts path: `docs/artifacts/phase2-ui/`

