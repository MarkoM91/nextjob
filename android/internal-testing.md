# NextJOB: Android internal-test handoff

Status checked: **2026-10-22**. NextJOB is created in Google Play Console. The signed AAB was accepted and release **0.1.0 internal test** is saved as a draft. It has not been rolled out or published. The remaining Console release warning is that no testers are configured.

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

## Continue from the saved internal-test draft

The app uses **English (United Kingdom) / en-GB**, **App**, and **Free** installation. Paid CV downloads will be separate in-app purchases when implemented.

1. Open NextJOB in Console and go to **Test and release → Testing → Internal testing**.
2. Open **Testers**, create/select a tester list and add the intended testers' Google-account emails. Save it. The user must supply the tester emails; no list is configured yet.
3. Under **Releases**, open **0.1.0 internal test**. The accepted bundle is version code **1**, version **0.1.0**, target **API 36**. Do not re-upload another binary under this accepted code; use a higher code for future builds.
4. Once access, signing and applicable test blockers below are resolved, review the release and select **Start rollout to Internal testing**. Obtain the opt-in link from **Testers**. This action has not been performed.
5. Install through that Play link on a physical Android device and complete `android/qa.md`. Internal testing is separate from the required closed test and public production launch.

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
- **Privacy/deletion:** public support contact, accurate processor/retention disclosures and server-side deletion remain incomplete. Complete Data safety from actual behavior.
- **Testers:** supply the intended Google-account emails and configure the internal tester list before rollout.
- **QA/listing:** test a physical device and finish app-content declarations, listing and screenshots using a fictional CV. The brand feature graphic is prepared at `android/assets/feature-graphic.png`.
- **Production access:** this Console account explicitly requires at least **12 opted-in closed-test testers for 14 continuous days**, followed by an application for production access. Internal testing does not fulfill that closed-test requirement.

Keep the release in draft until its test scope is accurate and the service is accessible to testers. Production launch requires Google's approval and publication.
