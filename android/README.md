# NextJOB for Google Play

Current candidate: **0.1.1 / version code 2**, package **com.markom91.nextjob**. This is a native Android WebView shell, replacing the previously accepted Bubblewrap/TWA version 0.1.0/code 1. The new source still needs CI compilation, signing, Google Play upload and physical-device QA. No production release has been published.

Google Play app ID: `4975382845407304876`. Preserve the existing upload key in ignored `android/private/`; never create a replacement key or publish its password. The Play app-signing certificate remains configured in `release-config.json` for verified Android app links.

## Architecture

- A native `Activity` hosts only the configured HTTPS origin, with JavaScript/DOM storage for the existing app and PDF.js previews.
- File/content URL navigation, mixed content, third-party cookies, debugging and device permissions are disabled. No JavaScript/native interface is exposed; no TWA launcher, delegation service or Play Billing bridge remains.
- Own-origin incoming deep links retain their encoded query/fragment and receive `source=android`. The user agent also includes `NextJOBAndroid/0.1.1` so the website keeps Android payments disabled.
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

1. Build and sign version code 2 using the existing upload key; verify the resulting AAB and replace the old code-1 candidate in the closed-test draft.
2. Make the website and privacy page accessible to external testers without a ChatGPT hosting login. Keep guest CV data private and owner-isolated.
3. Finish support/privacy contact, accurate processor/retention disclosures, server-side deletion, Data safety, app-content declarations and truthful store screenshots using a fictional CV. The feature graphic is prepared under `assets/`.
4. Keep Android paid CV exports unavailable until native Play Billing, backend token verification and purchase recovery are implemented and tested. Website Stripe does not supply native Play Billing.
5. Publish the closed-test release, add the paid provider's exact dashboard-supplied Google Group and submit the working closed-test opt-in link only after checking access. The existing provider credit is unused until submission. Root's `closed-testing.md` records service details.
6. Test the Play-installed build on a physical Android device using `qa.md`. This account requires at least 12 opted-in closed testers for 14 continuous days before applying for production access. Internal testing does not fulfill this requirement.

Testers Community's refusal of TWA submissions is its service restriction. Do not describe its engagement theory as a verified Google policy or promise that WebView conversion guarantees approval.

## Signing and artifacts

`scripts/sign-bundle.ps1 -JavaHome <JDK directory>` reuses the existing upload key and Windows-DPAPI protected password under ignored `android/private/`. Preserve a secure independent backup: DPAPI depends on this Windows profile. No secret belongs in Git.

Expected new signed output: `outputs/android-release/nextjob-0.1.1-upload.aab`. It does not exist until the new CI bundle is signed. A local `signing-receipt.json` records whichever bundle was most recently signed; never assume an old receipt proves the code-2 candidate.

The upload certificate differs from Google's Play app-signing certificate. Find the latter under **Protected with Play → Play Store protection → Show details → Manage Play app signing**. `web-public/.well-known/assetlinks.json` is staged for the existing website; keep its public counterpart and Play-installed links verified.

Official references: [WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview), [file chooser](https://developer.android.com/reference/android/webkit/WebChromeClient), [Play Billing](https://developer.android.com/google/play/billing/integrate), [testing tracks](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en).

