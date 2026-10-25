# Android build and test handoff

NextJOB already exists in Google Play Console: app ID `4975382845407304876`, package `com.markom91.nextjob`. The previously accepted 0.1.0/code-1 AAB uses TWA. The current source replaces it with a native WebView under the same app identity and existing upload key.

| Candidate | Status |
| --- | --- |
| Version | 0.1.1 / code 2 |
| Target | API 36; Android 9/API 28 minimum |
| Expected signed AAB | `C:\Users\marco\OneDrive\Documenti\Role Radar\outputs\android-release\nextjob-0.1.1-upload.aab` |
| Build/sign/upload | CI passed; signed/validated bundle accepted by Play and available to internal testers on 2026-10-25. |
| Runtime | Native WebView, no TWA dependency or billing bridge |

The WebView binary was built from commit `f9b194361c25b17edf2b2ae72c547df82b248f7e`.
[CI run 40213861731](https://github.com/MarkoM91/nextjob/actions/runs/40213861731)
passed compilation, JVM policy tests and both lint variants. Its downloaded
artifact matches SHA-256
`9cc627fc6c661c8e87130194c08e714e94c563d1568a65fd0930816988e3d7b6`.
The signed AAB SHA-256 is
`8a92ea9847e60885358fe7d9f4bc3c9d8b3863f709d017231cf00858a190353a`.
Its upload certificate matches the existing key. Internal release
**0.1.1 WebView internal test** is active and Console confirms **Available to
internal testers**. This does not establish physical-device QA, a closed-test
rollout or production access.

Internal opt-in: https://play.google.com/apps/internaltest/4701700359655582351
Use the existing owner-authorized Google account; private tester addresses are
kept in Console. Google says updates usually appear within an hour, sometimes
longer. The website remains owner-private pending audience approval, so app
access is a separate prerequisite for device QA.

## Continue in Console

1. The code-2 CI build, signing, validation and internal rollout are complete. Do not upload a different binary under the same accepted version code.
2. NextJOB → **Test and release → Testing → Closed testing → Manage track** has the saved **0.1.1 WebView closed test** draft using code 2. Do not create another app.
3. Confirm Console reports 0.1.1/code 2/API 36 and that the app's listing/content declarations meet its review requirements.
4. Fix the owner-private hosting gate and complete physical-device upload, preview, download, navigation and offline QA before starting paid external testing.
5. Use the managed testing provider's exact authenticated-dashboard Google Group on the closed track's **Testers** tab, plus an actual feedback URL/email. Save the release and submit for review/rollout when ready.
6. Once the closed release and opt-in link work for an eligible tester, submit that link to the testing provider and use the existing credit. Internal opt-ins do not count; testers must leave internal testing before joining closed testing.

See `closed-testing.md` for the current provider and service setup. Service activation is still pending.

## Signing and Android links

The upload key remains under ignored `android/private/`; its password is protected with Windows DPAPI. Arrange an independent secure backup. Never change the package/key when replacing the Android wrapper.

Google's Play app-signing SHA-256, recorded in `release-config.json`, is:

```text
AB:2E:BF:5C:35:2E:B5:42:E3:DA:6A:49:52:86:60:A0:1D:EC:7D:72:92:03:22:6E:1E:17:7C:7C:90:55:51:20
```

It is different from the local upload certificate. Console navigation: **Protected with Play → Play Store protection → Show details → Manage Play app signing**. Matching public Digital Asset Links support Android deep links; WebView rendering no longer depends on TWA domain verification.

## Current limits

- Social OAuth is unavailable inside this shell; guest creation/preview remains available. Browser/TWA guest cookies are separate from the new app workspace.
- Android payments stay disabled. Existing entitlements are still checked by the backend before any native download.
- Physical-device tests are still required. Confirm upload reaches the backend from both local and cloud document providers, rather than merely checking file selection.
- Public access, privacy/deletion, support contact, store review and tester setup remain separate work.
- Production access requires at least 12 closed testers opted in continuously for 14 days, followed by Google's approval. Changing wrappers does not itself grant access.

