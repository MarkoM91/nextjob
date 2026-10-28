# NextJOB for Google Play

Current closed-test release: **0.1.1 / version code 2**, package **com.markom91.nextjob**. This native Android WebView shell replaces Bubblewrap/TWA version 0.1.0/code 1. It passed CI, was signed and uploaded, and is available to selected testers. On **2026-10-27**, Google Play confirmed that the release is published and at least 12 testers have opted in. The required 14 continuous days remain incomplete; production access is not granted. The owner reports working upload, preview and Back flows; extended device QA remains outstanding.

Billing candidate **0.1.2 / code 3** adds native Play Billing, authenticated server verification and interrupted-purchase recovery. Sales remain disabled until product/API configuration and controlled purchase QA are complete. See `play-billing.md`.

Google Play app ID: `4975382845407304876`. Preserve the existing upload key in ignored `android/private/`; never create a replacement key or publish its password. The Play app-signing certificate remains configured in `release-config.json` for verified Android app links.

## Architecture

- A native `Activity` hosts only the configured HTTPS origin, with JavaScript/DOM storage for the existing app and PDF.js previews.
- File/content URL navigation, mixed content, third-party cookies, debugging and broad device permissions are disabled. No JavaScript/native interface, TWA launcher or delegation service is exposed. Native billing handles only the exact own-origin main-frame purchase route and requires price confirmation.
- Own-origin incoming deep links retain their encoded query/fragment and receive `source=android`. The user agent includes the configured `NextJOBAndroid/<version>` marker. Only the billing-enabled wrapper can start Play checkout, and only when server configuration explicitly permits it.
- PDF/DOCX uploads use the system document picker, explicit URI read grants, type/size/header checks and cancellation callbacks. They do not request broad storage or camera access.
- Entitled PDF/DOCX/TXT exports are fetched with the app's cookies, restricted routes, same-origin redirects and a 12 MB bound. Bytes remain in memory until the user chooses a save location. Network and save failures offer retry; no private document is handed to an external browser.
- Employer links open in the default browser. Back follows page history; native loading, connection and retry states cover main-page failures.
- WebView has its own cookie storage. Existing Chrome/TWA guest workspaces do not transfer automatically. Social OAuth is explicitly unavailable in this build; guest creation and preview remain available. Rotation preserves page history but a pending file/save dialog may need retry.

## Generate and validate

From the repository root:

```powershell
npm ci --prefix android --ignore-scripts
npm run generate --prefix android
npm run check --prefix android
```

`generate` refreshes public icons, manifest, Digital Asset Links and `project/wrapper-manifest.json`. It does not generate/replace native Java source, download an SDK or touch signing material. Gradle reads identity, launch URL and version directly from `release-config.json`.

The Android workflow runs `testDebugUnitTest`, debug/release lint, debug APK compilation and unsigned AAB compilation with API 36/JDK 17. JVM policy tests cover unsafe URLs, deep-link markers, download origins/routes/MIME and size limits. They do not replace device testing of the document picker, PDF rendering, downloads, Back, keyboard or lifecycle behavior.

`npm run check:public --prefix android` also probes live service/association access and reports remaining release work. Passing source checks is not evidence of public availability or Play approval.

## Release work still required

1. Continue closed testing and review feedback. Testers Community reports 15 active testers on day 1 of its 16-day service cycle. Google separately requires at least 12 continuously opted-in testers for 14 days before applying for production access.
2. Complete the extended checks in `qa.md`, including interrupted uploads, offline recovery, workspace persistence and exports once payments are ready.
3. The Google Payments merchant profile is created; the owner reports completing payout-method setup and service-fee enrollment. One-time product creation requires uploading the new billing-enabled build to an internal test track.
4. Configure the Play product and dedicated backend API access, then complete controlled purchase/device QA in `play-billing.md` before enabling Android paid CV exports. Website Stripe does not supply native Play Billing.
5. Apply for production access once Google enables the application, then submit the production release. Keep Play declarations and privacy disclosures aligned with newly enabled payment or email features.

The website and privacy page are public, required listing/content declarations are saved, and the existing Starter credit was used for the submitted closed test. Domain purchase and email activation are postponed. See `closed-testing.md` for verified status.

Testers Community's refusal of TWA submissions is its service restriction. Do not describe its engagement theory as a verified Google policy or promise that WebView conversion guarantees approval.

## Signing and artifacts

`scripts/sign-bundle.ps1 -JavaHome <JDK directory>` reuses the existing upload key and Windows-DPAPI protected password under ignored `android/private/`. Preserve a secure independent backup: DPAPI depends on this Windows profile. No secret belongs in Git.

Signed output: `outputs/android-release/nextjob-0.1.1-upload.aab`. A local `signing-receipt.json` records whichever bundle was most recently signed; verify the version and receipt before any future upload.

The upload certificate differs from Google's Play app-signing certificate. Find the latter under **Protected with Play → Play Store protection → Show details → Manage Play app signing**. `web-public/.well-known/assetlinks.json` is staged for the existing website; keep its public counterpart and Play-installed links verified.

Official references: [WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview), [file chooser](https://developer.android.com/reference/android/webkit/WebChromeClient), [Play Billing](https://developer.android.com/google/play/billing/integrate), [testing tracks](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en).

