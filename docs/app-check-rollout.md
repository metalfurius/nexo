# App Check rollout

Nexo initializes Firebase App Check with a reCAPTCHA Enterprise provider only when `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` is present in a production build. Token refresh is enabled, but enforcement is deliberately not controlled by application code.

## Observation window

1. Create the reCAPTCHA Enterprise key for `nexo.codeoverdose.es` and add its public site key as the repository variable `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`.
2. Deploy without enforcement and record the deployment timestamp.
3. Observe App Check metrics for at least seven complete days, including signed-in use, offline recovery, imports, catalog search and moderator workflows.
4. Investigate every legitimate unverified request before proceeding. Do not use a debug token in production.

## Enforcement order

1. Enable enforcement for callable and HTTP Functions.
2. Run the production catalog and moderator smoke against the deployed revision.
3. After Functions remain healthy, enable Firestore enforcement.
4. Repeat the production smoke and the offline reconnect scenario.

If legitimate traffic is rejected, disable enforcement for the affected product while keeping token collection enabled. No data migration or destructive rollback is involved.
