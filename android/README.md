# NextJOB for Google Play

Status: Android source generated; **not published and not ready to submit**. No APK or signed AAB has been compiled. No Google developer account, signing key, payment product, or store listing has been created by this preparation.

The package uses Google's Trusted Web Activity (TWA) architecture, generated with Bubblewrap 1.25.0. It opens the existing NextJOB experience directly on Add CV and keeps the current professional design, reviewed profile, local-first job search, and tailored CV templates. A supporting Android browser renders the app; an internet connection is required. Browser file selection and PDF handling must be verified on a real Android device.

The Android source targets API 36 and includes Android Browser Helper's Play Billing bridge 1.2.0 (Play Billing Library 8.3.0). This bridge **does not implement the web checkout or verify purchases**. Notifications are disabled because actual job-alert delivery is not implemented. It does not request location, camera, contacts, or broad storage access.

## What is prepared

- `project/`: generated Android/Gradle source, launcher, Digital Goods bridge, adaptive icons and splash resources.
- `assets/`: 192px and 512px PNG icons derived from the current NextJOB logo, plus the editable SVG.
- `web-public/`: proposed public PNG icons, web manifest and Digital Asset Links file. These files are staged here only, not deployed to the website. Asset Links are deliberately empty while the Play app-signing certificate is unknown.
- `release-config.json`: draft package `com.markom91.nextjob`, current Site URL, initial version and proposed one-time product ID `tailored_cv_download`. Confirm the permanent package ID before the first Play upload. Regenerating after changing the package ID should use a clean project directory so old Java package files do not remain.
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

1. **Google Play Console**: the owner creates or selects a developer account, completes identity/device verification and payment profile setup as requested by Google. Account agreements and fees are handled by the owner. For a personal account created after 13 November 2023, plan a closed test with at least 12 opted-in testers for 14 continuous days, followed by an application for production access.
2. **Public service URL**: the existing Site is owner-private, so store users and reviewers cannot use it. Select a stable public HTTPS origin and make its app, manifest, privacy page, icons and `/.well-known/assetlinks.json` publicly reachable. Public website access must preserve owner-isolated guest data and never expose CVs or generated files. Moving to another domain changes browser cookies and access to existing guest workspaces; migration/recovery needs a separate design. Do not require a new app account to upload a CV or view matches.
3. **Privacy and deletion**: replace the existing placeholder privacy page with an accurate policy naming the developer, support contact, CV/AI processing providers, security, retention, deletion and purchase handling. Implement the stated deletion process; clearing browser cookies is not server-side deletion. Complete Play Data safety using actual production data flows and processor contracts. If an app-created account is offered, supply both in-app and public-web account-deletion paths. Document any legally retained purchase records separately. Review CV AI outputs and determine whether Google's AI content reporting requirements apply; do not assume a generic resume productivity tool is automatically exempt.
4. **Google Play CV purchases**: integrate the Digital Goods and Payment Request APIs in the web app. Use a consumable one-time product for one tailored CV; propose an Italian base price of €1.50 and display Play's actual localized product price. Authenticate a backend service to the Android Publisher API, verify package/product/token/purchase state, bind the verified token to the guest workspace and selected job, grant download access idempotently, and then acknowledge/consume as appropriate. Handle cancellation, pending purchases, duplicate requests, interrupted verification and refunds. Save a recoverable entitlement before consuming a token; consumed purchase history is not recoverable through `listPurchaseHistory()` on the current bridge. Define a recovery mechanism compatible with guest use before charging money. Never grant access from a client-only success or let one purchase unlock arbitrary jobs. Do not direct Android users to Stripe unless an applicable regional Google program has been enrolled in and its requirements implemented. Keep web checkout independent. The current worker's `Permissions-Policy: payment=()` must also be revised to allow the chosen payment flow on its own origin. Payment provider detection must fail closed on Android rather than falling back to Stripe.
5. **Android toolchain and signing**: install Android Studio/JDK and SDK 36 after the owner handles any installation/license prompts. Open `android/project` in Android Studio, let Gradle sync, run lint and build a debug APK for device QA. Choose a permanent upload keystore and store its password securely outside Git. Use Android Studio's Generate Signed Bundle flow for an Android App Bundle, with Play App Signing configured in Console. Unsigned Gradle `bundleRelease` output cannot be submitted as a signed release. No signing password or service-account JSON belongs in source control.
6. **Domain association**: copy the SHA-256 **app-signing** certificate from Play Console (not merely the upload certificate) into `playSigningSha256`, regenerate, and deploy `web-public/.well-known/assetlinks.json` at the configured origin. Verify the Play-installed build opens without a browser address bar. If a sideload test uses a different signing certificate, associate it separately only where appropriate; do not mistake debug validation for Play signing validation.
7. **Store review**: complete the listing, truthful screenshots using a fictional QA CV, feature graphic, content-rating questionnaire, audience, ads declaration, Data safety, app-access instructions and country availability. Launch internal testing first; run all `qa.md` scenarios using a Play-installed build and license testers, then the required closed testing. Submit for production review only after the service and purchases work for users other than the owner.

## Current blockers observed on 4 October 2026

- Google Play Console account and developer/support identity not yet provided.
- Site owner-private; app screenshots contain personal CV data and are unsuitable for public marketing.
- Java/Android SDK unavailable in this workspace; no Android build or device test performed.
- Google Play product, server purchase verification and recoverable guest entitlement absent.
- Current privacy/terms/settings pages do not provide a complete retention/deletion implementation.
- Website payment checkout currently disabled because production Stripe credentials are absent. Enabling Stripe would not complete Android Play Billing.
- App ID and signing certificate are draft/unconfirmed.

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
