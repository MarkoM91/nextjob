# Android CV download payments

Candidate: **0.1.2 / code 3**, `com.markom91.nextjob`. This adds the BILLING permission and Play Billing Library 9.1.0. It needs a successful Android build, upload to an internal test track, Google product configuration and physical-device payment QA before activation. The existing closed test can continue on 0.1.1; do not interrupt it just to prepare products.

The owner reports completing the merchant payments profile, payout-method setup and account-group/service-fee enrollment. No banking or legal details were copied into source. Product creation was last blocked by the uploaded app lacking the BILLING permission.

## Offer and configuration

Create a consumable **one-time product** with configurable ID `tailored_cv_download`, regular buy purchase option `download`, no rental, preorder, discount offers or multi-quantity option. Set the reference EUR price to **€1.50**, then review Google's regional prices. Keep subscriptions off. One purchase grants one immutable CV version in PDF, DOCX and TXT for the configured repeat-download period (default seven days).

The website displays the server-configured EUR reference price. The native confirmation and Google Play purchase sheet display the actual localized Google price before payment. If the Play EUR price differs from the configured reference amount, native checkout refuses to start. For other currencies, Play's regional price governs. The server's order amount is the reference offer, not a receipt for the localized amount charged by Google.

Backend Site secrets/configuration:

| Name | Value / purpose |
| --- | --- |
| `GOOGLE_PLAY_BILLING_MODE` | `off` (default), `test` or `live`; never switch to live before QA |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL` | Google service account authorized for this app in Play Console |
| `GOOGLE_PLAY_PRIVATE_KEY` | Its PKCS8 PEM private key; backend secret only, never APK/source/chat |
| `GOOGLE_PLAY_PACKAGE_NAME` | Default `com.markom91.nextjob` |
| `GOOGLE_PLAY_CV_PRODUCT_ID` | Default `tailored_cv_download` |
| `GOOGLE_PLAY_PURCHASE_OPTION_ID` | Default `download` |
| `GOOGLE_PLAY_ALLOW_TEST_PURCHASES` | Explicit `true` for license-tester QA; otherwise test purchases are rejected |
| `CV_DOWNLOAD_PRICE_CENTS`, `BILLING_CURRENCY`, `CV_REDOWNLOAD_DAYS` | Existing server catalog; defaults 150, eur, 7 |

Enable the Google Play Developer API in the owner's Google Cloud project. Grant a dedicated service account only the Play permissions needed to view/verify orders and manage/consume this app's purchases. Do not use an APK-embedded key. The owner must approve any new account access and enter credentials through the secure Site-secret setup, not chat. A merchant payments profile is separate from these API credentials.

Test mode rejects real-money receipts on the backend. It cannot prevent Google from charging an account that is not configured as a license tester: use a license-test Google account on the phone and verify that Google's sheet explicitly shows a test payment method. Cancel if it shows a real card. Do not expose test mode to general testers before controlled purchase QA.

## Purchase and recovery

1. The server authenticates the signed guest workspace, freezes the reviewed CV and reserves its order. The browser cannot choose an owner, product, grant period or charge amount.
2. An exact same-origin main-frame `/android-billing` navigation enters native billing. No `addJavascriptInterface` is exposed to web frames. Native code retrieves the authenticated order over HTTPS with existing cookies, validates the product/option and shows the localized Google price for confirmation.
3. Google receives an opaque HMAC workspace identifier and an opaque purchase-profile/order ID. No CV, contact information or job details are sent to Google by this adapter. Backend secrets stay off the device.
4. Native callbacks and foreground `queryPurchasesAsync` send the purchase token to the server. Google Play Developer API v2 verifies the package endpoint, account/profile association, product, option, quantity, remaining refundable quantity, paid state, completion time and permitted test/live mode. Pending payments grant no access.
5. SQLite/D1 atomically binds the unique token hash and order, marks payment and grants the exact CV version. Token bodies are encrypted at rest with a purpose-specific AES-GCM key. Replays cannot move a token to another version or extend the original expiry.
6. Only after durable fulfillment does the server consume/acknowledge the purchase. A consumption failure preserves the grant and retries on app foreground and in the existing owner-only hourly maintenance task (bounded to 20 pending consumptions per invocation). The scheduled task's actual cloud execution still needs verification; manual invocation alone does not establish it.
7. The return URL alone grants nothing. The checkout screen checks server access and starts the selected export; the native system save picker remains available. Existing purchased versions bypass payment.
8. Every Play-funded paid access/download rechecks Google, including private recovery links. Refund/cancellation or zero remaining refundable quantity revokes the grant; stale success callbacks cannot revive it. A Google verification outage fails closed with retry, rather than exporting an unverified file. This adds API latency and quota use to paid downloads. RTDN/Voided Purchases reconciliation can be added later for proactive refund reporting; it is not claimed as implemented.

Consumed purchases no longer appear in Play's active-purchases query. Server entitlements plus the unchanged guest cookie recover normal app restarts. The existing private signed recovery link recovers only the purchased CV after cookie loss; users must deliberately save it. Do not promise automatic reinstall, cross-device or cleared-data workspace recovery.

## Required validation before activation

- Build/unit tests, debug/release lint and release AAB compilation; preserve the upload key and Play package.
- Upload the billing-enabled build to internal testing, create the product/option and review prices before enabling purchases.
- Install from Google Play with the authorized license tester; verify free preview, price, approved/cancelled/declined/pending test payments, all three export formats, same-version repeat downloads and a changed CV version.
- Interrupt the app after purchase but before verification/consumption; verify foreground and server retries. Verify airplane mode, process recreation, rotation, wrong-account recovery and repeated taps.
- Refund a test order and verify normal downloads and saved recovery links stop working; verify a delayed callback cannot restore access.
- Check Google API permissions, scheduled consumption retries, privacy disclosures and Play Data safety before live mode. No real payment is required for this QA.

Official references: [integration](https://developer.android.com/google/play/billing/integrate), [purchase verification](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2), [API access](https://developers.google.com/android-publisher/getting_started), [billing setup](https://developer.android.com/google/play/billing/getting-ready).
