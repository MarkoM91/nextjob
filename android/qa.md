# Android WebView release QA

Use a fictional CV, the rebuilt 0.1.1/code-2 APK for initial checks and then the Play-installed closed-test build. Record device, Android/WebView versions, app version and install source. JVM/source checks do not establish device behavior.

## Owner's phone check — 2026-10-25

The owner reported "everything seems to work" after being asked to check CV
upload, tailored preview and Android Back in the internal release. Supplied
phone screenshots show live Milan job cards and a rendered CV preview. The
jobs image is retained as a store asset; the CV image contains personal data
and is not included in the repository or Play listing. This confirms the
owner's general flow check only. Device model, Android/WebView versions and the
extended scenarios below have not been independently verified.

## Extended checks

| Flow | Expected result |
| --- | --- |
| Fresh install / reopen | NextJOB's native loading state leads to Add CV without a hosting login or address bar. Guest work survives normal app reopen. |
| Local PDF / DOCX | System picker opens, selected file is actually uploaded and processed; name, dates and roles remain correct. No broad storage/camera permission request. |
| Cloud document | Pick a PDF/DOCX from a cloud provider; content URI can be read and full upload finishes. Selection alone is insufficient proof. |
| File cancellation / invalid file | Cancellation leaves upload usable; unsupported extension/type/header or oversized file receives a clear message. |
| Profile / matches | Review edits persist. Candidate city/country preferences affect live jobs; foreign remote jobs are not labelled nearby. |
| PDF.js preview | Multi-page canvas rendering, worker loading, pagination and zoom work without a native PDF plug-in. Check a longer CV for memory issues. |
| Deep link / Back | Own-origin path, encoded query and fragment survive app links; Android marker persists. Back follows history, then exits. |
| Employer / unsafe links | External employer URL opens in the default browser; returning preserves the app workspace. No file/content/javascript/intent URL is navigated or exposed to a native bridge. |
| Social login | Clear unavailable message; users can continue as guests. No assumption that external-browser OAuth signs the WebView in. |
| Offline / HTTP error / TLS error | Native retry state covers main-page failure; no blank view, certificate bypass or endless spinner. Successful retry restores the page. |
| Rotation / keyboard / process recreation | Insets and keyboard keep actions visible; history restores. A pending picker/save may need retry without corrupting saved server data. |
| Guest isolation | A fresh app/browser profile cannot fetch another owner's CV, documents or purchased versions. Chrome/TWA cookies do not silently migrate. |
| Android payment selection | Website recognizes NextJOBAndroid UA even after query removal. Paid export stays disabled; no Stripe fallback or false successful payment. |
| Authorized export fixture | With a test entitlement, PDF/DOCX/TXT is fetched with the same guest cookie and saved to the chosen location. Verify resulting file opens and matches the preview. No real charge. |
| Export access failures | Missing entitlement, wrong owner, HTML/login response, unexpected MIME, external/HTTP redirect and oversized/empty body fail without saving an error page as a CV. |
| Save cancellation / failure | Cancelling releases pending bytes; writable-folder failure is reported and downloading can be retried without another charge for an active purchase. |
| Privacy / store access | Accurate public disclosures and working server-side deletion exist; an external tester/reviewer can use the stated free flows. |

The file chooser keeps WebView content/file navigation disabled: Chromium's user-selected file permission path is separate. Verify it on actual Android devices with local Documents and a cloud provider. No generic JavaScript-to-native interface is exposed.

Run `testDebugUnitTest`, lint and both package builds before uploading. Testers Community's own wrapper restriction is not proof that Google bans TWA or automatically approves WebView. Only start its paid test once the closed track and accessible app are ready.

