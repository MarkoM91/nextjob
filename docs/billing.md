# CV download billing

The initial offer is a **€1.50 one-time CV download**, with free CV creation and previews. A payment unlocks the reviewed CV version in PDF, DOCX and TXT, including repeat downloads of that copy for seven days. Prices, product identifiers and the repeat-download period are server configuration; changing future prices does not invalidate old paid orders.

`monthly_subscription` is implemented as a separate payment model but **sales are disabled by default**. Existing paid subscriptions are still honored if new subscription sales are disabled. No user is automatically enrolled in a subscription, and the ordinary one-time purchase remains the default checkout action.

## Data and access

`drizzle/0002_tranquil_whistler.sql` adds these D1 tables:

| Table | Purpose |
| --- | --- |
| `billing_cv_versions` | Owner, content/design version ID, job and immutable private storage prefix |
| `billing_orders` | Server-owned amount/currency/product/model snapshot; provider IDs, payment status, timestamps |
| `billing_entitlements` | One grant per paid order, specific CV version, expiry and revocation |
| `billing_customers` | Private workspace to provider-customer mapping, supporting future subscriptions |
| `billing_subscriptions` | Provider subscription/price, current status, paid-period end and scheduled cancellation |
| `billing_events` | Deduplicated provider events, recorded after successful processing |

Guest workspace IDs deliberately do not reference the optional accounts table. A guest can pay without creating a NextJOB account. IDs and ownership always come from the signed server session, never browser-supplied owner fields.

The CV version hashes the server's reviewed document text, résumé content, design and target job. Generation timestamps and PDF creation timestamps do not trigger another charge. Before checkout, the PDF and source text are copied to `private/<owner>/cv-versions/<version>/`. Later edits use a different version; downloading the original purchased version uses its frozen copy, even if the current profile or live job changes. The `/billing` page lists copies still within their repeat-download period. Access expiry is not an automatic file-deletion policy; retention/deletion needs its own implementation and privacy disclosure.

Payment processing is separate from feature access. `cvAccess()` combines a valid version-specific purchase with an active subscription whose paid period has not ended. Future saved versions, templates, cover letters, AI tools and tracking can use the same subscription state without redesigning orders or payments. Existing free product features are not newly paywalled in this release.

## Checkout and fulfillment

1. The public pricing endpoint supplies UI prices; the server ignores any requested charge amount or owner ID. A stale displayed amount requires review before checkout.
2. The server freezes the reviewed CV, reserves one pending order per owner/version/model and uses that order as the Stripe idempotency key. Double clicks and retries reuse the checkout. Active paid access returns a download link without creating another checkout.
3. Stripe-hosted Checkout collects payment details. NextJOB does not collect card numbers or send the CV/contact information to Stripe. Metadata contains opaque workspace, order and CV-version identifiers; the item name is generic.
4. The return route retrieves the Stripe session and validates its saved order, owner, model, version, amount, currency and paid state. Signed webhooks use the same fulfillment function, so access does not depend on the browser returning.
5. D1 grants access atomically and only once. Replaying events or refreshing the return URL cannot extend the original grant.
6. The success screen confirms access from the server and starts the selected download. A manual button remains available. Cancelled, failed and pending payments keep the preview available and never grant access from URL parameters alone.
7. Refunds and new disputes revoke the affected order's grant. Late completion events cannot restore revoked access. Dispute reversals currently require a deliberate support decision; they do not automatically extend access.

The app uses hosted Checkout's configured payment methods, including eligible wallet options where enabled in Stripe. The original CV file, email, phone and career history are not sent to Stripe by this integration. Stripe may independently collect email and billing information in its own checkout.

## Configuration

Defaults are `CV_DOWNLOAD_PRICE_CENTS=150`, `BILLING_CURRENCY=eur`, `CV_DOWNLOAD_PRODUCT_ID=cv_download`, `CV_REDOWNLOAD_DAYS=7`. The future monthly default is `MONTHLY_SUBSCRIPTION_PRICE_CENTS=200`, with logical product `monthly_subscription`.

Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and the stable HTTPS `PAYMENTS_PUBLIC_ORIGIN` through Site secrets. Optionally set `STRIPE_CV_DOWNLOAD_PRICE_ID` to a predefined Stripe price; the backend verifies the price is active, one-time and matches the configured amount/currency. Otherwise the backend creates an inline price, optionally attached to `STRIPE_CV_DOWNLOAD_PRODUCT_ID`.

Only set `PAYMENTS_ENABLED=true` after the D1 migration, private R2 storage and reachable webhook have been tested. A private Sites hosting gate currently prevents unauthenticated Stripe webhook deliveries and ordinary Android users from accessing the app. Website publishing/access changes are a separate release step; this implementation preserves the existing Site audience.

Register `/api/payments/webhook` for:

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`;
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`;
- `invoice.paid`, `invoice.payment_failed`;
- `charge.refunded`, `charge.dispute.created`.

Server API requests pin Stripe API `2024-06-20`; subscription handling also accepts the newer invoice-parent and item-period fields. Configure webhook delivery accordingly and verify real test-mode events before live activation. The raw webhook body is signature-checked, a five-minute replay window is enforced and failed writes return 503 so Stripe retries. Provider failure messages and CV content are not exposed to users.

To offer subscriptions later, create a monthly recurring Stripe price matching the configured amount/currency, set `STRIPE_MONTHLY_SUBSCRIPTION_PRICE_ID`, configure Stripe's customer portal for cancellation, test the lifecycle and recovery flows, then explicitly set `MONTHLY_SUBSCRIPTIONS_ENABLED=true`. Until then, no subscription offer appears. Existing subscription holders can open their own Stripe customer portal from `/billing`, even when new subscription sales are disabled. Cancellation scheduled at the end of a paid period preserves access until that date; cancelled, expired and past-due subscriptions do not unlock new downloads. Existing one-time grants remain independent.

## Android and release limits

The Android launch marker and Digital Goods feature detection select the Android payment surface. Android checkout currently fails closed with `PLAY_BILLING_NOT_CONFIGURED`, rather than falling back to Stripe. Google Play's Digital Goods/purchase-verification adapter still needs implementation and Play Console configuration before paid Android release. Provider columns and shared entitlements allow adding this adapter without changing the business models.

No live Stripe credentials have been supplied or real charges made during implementation. After a one-time purchase, the user can copy a private signed recovery link. It grants only that purchased CV, expires with the original grant, is checked against current refund/revocation state and does not restore or expose the rest of the guest workspace. Someone who has the link can download that CV, so the UI explicitly asks the user to keep it private. No recovery emails are automatically sent. Losing both the workspace cookie and the recovery link still requires support; the public support/privacy contact remains to be chosen. Clearing a browser cookie does not delete server-side CV files or payment records.

See [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment) and [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks). Use Stripe test mode for successful, declined, cancelled, pending, duplicate, interrupted, refund and subscription tests. Do not accept live money until the webhook, recovery/support route and guest ownership checks have passed production QA.
