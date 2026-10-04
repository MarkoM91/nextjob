# Android release QA

Use a fictional CV and a Play internal-test build. Record device, Android version, browser version, Play version, app version and signing certificate. Passing web tests alone does not validate Android.

| Flow | Expected result |
| --- | --- |
| Fresh install / open | Add CV opens without a NextJOB login, ChatGPT hosting login or address bar. |
| PDF and DOCX selection | Android system picker works; cancelling leaves upload usable. No broad storage permission request. |
| CV processing | Consent required; actual name, dates, roles and skill levels preserved; error offers retry without losing the file. |
| Review / edit | One review screen; edits survive confirmation and navigation. No invented experience. |
| Default Milan search | Candidate city used; Milan, northern Italy, Italy and Europe progression behaves as configured. Foreign remote jobs are not falsely labelled nearby. |
| Country override / no results | Filter applies consistently; empty state offers a clear recovery action. |
| CV design | Selected professional template persists; full multi-page preview remains readable and correctly paginated. |
| Navigation / employer link | Android Back works predictably; external employer navigation and returning do not discard the workspace. |
| Offline / server outage | No endless spinner, white screen or misleading completed action; reconnect and retry preserve saved work. |
| Accessibility / rotation | Keyboard does not hide essential actions; text scaling, portrait/landscape and screen-reader labels remain usable. |
| Guest isolation | A second browser/profile cannot read another user's CV, saved jobs, generated documents or purchase grants. |
| Checkout price | Actual Play product currency/price shown; one-time purchase clearly described. No Stripe steering in the Android flow. |
| Cancel / pending / decline | No download entitlement from cancelled, pending or rejected payments; CV preview remains available. |
| Verified payment | Backend verifies expected app, product and purchase token; one payment unlocks the intended role's formats only. |
| Network loss after charging | Pending grant reconciles safely and grants exactly once when verification returns; no second charge requested. |
| Duplicate / stolen token | Retries are idempotent; cross-user or cross-job replay cannot create extra entitlements. |
| Download | PDF, DOCX and TXT save correctly through the Android browser; formats match the reviewed CV and selected job. |
| Reopen / reinstall / cookies cleared | Recovery works as stated before money is accepted; consumed tokens are not incorrectly assumed to appear in purchase history. |
| Refund / expiry | Access follows the documented purchase/refund policy; unrelated jobs remain protected. |
| Delete workspace | User can request real server-side data deletion; retained purchase records are explained accurately. |
| Store review access | A reviewer other than the owner can use upload, matches, preview and test purchases without special private hosting access. |

Also run Android lint and inspect the merged manifest for unnecessary permissions, target API 36, supported billing version and verified HTTPS app links. Execute the web regression suite after changing the website's payment/privacy routes. Do not upload personal CV data as screenshots, support examples or Play reviewer assets.
