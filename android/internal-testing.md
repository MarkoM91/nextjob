# Android build and test handoff

NextJOB already exists in Google Play Console: app ID `4975382845407304876`, package `com.markom91.nextjob`. The previously accepted 0.1.0/code-1 AAB uses TWA. The current source replaces it with a native WebView under the same app identity and existing upload key.

| Candidate | Status |
| --- | --- |
| Version | 0.1.1 / code 2 |
| Target | API 36; Android 9/API 28 minimum |
| Expected signed AAB | `C:\Users\marco\OneDrive\Documenti\Role Radar\outputs\android-release\nextjob-0.1.1-upload.aab` |
| Build/sign/upload | Pending for this source; do not use the older code-1 file |
| Runtime | Native WebView, no TWA dependency or billing bridge |

## Continue in Console

1. Wait for CI's policy tests, lint, debug APK and unsigned AAB to pass. Sign and validate the new AAB using the existing upload key.
2. Open NextJOB → **Test and release → Testing → Closed testing → Manage track**. Replace the saved code-1 draft artifact with the new code-2 artifact. Do not create another app.
3. Confirm Console reports 0.1.1/code 2/API 36 and that the app's listing/content declarations meet its review requirements.
4. Fix the owner-private hosting gate and complete physical-device upload, preview, download, navigation and offline QA before starting paid external testing.
5. Use the managed testing provider's exact authenticated-dashboard Google Group on the closed track's **Testers** tab, plus an actual feedback URL/email. Save the release and submit for review/rollout when ready.
6. Once the closed release and opt-in link work for an eligible tester, submit that link to the testing provider and use the existing credit. Internal opt-ins do not count; testers must leave internal testing before joining closed testing.

See `closed-testing.md` for the current provider and service setup. No new code-2 upload or service activation is claimed by this document.

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

