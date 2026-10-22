# NextJOB for Google Play

Status on **2026-10-22**: NextJOB is created in Google Play Console as app `4975382845407304876`, package `com.markom91.nextjob`. The rebuilt, signed API 36 AAB was accepted and release **0.1.0 internal test** is saved as a draft. Play App Signing is configured. **No rollout or publication has occurred; paid Android downloads are not ready.** The draft's remaining Console warning is that no testers are configured. No Play payment product or submitted store listing has been created.

The package uses Google's Trusted Web Activity (TWA) architecture, generated with Bubblewrap 1.25.0. It opens the existing NextJOB experience directly on Add CV and keeps the current professional design, reviewed profile, local-first job search, and tailored CV templates. A supporting Android browser renders the app; an internet connection is required. Browser file selection and PDF handling must be verified on a real Android device.

The Android source targets API 36 and includes Android Browser Helper's Play Billing bridge 1.2.0 (Play Billing Library 8.3.0). This bridge **does not implement the web checkout or verify purchases**. Notifications are disabled because actual job-alert delivery is not implemented. It does not request location, camera, contacts, or broad storage access.

## What is prepared

- `project/`: generated Android/Gradle source, launcher, Digital Goods bridge, adaptive icons and splash resources.
- `assets/`: 192px and 512px PNG icons derived from the current NextJOB logo, editable SVG and a 1024 × 500 RGB feature graphic.
- `web-public/`: generated PNG icons, web manifest and Digital Asset Links file using the confirmed Play app-signing certificate. These assets are mirrored into the website's `public/` directory for deployment; live association verification remains pending.
- `release-config.json`: confirmed package `com.markom91.nextjob`, current Site URL, version `0.1.0`/code `1`, Play signing fingerprint and proposed one-time product ID `tailored_cv_download`. Future bundles must use a higher version code after this accepted upload.
- `store-listing.md`: store copy and graphics requirements, with unavailable features excluded.
- `qa.md`: Android acceptance cases, including paid-download and recovery failures.

## Generate and inspect locally

Use Node 22.13 or newer. From the repository root:

```powershell
npm ci --prefix android --ignore-scripts
npm run generate --prefix android
npm run check --prefix android
npm run check:public --prefix android
```

`check` verifies the generated source and PNG dimensions. `check:public` probes the production URL without cookies or sign-in and reports remaining release gaps. A passing source check is not proof of build, device quality, policy compliance, or Play approval. The public check deliberately fails until outstanding checkout, privacy, and device-release work is completed; remove those pending checks only after implementing and validating the corresponding work.

Generation uses a short-lived loopback server for local icon bytes. It does not access the user's CV, credentials, or production data. Regeneration overwrites generated project files: keep customizations in `scripts/generate.mjs` or preserve them explicitly before running it. It applies Maven Central in place of JCenter and enables release lint checks. The packaging dependencies are development tools, isolated from the website and Android runtime. Transitive versions are pinned in this package's lockfile; inspect `npm audit --prefix android` before each release.

The current toolchain audit still reports 12 findings (8 high, 4 moderate), propagated from `extract-zip`, `node-forge` and `file-type`; npm reports no available compatible fixes. The generator imports packaging modules directly and does not invoke the affected SDK archive extraction or certificate-verification clients. Its image input is the local generated PNG, not untrusted CVs or remote icons. Do not extend this tool to process arbitrary downloaded archives or images without reviewing these advisories. These Node packages are not included in the Android application or website runtime.

## Release work, in order

