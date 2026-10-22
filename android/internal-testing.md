# NextJOB: Android internal-test handoff

Status checked: **2026-10-22**. NextJOB has not been uploaded or published on Google Play. The app-creation form is prepared; the owner's declarations remain pending.

## Release file and app identity

| Item | Current value |
| --- | --- |
| App name | NextJOB |
| Package | `com.markom91.nextjob` — available in the prepared form; permanent confirmation pending |
| Version | `0.1.0`, version code `1` |
| Signed AAB destination | `C:\Users\marco\OneDrive\Documenti\Role Radar\outputs\android-release\nextjob-0.1.0-upload.aab` |
| Build status | Rebuilt from Android source commit `19247dc9d7942448ea623acfd905923f561de5ba`, signed with the existing upload key and verified on 2026-10-22. |
| Signed bundle SHA-256 | `92aa2ffd8781006182bdf7f22cecb921331a0d20f33804233ded21e781a8a6d8` |
| Website | `https://role-radar.markom91.chatgpt.site` |

Keep the upload key under ignored `android/private/` and arrange a secure backup: its protected password depends on this Windows profile. Never upload these secrets to GitHub or the listing.

## Create the app and save an internal-test draft

1. Keep **NextJOB**, **English (United Kingdom) / en-GB**, **App**, and **Free** in the prepared form. Free means free installation; CV downloads will be separate in-app purchases.
2. The owner reviews the policy and export declarations, accepts only declarations they can truthfully make and selects **Create app**. These declarations remain unchecked.
3. Open the new NextJOB app. Go to **Test and release → Testing → Internal testing**. Open **Testers**, create or select the intended tester list and save it.
4. Under **Releases**, select **Create new release**. Follow the **Play App Signing** setup; the owner handles any agreement. Preserve the existing upload key.
5. Upload the signed `.aab` above. Verify package, version and code against the table. If Google has already accepted that code, increase it and rebuild.
6. Name it `0.1.0 internal test`, add truthful test notes and select **Save as draft**. Resolve validation errors. No upload or draft has been completed yet.
7. After resolving access, signing and applicable blockers below, review the release and select **Start rollout to Internal testing**. Obtain the opt-in link from **Testers**. Internal testing is separate from a public production launch.

## Associate the website with Google Play signing

Google uses two different certificates:

- **Upload certificate:** identifies the local key used to upload an AAB. The local public certificate and signing receipt are under `outputs/android-release/`.
- **App-signing certificate:** signs the app delivered to users by Google Play. This is the certificate the website needs for Digital Asset Links.

After Play App Signing is configured:

1. Open **App integrity → App signing**; use Console's navigation search if needed. Copy **App signing key certificate → SHA-256 certificate fingerprint**, rather than **Upload key certificate**.
2. Add that fingerprint to the `playSigningSha256` array in `android/release-config.json`. Set `applicationIdConfirmed` to `true` after the owner confirms the permanent package. Preserve the app origin and package used in Console.
3. Run `npm run generate --prefix android`, then `npm run check --prefix android`. Generation stages the matching file at `android/web-public/.well-known/assetlinks.json`.
4. Deploy it at `https://role-radar.markom91.chatgpt.site/.well-known/assetlinks.json`, plus the staged manifest and icons, through the Site deployment workflow. The association must be public without redirects and match the package and Play certificate.
5. Install from the Play internal-test link on a physical Android device. Verify no browser address bar appears and complete `android/qa.md`. Sideloaded debug builds use a different certificate.

## Remaining launch blockers

- **Public access:** the recorded Site is owner-private. Testers/reviewers need access without a ChatGPT hosting login. Change the hosting audience separately while preserving private CV storage.
- **Android billing:** Play product, purchase UI and backend verification remain unconfigured; Android blocks paid downloads and the worker disables browser payments. Website Stripe does not complete Play Billing. Creation and preview remain free.
- **Privacy/deletion:** public support contact, accurate processor/retention disclosures and server-side deletion remain incomplete. Complete Data safety from actual behavior.
- **Play setup:** owner declarations, permanent package confirmation and Play App Signing are pending.
- **QA/listing:** test a physical device and finish app-content declarations, listing and screenshots using a fictional CV. The brand feature graphic is prepared at `android/assets/feature-graphic.png`.
- **Production access:** complete the identity, device verification, testing and production-access requirements shown for this account. Internal rollout does not grant production access.

Keep the release in draft until its test scope is accurate and the service is accessible to testers. Production launch requires Google's approval and publication.
