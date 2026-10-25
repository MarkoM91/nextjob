# Job alerts

In-app alerts are private to the signed guest or account workspace. There is no
account requirement. Both channels default to off. Saving an enabled channel
requires a confirmed CV. Alert searches use that CV's current job preferences,
country and work style, and prioritize the candidate's city before wider areas.
Only eligible, relevant roles meeting the selected 72/85 score threshold qualify.

The first successful check, and a change to matching criteria, establishes a
baseline without sending historical vacancies. Later checks deduplicate job IDs.
Inbox read state is durable. The bell displays a real unread count only when the
in-app channel is enabled; it does not request Android push permissions.

## Background checks

The Site publishes the owner-only `check_job_alerts` MCP tool. Sites verifies the
caller; the tool additionally checks the verified identity against the secret
`NOTIFICATION_ADMIN_EMAIL`. Guest cookies do not grant access. No credentials
belong in scheduler prompts, source or URLs.

The linked hourly Sites task calls this tool. Each run processes up to ten due
workspaces and twenty queued deliveries, with database leases preventing duplicate
runs. Workspaces rotate by next due time. For larger usage, replace the bounded
hourly task with a managed queue and increase throughput after checking provider
limits. There is no guaranteed real-time delivery SLA in this initial version.

Saving in-app preferences establishes the baseline immediately. A failure records
a safe error code, leaves the existing baseline intact and retries next hour.
Routine runs mutate D1/R2, not source; they never republish the Site.

## Email activation (currently disabled)

No Resend account or sending domain has been supplied. All real email sending is
off, and the UI says this explicitly. Before activation:

1. Verify a sending domain in Resend, including the provider's required DNS records.
2. Configure `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` and
   `RESEND_WEBHOOK_SECRET` using Sites runtime secrets. Keep keys out of Git/chat.
3. Register `https://role-radar.markom91.chatgpt.site/api/notifications/webhook`
   for `email.delivered`, `email.bounced`, `email.complained` and `email.failed`.
4. Set `NOTIFICATION_EMAIL_ENABLED=true` and deploy the runtime revision.
5. Verify an explicitly consenting test recipient through the app; check the
   confirmation, digest, unsubscribe, quiet hours and bounce events end to end.
6. Update the public privacy notice's activation status and Google Play Data
   Safety purposes/processors before making the email channel generally available.

Email is separately opted in; the CV's email is never automatically subscribed.
Verification tokens expire after 24 hours, are single use and bound to a contact
revision. A GET displays confirmation; a POST activates consent. Resending is
limited to one per minute and five per UTC day per workspace, with an additional
cross-workspace destination check. Destination values and queued messages use
AES-GCM with a purpose-derived AUTH_SECRET key. Rotating AUTH_SECRET requires a
planned migration of encrypted alert data as well as existing sessions.

Digests contain a generic workspace link, not CV content or a private session.
Opening an email on another device does not recover the original guest workspace.
Every digest has a signed unsubscribe link and RFC8058 one-click headers.
Unsubscribe needs no login; it does not disable the in-app channel. A new opt-in
invalidates earlier unsubscribe links. A message already submitted to a provider
cannot be recalled if the recipient unsubscribes concurrently.

Daily/weekly digests respect the saved timezone and quiet hours, with at most one
new digest per selected interval. Queue retries use exponential backoff, a stable
Resend idempotency key, five attempts and a maximum age below Resend's 24-hour
idempotency window. Permanent failures are retained for inspection rather than
automatically retried. Accepted and delivered are separate states. Authenticated
webhooks suppress bounced/complained destinations and cancel pending deliveries.
`NOTIFICATION_DAILY_SEND_LIMIT` defaults to 90 provider attempts per UTC day
across the app; requests exceeding the budget remain queued. Adjust this value
for the actual provider plan and workload.

Scheduled cleanup retains inbox/delivery history for 30 days and seen-job IDs for
45 days. Preference/contact records persist until removed with the workspace;
deletion requests are handled through the existing support process.

## Validation

`npm run test:alerts` exercises actual SQLite with the generated D1 schema.
`tests/notifications.integration.test.mjs` exercises the built Worker, including
ownership, CSRF, configuration gates, token consumption, scheduler authorization
and signed provider webhooks. No real email is sent by automated tests.