1. **Google Play Console**: NextJOB and its internal-test draft are created. Add the intended testers' Google-account emails, then continue from the saved release after resolving test access. This account explicitly requires a closed test with at least **12 opted-in testers for 14 continuous days**, followed by an application for production access. Handle any remaining identity/device verification or payment-profile prompts shown by Console.
2. **Public service URL**: the existing Site is owner-private, so store users and reviewers cannot use it. Select a stable public HTTPS origin and make its app, manifest, privacy page, icons and `/.well-known/assetlinks.json` publicly reachable. Public website access must preserve owner-isolated guest data and never expose CVs or generated files. Moving to another domain changes browser cookies and access to existing guest workspaces; migration/recovery needs a separate design. Do not require a new app account to upload a CV or view matches.
3. **Privacy and deletion**: replace the existing placeholder privacy page with an accurate policy naming the developer, support contact, CV/AI processing providers, security, retention, deletion and purchase handling. Implement the stated deletion process; clearing browser cookies is not server-side deletion. Complete Play Data safety using actual production data flows and processor contracts. If an app-created account is offered, supply both in-app and public-web account-deletion paths. Document any legally retained purchase records separately. Review CV AI outputs and determine whether Google's AI content reporting requirements apply; do not assume a generic resume productivity tool is automatically exempt.
4. **Google Play CV purchases**: integrate the Digital Goods and Payment Request APIs in the web app. Use a consumable one-time product for one tailored CV; propose an Italian base price of €1.50 and display Play's actual localized product price. Authenticate a backend service to the Android Publisher API, verify package/product/token/purchase state, bind the verified token to the guest workspace and selected job, grant download access idempotently, and then acknowledge/consume as appropriate. Handle cancellation, pending purchases, duplicate requests, interrupted verification and refunds. Save a recoverable entitlement before consuming a token; consumed purchase history is not recoverable through `listPurchaseHistory()` on the current bridge. Define a recovery mechanism compatible with guest use before charging money. Never grant access from a client-only success or let one purchase unlock arbitrary jobs. Do not direct Android users to Stripe unless an applicable regional Google program has been enrolled in and its requirements implemented. Keep web checkout independent. The current worker's `Permissions-Policy: payment=()` must also be revised to allow the chosen payment flow on its own origin. Payment provider detection must fail closed on Android rather than falling back to Stripe.
5. **Android toolchain and signing**: lint/build, local signing and bundle validation passed; Console accepted the signed AAB. Preserve the existing upload key and arrange a secure independent backup. Future builds must be signed with that key and use a higher version code. No signing password or service-account JSON belongs in source control. Physical Android device QA remains pending.
6. **Domain association**: the Play **app-signing** certificate is recorded in `playSigningSha256`; matching Asset Links are staged and copied to `public/`. Deploy and verify them at the configured origin. Console navigation is **Protected with Play → Play Store protection → Show details → Manage Play app signing**. The app-signing fingerprint differs from the upload certificate. Verify the Play-installed build opens without a browser address bar; debug sideload validation is separate.
7. **Store review**: complete the listing, truthful screenshots using a fictional QA CV, feature graphic, content-rating questionnaire, audience, ads declaration, Data safety, app-access instructions and country availability. Launch internal testing first; run all `qa.md` scenarios using a Play-installed build and license testers, then the required closed testing. Submit for production review only after the service and purchases work for users other than the owner.

## Current blockers observed on 2026-10-22

- Public support/privacy contact and internal tester emails are still needed. The app and internal-test release are created, but the draft has no testers and is not rolled out.
- Site owner-private; app screenshots contain personal CV data and are unsuitable for public marketing.
- Java signing tools are available in ignored `outputs/android-release/toolchain`; APK/AAB compilation passed in GitHub Actions. A physical Android device test has not been performed.
- Google Play product and server purchase verification remain unconfigured. The website now supports configurable Stripe purchases, immutable CV grants, recovery links and future subscriptions; see `docs/billing.md`.
- Current privacy/terms/settings pages do not provide a complete retention/deletion implementation.
- Website payment checkout currently disabled because production Stripe credentials are absent. Enabling Stripe would not complete Android Play Billing.
- Public Digital Asset Links reachability and the Play-installed build's domain verification still need confirmation. The package and Play app-signing certificate are confirmed in source configuration.

The Android launcher now preserves `source=android` on all own-origin deep links so a fresh app launch cannot accidentally select web checkout. The signed bundle was rebuilt from Android source commit `19247dc9d7942448ea623acfd905923f561de5ba` on 2026-10-22 and includes this fix. See `internal-testing.md` for the current Console handoff and exact certificate fingerprint.

## Local signing preparation

`scripts/sign-bundle.ps1 -JavaHome <JDK directory>` creates or reuses the local upload key, signs a downloaded CI bundle and verifies the JAR signature. The key and Windows-DPAPI encrypted password live under ignored `android/private/`, with access restricted to the current Windows user and SYSTEM. They are never uploaded to GitHub. The protected password depends on this Windows user profile; preserve the key and arrange a secure independent backup before relying on it for production updates. Do not delete or replace the original key after Play associates it with the app.

The prepared file is `outputs/android-release/nextjob-0.1.0-upload.aab`; the public upload certificate and a nonsecret signing receipt are alongside it. It passed Google's bundle validation and reports package `com.markom91.nextjob` and target API 36. The upload certificate is not the Google Play app-signing certificate needed for website Digital Asset Links.

## Official references

- [Google's TWA architecture and domain verification](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [API 36 target requirement](https://developer.android.com/google/play/requirements/target-sdk)
- [Current Bubblewrap / Play Billing 8 migration](https://github.com/GoogleChrome/android-browser-helper/blob/main/playbilling/docs/play-billing-library-8-migration.md)
- [Digital Goods and Play payments](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)
- [Google Play payments policy and regional programs](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)
- [New personal account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [User data and privacy policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [Account deletion rules](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Store graphics specifications](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
