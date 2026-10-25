# Google Play Data safety — Android 0.1.1

Saved in Play Console on **2026-10-25**, ready to send for review. This is a
record of the current declaration, not Google approval. Recheck it when app
behavior, hosting, processors, accounts or billing change.

## Current release

- Guest workspace; sign-in, sign-up and password-reset pages redirect to upload.
  The app does not offer account creation or login with outside accounts.
- User data is collected and transferred over HTTPS.
- No display advertising, analytics SDK, crash-reporting SDK or Android GPS
  permission is included in the wrapper.
- Paid Android exports are disabled. Purchase history and payment details are
  not declared for this test release; revisit this before enabling billing.
- Users can request deletion manually through the public privacy page:
  <https://role-radar.markom91.chatgpt.site/privacy>.
  There is no claim of automatic deletion within 90 days or self-service deletion.

## Collected data

All selected data is declared as **not processed ephemerally**, because the
category includes stored profiles, documents, preferences or activity. Network
city alone may be transient, but CV location is also stored in the profile.

| Data type | Collection | Purpose |
| --- | --- | --- |
| Approximate location | Required | App functionality; personalisation |
| Name | Required | App functionality |
| Email address | Optional | App functionality |
| User IDs | Required | App functionality; fraud prevention, security and compliance |
| Address | Optional | App functionality; personalisation |
| Phone number | Optional | App functionality |
| Other personal info | Required | App functionality; personalisation |
| Files and docs | Required | App functionality; personalisation |
| App interactions | Optional | App functionality |
| In-app search history | Required | App functionality; personalisation |
| Other user-generated content | Optional | App functionality; personalisation |
| Other actions | Optional | App functionality |
| Device or other IDs | Required | App functionality; fraud prevention, security and compliance |

The required categories support the main CV and matching flow. Contact email,
phone and street address can be omitted from a CV; additional notes, imported
content and application-tracking actions are user choices. The signed workspace
identifier links private data to its owner and the app/browser instance; request
identifiers also support rate limiting. No advertising identifier is used.

Approximate location includes city inferred from Cloudflare request metadata
in `/api/whereami`, not a device GPS fix. Other personal information includes
professional history, education, skills and languages. Files include the
original upload and generated application documents.

## Third-party processing

The form declares **no sharing** under Google's Data safety definition, using
the service-provider and user-initiated transfer exceptions. This does not mean
that no external processor receives information: Cloudflare hosts private data,
OpenAI processes CV content on the app's instructions, and Reactive Resume is an
optional resume-processing integration. Job services receive search parameters;
employer links open externally when requested. These flows are disclosed in the
privacy page and upload consent.

Reference: [Google Play Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

Before enabling accounts or Android purchases, update this declaration, app
access instructions, privacy information and the content-rating purchase answer.
