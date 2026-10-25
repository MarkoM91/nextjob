# NextJOB closed-test preparation

Checked **2026-10-25**. The internal release remains available; the closed test
has not started. Internal testing does not count toward Google's required
closed-test period.

**Service blocker:** Testers Community's authenticated technology check rejects
Bubblewrap/Trusted Web Activity (TWA) submissions on every plan. NextJOB's
original 0.1.0 Android wrapper was a TWA. The form was answered accurately; no app was
submitted and the Starter credit remains unused. The service offers conversion
to a WebView build or a refund through support. Do not answer “not a TWA” to
bypass this restriction. This is the provider's restriction, not a verified
Google policy that TWA testing is invalid.

The owner chose **WebView conversion, then use the existing credit**. Version
**0.1.1 / code 2** now uses WebView, passed CI, was signed with the existing
upload key and is available in the existing internal test. The owner reports
that the phone flow works and supplied actual Android jobs/CV-preview
screenshots. This is owner-reported QA, not execution of the full device matrix.
No refund message has been sent.

## Testers Community

The authenticated dashboard shows **one Starter credit available**. The Italian
catalogue shows **€14 per app** and advertises 15 testers for 14 days. Do not buy
another credit for this app. No payment was made by the assistant.

The authenticated submission guide specifies the Google Group
`testers-community@googlegroups.com`, to be added under the closed track's
**Testers → Google Groups**. It asks for all countries to be selected so its
distributed testers can participate. Use the group shown in the authenticated
submission guide if it changes.

Prepared submission: NextJOB, Starter plan, `android/assets/icon-512.png`, and
instructions covering sample-CV upload, profile review, local job matches and
tailored preview. Use a fictional or anonymised CV. No purchases or automatic
job submissions are required. The submission requires the actual public
**closed-test** join URL; do not substitute the internal-test URL.

Do not spend the Starter credit or start the testing period until the release
is available and the hosted app is accessible to the testers.

## Play Console

Closed track: **Alpha**, track ID `4700163200994773394`.
Saved release draft: **0.1.1 WebView closed test**, using accepted bundle code **2**
(`0.1.1`, target API 36). Release notes describe free CV creation and preview
and explain that paid exports are disabled for this test.

All **178 countries/regions** and the service's Google Group have been saved
for this closed track, with the approved public support email as feedback
contact. These changes have not been sent for review. The Console shows the
future web opt-in URL as
`https://play.google.com/apps/testing/com.markom91.nextjob`, but its copy button
is disabled until publication; it is not a usable test invitation yet.

The full store description, icon and feature graphic are saved as a draft.
Privacy policy, guest app access, no display ads, government, financial and
health declarations, Business category, content rating, target audience and
Data safety are saved for review. The owner explicitly accepted the IARC
terms and confirmed the intended audience as **18 and over** on 2026-10-25.
The questionnaire produced PEGI 3 / ESRB Everyone: content ratings and the
intended audience are separate settings. The optional store restriction for
minors was not enabled. See `data-safety.md` for the saved privacy answers.
One actual Android jobs screenshot is uploaded and saved in the listing draft
(`store-screenshots/01-job-matches.jpg`, unaltered 720 × 1600 JPEG). Play Console
still requires a second screenshot. The supplied CV-preview screenshot contains
the owner's real contact and career details and has not been uploaded to Play
or copied into the repository. Request another non-personal app screen or a
fictional CV preview. Saving these settings is not a rollout or Google approval.

The owner approved public access on **2026-10-25** and the hosting audience is
now public. Anonymous upload/privacy pages and Digital Asset Links return 200;
the anonymous profile endpoint returns `profile: null`, `source: "missing"`
with private/no-store caching. CVs and applications remain scoped to their
signed guest/account owner. The public privacy URL and guest app-access
declaration have been saved in Play Console.

The owner confirmed that everything seems to work after being asked to verify
CV upload, preview and Android Back. Actual screenshots show live Milan jobs
and a rendered two-page CV preview. Extended QA remains documented in `qa.md`;
do not present it as independently completed. A fictional test CV is available at
[NextJOB sample CV](https://raw.githubusercontent.com/MarkoM91/nextjob/codex/android-release-setup/android/test-assets/NextJOB-Sample-CV.pdf).

Google requires at least 12 opted-in closed testers for 14 continuous days for
this account, followed by an application for production access. The service's
refund/approval marketing is not a guarantee of Google's decision.

## Useful pages

- [Testers Community dashboard](https://www.testerscommunity.com/dashboard)
- [Submit the app](https://www.testerscommunity.com/submit-app)
- [Google Play closed track](https://play.google.com/console/u/0/developers/6141994627423060663/app/4975382845407304876/tracks/4700163200994773394)
- [Google testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Service refund conditions](https://www.testerscommunity.com/refund-policy)
- [Provider's TWA restriction and conversion guide](https://www.testerscommunity.com/guides/twa-app-rejected-switch-to-webview)
