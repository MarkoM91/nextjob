# NextJOB: Android internal-test handoff

Status checked: **2026-10-22**. Release **0.1.0 internal test** is active and available to internal testers in Google Play Console. One owner-authorized Google account is configured in the selected **NextJOB internal testers** list. This is an unreviewed internal release, not a public production launch.

Test opt-in link: **https://play.google.com/apps/internaltest/4701700359655582351**. Open it on an Android device using the Google account authorized in Console, join the test and follow the Play installation link. Until the listing is reviewed, Google displays the temporary name `com.markom91.nextjob (unreviewed)`.

The public support/privacy contact is **markoaffari@gmail.com**, saved in Play Console's Store Listing contact details and included in the app's Help and Privacy screens. Tester account addresses are kept in Console rather than this public repository.

## Release file and app identity

| Item | Current value |
| --- | --- |
| App name | NextJOB |
| Console app ID | `4975382845407304876` |
| Package | `com.markom91.nextjob` — confirmed by Console under Protected with Play |
| Version | `0.1.0`, version code `1` |
| Signed AAB destination | `C:\Users\marco\OneDrive\Documenti\Role Radar\outputs\android-release\nextjob-0.1.0-upload.aab` |
| Build status | Rebuilt from Android source commit `19247dc9d7942448ea623acfd905923f561de5ba`, signed, verified and accepted by Console; target API 36. |
| Signed bundle SHA-256 | `92aa2ffd8781006182bdf7f22cecb921331a0d20f33804233ded21e781a8a6d8` |
| Website | `https://role-radar.markom91.chatgpt.site` |

Keep the upload key under ignored `android/private/` and arrange a secure backup: its protected password depends on this Windows profile. Never upload these secrets to GitHub or the listing.

## Continue the internal test

The app uses **English (United Kingdom) / en-GB**, **App**, and **Free** installation. Paid CV downloads will be separate in-app purchases when implemented.

1. Open NextJOB in Console and go to **Test and release → Testing → Internal testing**.
2. The **Testers** tab has the selected **NextJOB internal testers** list with one authorized account. Add other accounts only with the owner's authorization.
3. Under **Releases**, open **0.1.0 internal test**. Console confirms **Available to internal testers**. The accepted bundle is version code **1**, version **0.1.0**, target **API 36**. Do not re-upload another binary under this accepted code; use a higher code for future builds.
4. Use the opt-in link above on a physical Android device and complete `android/qa.md`. Internal testing is separate from the required closed test and public production launch.

## Associate the website with Google Play signing

Google uses two different certificates:

- **Upload certificate:** identifies the local key used to upload an AAB. The local public certificate and signing receipt are under `outputs/android-release/`.
- **App-signing certificate:** signs the app delivered to users by Google Play. This is the certificate the website needs for Digital Asset Links.

Play App Signing is configured. Its SHA-256 fingerprint is:

```text
AB:2E:BF:5C:35:2E:B5:42:E3:DA:6A:49:52:86:60:A0:1D:EC:7D:72:92:03:22:6E:1E:17:7C:7C:90:55:51:20
```

1. To find it again, open **Protected with Play → Play Store protection → Show details → Manage Play app signing**. Use the **App signing key certificate** fingerprint rather than the **Upload key certificate**.
2. `android/release-config.json` now contains that fingerprint and `applicationIdConfirmed: true`; `project/twa-manifest.json` mirrors it. Digital Asset Links are prepared in both `android/web-public/.well-known/assetlinks.json` and `public/.well-known/assetlinks.json`.
3. Deploy the public association, manifest and icons through the Site workflow, then verify `https://role-radar.markom91.chatgpt.site/.well-known/assetlinks.json` is reachable without authentication or redirects. Prepared source files do not establish public reachability by themselves.
4. On the Play-installed build, verify no browser address bar appears. Sideloaded debug builds use a different certificate.

## Remaining launch blockers

- **Public access:** the recorded Site is owner-private. Testers/reviewers need access without a ChatGPT hosting login. Change the hosting audience separately while preserving private CV storage.
- **Android billing:** Play product, purchase UI and backend verification remain unconfigured; Android blocks paid downloads and the worker disables browser payments. Website Stripe does not complete Play Billing. Creation and preview remain free.
- **Privacy/deletion:** the public contact is configured; accurate processor/retention disclosures and server-side deletion remain incomplete. Complete Data safety from actual behavior.
- **Testers:** internal access is configured for one account; device installation and hands-on QA remain pending.
- **QA/listing:** test a physical device and finish app-content declarations, listing and screenshots using a fictional CV. The brand feature graphic is prepared at `android/assets/feature-graphic.png`.
- **Production access:** this Console account explicitly requires at least **12 opted-in closed-test testers for 14 continuous days**, followed by an application for production access. Internal testing does not fulfill that closed-test requirement.

Keep the test limited to the configured audience until the service is accessible and the remaining launch requirements are resolved. Production launch requires Google's approval and publication.
