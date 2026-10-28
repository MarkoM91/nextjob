# NextJOB closed-test preparation

## Current status — verified 2026-10-27

This section supersedes the October 25 preparation record below.

**October 28 payment update:** the owner reports completing payout-method setup and account-group/service-fee enrollment. Candidate 0.1.2/code 3 now includes native Play Billing and server verification, with sales disabled until configuration and controlled purchase QA. The existing closed test remains separate; see `play-billing.md`.

- Google approved and published **0.1.1 WebView closed test**, version code **2**, on October 25. The Alpha track is active and available to selected testers.
- Google's production-access checklist confirms **Publish a closed testing release** and **Have at least 12 testers opted-in**. The 14-day continuous testing requirement is incomplete; **Apply for production** is disabled.
- Testers Community shows **15 of 15 testers**, **In Progress / Active**, and **0 of 2 reports**. Overview shows zero completed days; Progress shows **day 1 of 16**, with 15 days remaining. This service timeline is separate from Google's eligibility decision.
- The service submission was made on **October 26**, using the existing Starter credit. That credit is spent; do not buy another credit for this submission.
- Closed-test invitation: https://play.google.com/apps/testing/com.markom91.nextjob
- Service submission: https://www.testerscommunity.com/app-details/aIM4ecqP0v6pOLsY1bWb
- All 178 countries/regions and `testers-community@googlegroups.com` are enabled for the track.
- Production access has not been granted and no public production release is available.

Tester instructions cover fictional/anonymised CV upload, profile confirmation, city/preferences, local jobs and country filters, tailored preview/designs, saved jobs, Applications, Android Back, reopening and connection recovery. Paid exports and email delivery remain disabled. No purchases or real applications are required. Use the sample CV linked below; never publish the owner's private CV or CV-preview screenshot.

### Remaining launch work

1. Continue testing and review reports as they become available. Keep at least 12 testers continuously opted in for 14 days; do not promise a production date based on the provider's counter.
2. Complete the extended device checks in `qa.md`. Existing phone QA is owner-reported rather than independent execution of the full matrix.
3. The [Google Payments merchant profile](https://play.google.com/console/u/0/developers/6141994627423060663/paymentssettings) is created and the owner reports completing the remaining account steps. The one-time products page last required an uploaded build with the BILLING permission. Upload the new candidate to internal testing, then configure the product and backend API access.
4. Finish controlled Play Billing purchase/recovery QA before enabling the €1.50 Android download. Backend mock/integration tests do not establish actual Google purchase behavior. Web Stripe also remains unconfigured.
5. Apply for production access once available, answer Google's testing questions accurately, and submit a production release after access is granted. Recheck privacy and Play declarations when enabling new features.

Domain purchase and Resend activation are explicitly postponed. They do not block the current closed test. The in-app job-alert checker ran successfully on October 27 with zero errors and zero opted-in workspaces; this does not verify actual notification delivery or scheduled hourly execution.

## Historical preparation record — 2026-10-25

Checked **2026-10-25**. The internal release remains available. The closed
release and listing have been submitted: Publishing overview shows **Changes
in review**, with automated quick checks still running before review proceeds.
The closed test has not started. Internal testing does not count toward
Google's required closed-test period.

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
Submitted release: **0.1.1 WebView closed test**, using accepted bundle code **2**
(`0.1.1`, target API 36). Release notes describe free CV creation and preview
and explain that paid exports are disabled for this test. Release validation
reported **Ready to release** before confirmation.

All **178 countries/regions** and the service's Google Group have been saved
for this closed track, with the approved public support email as feedback
contact. These changes are included in the review submission. The Console shows the
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
Two actual Android jobs screenshots are included in the submitted listing:
`store-screenshots/01-job-matches.jpg` and `02-job-search.jpg`, both unaltered
720 × 1600 JPEGs supplied by the owner. The supplied CV-preview screenshot
contains the owner's real contact and career details and has not been uploaded
to Play or copied into the repository. The store listing passed its required
asset checks. Submission is not Google approval or a live closed-test rollout.

The final quick checks found a missing advertising ID declaration. Source
inspection confirmed the wrapper has only INTERNET permission and no runtime
SDK dependencies. **Does not use advertising ID** was saved, clearing that
blocking issue. The submission contains 15 changes covering the Alpha release,
countries, testers, listing and required app-content declarations. Managed
publishing remains off, so approved changes are set to publish automatically.

Wait for Google review and verify the closed opt-in URL actually works before
submitting NextJOB to Testers Community or spending the existing Starter credit.
No tester service submission has been made and no 14-day period has begun.

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
