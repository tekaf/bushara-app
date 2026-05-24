# Risk Case v1 Go-Live Checklist

## Scope
- Hardening and operational safety only.
- No new feature logic added.

## 1) Rules Hardening
- Storage rules hardened:
  - `templates/*` write changed from public to admin-only.
  - `fonts/*` write kept admin-only.
- Firestore rules hardened:
  - `templates` write is now admin-only.
  - `invitation_internal`, `invitation_reviews`, `risk_case_dispatches`, `risk_case_waves`, `risk_case_access_links`, `send_jobs`, `send_logs`, `dispatch_kernel_events`, `dispatch_kernel_locks` are admin-only.
  - Invite/guest/payment access narrowed to owner/admin patterns.

## 2) Provider Safety
- Production guard added:
  - Mock provider (`mock`, `test-mock`) is blocked when `NODE_ENV=production`.

## 3) Public Link Safety
- Shared-access link generation hardened:
  - Uses `APP_BASE_URL` / `NEXT_PUBLIC_APP_URL` first.
  - Rejects localhost public base URL in production.
- Risk-case invitation link origin hardened:
  - Prevents localhost origin from being used in production link generation.

## 4) Secret Hygiene
- `.env.local` is ignored by git (`.gitignore` contains `.env*.local` and `.env`).
- `.env.local` is not tracked (`git ls-files -- ".env.local"` is empty).
- Required operational action (manual):
  - Rotate Meta WhatsApp token.
  - Rotate Resend API key.
  - Rotate any development-exposed secrets (cron/service credentials).

## 5) Final Permission Audit Notes
- Shared access token storage uses hash-only model (`tokenHash`).
- Token scope is invite-bound and checked on revoke/resolve.
- Manual/API dispatch mode overlap remains protected by dispatch kernel checks.

## 6) Remaining Risks
- Ensure Firebase Admin custom claims (`admin=true`) are correctly managed for admin users if any client-direct admin writes are required by rules.
- Run a production deploy smoke test after rotating secrets.

## Final Decision
- **Needs Follow-up** until secret rotation is completed and rules are deployed/validated in production environment.
- After those actions: **Ready for Production**.
