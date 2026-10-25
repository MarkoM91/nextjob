# NextJOB

## Guest checkout and CV downloads

Visitors upload and review a CV without creating an account. `AUTH_SECRET`
signs a random, private guest workspace cookie lasting 30 days. Legacy sign-in
pages redirect to upload; existing authentication APIs remain available.

Creating and previewing a CV is free. A one-time download defaults to €1.50 EUR,
including PDF, DOCX and TXT plus seven days of repeat downloads of the same saved
CV. Pricing, product IDs and the repeat-download period are configurable. A
purchase is tied to an immutable CV version, so later edits do not change it.
The optional private recovery link restores that purchased CV after cookie loss;
it does not restore the full guest workspace. Keep the link private.

D1 stores orders, CV versions, entitlements, provider customers, subscriptions
and processed events. `monthly_subscription` is supported but sales are disabled
by default; the one-time purchase remains the primary option. Active, cancelled
and expired subscription states use the same server-side access checks.

Configure Stripe keys and a reachable webhook, complete test-mode QA, then
explicitly set `PAYMENTS_ENABLED=true`. Checkout validates server-owned pricing
and fulfills through both a server-verified return route and signed webhooks.
Refunds and new disputes revoke per-CV access. Android checkout fails closed
until its Google Play payment adapter is configured; it does not use Stripe as
a fallback. See [billing configuration and architecture](docs/billing.md).

The integration suite executes real SQLite migrations with mocked Stripe,
covering duplicate attempts, expiry, refunds, recovery, ownership, CV edits,
subscription lifecycle and invalid payments. No real charge is made by tests.

NextJOB is a production-oriented MVP for global job discovery and truthful,
job-specific application preparation.

Its promise is simple:

> Upload your CV once. Discover relevant jobs worldwide and create an ATS-ready
> application in minutes.

The current product uses an honest hybrid application flow. It submits inside
NextJOB only when an employer-authorized connector is present; otherwise it
opens the official employer form and records a user-reported status separately
from an employer-verified receipt.

## What is implemented

- Public landing page with a focused CV → matches → application journey.
- Real sign-in: social accounts (Google, LinkedIn, GitHub, Microsoft, Facebook)
  over OAuth 2.0 with PKCE where the provider supports it, email/password accounts
  hashed with PBKDF2-SHA256, and hosted Sign in with ChatGPT. Sessions are signed
  HttpOnly cookies; a provider is offered only when its credentials are present.
- PDF and DOCX CV upload validation with a 10 MB limit, explicit AI-processing
  consent, file-signature checks, and private R2 object keys.
- Reactive Resume + AI integration for structured CV parsing, private resume
  import, job-specific tailoring, and authenticated PDF export.
- Structured factual profile review. Extracted fields keep source text,
  confidence, and verification status.
- Live employer listings with country detection, source health, partial-failure
  handling, and no invented feed fallback. Sources: Greenhouse, Lever, Ashby,
  Workable, Recruitee, SmartRecruiters (`SMARTRECRUITERS_COMPANIES`, read per
  `SMARTRECRUITERS_MARKETS`) and Personio (`PERSONIO_COMPANIES`, the public
  `{company}.jobs.personio.de/xml` feed) employer boards, seeded with Italian
  employers whose feeds were verified live; the Arbeitnow open European feed (no
  key required); and three licensed aggregators — Adzuna (`ADZUNA_APP_ID` /
  `ADZUNA_APP_KEY`, `ADZUNA_MARKETS` defaults to `it`), Jooble
  (`JOOBLE_API_KEY`, `JOOBLE_MARKETS`) and Careerjet
  (`CAREERJET_AFFILIATE_ID`, `CAREERJET_MARKETS`). Aggregator location filters
  are loose, so every posting is re-checked and one that resolves to a different
  country is dropped rather than mislabeled. Careerjet's public API is plain
  HTTP, requires a declared `Referer`, and ANDs its keyword string, so a single
  role term is sent and NextJOB filters relevance itself.
  No source is blocked by domain; each site's published robots.txt is enforced
  per URL before a page is read. Indeed and LinkedIn currently disallow generic
  crawlers there (`Disallow: /viewjob?` and `Disallow: /`), so reaching their
  listings requires their partner APIs rather than the crawler.
- Replaceable job-provider registry with health checks, partial-failure handling,
  permitted-source boundaries, and provider-specific configuration.
- Deterministic job normalization, salary conversion, duplicate grouping, hard
  eligibility checks, weighted matching, visible gaps, and match explanations.
- Curated matches, saved-jobs view, job detail, and original-source handoff.
- Indeed-style job feed filters: what/where search, date posted, work style,
  job type, experience level, pay floor, stated-pay-only, country, and sort,
  with per-chip counts; the same rules run on the server and in the browser.
- Focused application studio that shows the job-tailored CV Reactive Resume
  produced, with tone-based regeneration of the written documents, an inline
  PDF preview, and a CV design picker (`POST /api/applications/template`)
  that switches the Reactive Resume template, re-exports the PDF, and keeps
  the choice for every later application.
- Grounded CV, cover-letter, email, and interview-preparation generation written
  from the actual job posting by the configured AI provider, with a
  deterministic, occupation-neutral template as the fallback.
- Claim-source links and factual validation for every generated CV bullet.
- “NextJOB ATS readiness estimate” with keyword, formatting, and factual
  integrity factors plus an explicit vendor-score disclaimer.
- Server-side selectable PDF, editable DOCX, and plain-text generation without
  rendering documents as images.
- Application package review and an owner-scoped tracker that distinguishes an
  opened employer form, a user-reported application, and employer verification.
- Consent-first email/WhatsApp preferences, quiet hours, match thresholds, and
  notification caps.
- Protected administration surface for provider, delivery, queue, duplicate,
  and validation health. Private user documents are not shown.
- Privacy, terms, billing placeholder, profile, settings, and help surfaces.
- Responsive mobile journey, large touch targets, sticky actions, and bottom
  navigation.

## Architecture

```text
Browser / mobile UI
        │
        ▼
Next.js App Router on vinext
  ├─ public landing and identity entry
  ├─ onboarding and factual profile review
  ├─ matches, job detail, application studio, tracker
  └─ validated route handlers
        │
        ├─ deterministic matching + ATS engines
        ├─ replaceable AI / job / email / WhatsApp / queue interfaces
        ├─ D1 relational state (39-table Drizzle schema)
        └─ R2 private CV and generated-document objects
```

Domain logic is kept outside UI components:

- `lib/domain.ts` — canonical types and service contracts.
- `lib/engine.ts` — normalization, deduplication, matching, ATS analysis, and
  grounded generation.
- `lib/providers.ts` — provider registry and replaceable adapters.
- `lib/job-store.ts` — durable live-job resolution and normalized D1 writes.
- `lib/documents.ts` — dependency-free PDF, DOCX, and TXT generation.
- `lib/security.ts` — same-origin enforcement, rate limits, text hygiene, and
  webhook verification.
- `lib/i18n.ts` — translation dictionary boundary (English is implemented).
- `db/schema.ts` — D1/SQLite relational schema.

The code deliberately does not assume that any one job provider offers global
coverage. Each provider declares supported countries and languages, can be
enabled separately, and may fail without taking down the remaining feed.

## Local setup

Requirements:

- Node.js `>=22.13.0`
- npm

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open the local URL printed by the development server. External keys are not
required: NextJOB automatically uses deterministic demo services when
production credentials are absent.

### Useful scripts

```bash
npm run dev              # local development
npm run build            # Cloudflare Worker-compatible production build
npm run lint             # ESLint
npm run typecheck        # TypeScript
npm run test:unit        # scoring, normalization, dedupe, claims, documents
npm run test:integration # rendered journeys, APIs, auth boundary, downloads
npm test                 # build plus all tests
npm run db:generate      # generate a Drizzle migration
npm run db:local         # apply migrations to the local Miniflare D1 database
```

`db:generate` preloads a tiny Windows sandbox workaround because some managed
Windows environments incorrectly report `ENOMEM` from `os.userInfo()`. It does
not change database behavior.

## Database and storage

`.openai/hosting.json` declares:

- D1 binding `DB` for structured, durable product data.
- R2 binding `DOCUMENTS` for private CV and generated-document bytes.

Migrations live in `drizzle/`. `0000_real_stature.sql` creates 39
tables covering users, verified candidate facts, providers and ingestion,
normalized jobs, matches, saved/rejected roles, application history, document
versions and claim sources, notifications, subscriptions, audit logs, and
deletion requests. `0001_great_expediter.sql` adds `user_identities` (one row per
linked social account) and `user_credentials` (PBKDF2 password hashes).

Run `npm run db:local` once so the local dev database has these tables; without
them, email/password sign-up reports that the account database is unavailable
rather than pretending to create an account.

```bash
npm run db:generate
```

The migration contains foreign keys, ownership indexes, unique constraints,
timestamps, soft-deletion fields, and `PRAGMA optimize`. Every user-owned query
must include the authenticated `user_id`; client-provided owner identifiers are
never trusted.

For a PostgreSQL/Supabase deployment, `db/supabase-rls.sql` provides the initial
row-level-security policy set. D1 does not implement PostgreSQL RLS, so the
active Sites adapter enforces the same ownership rule in server-side prepared
queries.

## Development fallback

The repository retains deterministic sample fixtures for unit tests and
isolated UI development. They are not inserted into the live Jobs feed. If all
configured job providers are unavailable, the product shows that state instead
of replacing real vacancies with fictional ones. Demo mode is enabled only by
the explicit `FEATURE_DEMO_MODE=true` flag.

## Sign-in

Three identity sources coexist behind one reader, `app/auth.ts`. Every route
asks it who the caller is, so private document keys and owner-scoped queries
behave the same whichever sign-in the person used.

1. **Social accounts.** OAuth 2.0 authorization-code, with PKCE on the providers
   that accept it (Google, Microsoft). NextJOB mints a random `state` and stores
   it in a short-lived signed cookie; a callback whose state does not match is
   refused before any token exchange. The access token is used once, server-side,
   to read the profile and is then discarded. Only name, email address, and
   picture are kept.
2. **Email and password.** PBKDF2-SHA256, 210,000 iterations, per-account salt.
   Sign-in hashes even when no account exists, so response timing does not reveal
   which addresses are registered.
3. **Hosted Sign in with ChatGPT**, unchanged, for dispatch deployments.

Sessions are HMAC-SHA256-signed JSON in an HttpOnly, SameSite=Lax cookie, marked
Secure over HTTPS, valid for 30 days. There is no session table: the signature is
the proof, and expiry is checked on every read. Without `AUTH_SECRET` no session
can be issued or read, and each sign-in surface says so rather than appearing to
work.

An identity is matched first by provider subject, then by verified email address,
so signing in with Google today and LinkedIn tomorrow reaches the same workspace.
An unverified provider email never attaches to an existing account.

### Where the account is asked for

The CV comes first. `/upload` is open to anyone: a visitor picks a file and gives
AI-processing consent without an account. The sign-in step appears when they press
Analyze CV and continue, because that is the moment the file would be stored, and
the chosen file stays selected through it. Creating the account is the default
action there; signing in is one click away.

`POST /api/cv/upload` enforces this rather than trusting the screen. Without a
session it answers 401 `SIGN_IN_REQUIRED` before reading the body, so a CV can
never land in a shared owner bucket, and the browser reopens the sign-in step if a
session expires mid-visit.

The hosted ChatGPT button is hidden unless `AUTH_CHATGPT_ENABLED=true`, because
`/signin-with-chatgpt` is served by the hosting dispatch and not by this app.
Advertising it elsewhere sends people to a page that does not exist.

### Enabling a provider

Set both variables and register
`<AUTH_PUBLIC_URL>/api/auth/<provider>/callback` as the redirect URI with the
provider. A provider with only one of the two is treated as absent.

| Provider | Variables | Console |
| --- | --- | --- |
| Google | `AUTH_GOOGLE_CLIENT_ID` / `_SECRET` | console.cloud.google.com/apis/credentials |
| LinkedIn | `AUTH_LINKEDIN_CLIENT_ID` / `_SECRET` | linkedin.com/developers/apps |
| GitHub | `AUTH_GITHUB_CLIENT_ID` / `_SECRET` | github.com/settings/developers |
| Microsoft | `AUTH_MICROSOFT_CLIENT_ID` / `_SECRET` | entra.microsoft.com |
| Facebook | `AUTH_FACEBOOK_CLIENT_ID` / `_SECRET` | developers.facebook.com/apps |

LinkedIn needs the "Sign In with LinkedIn using OpenID Connect" product enabled.
GitHub is not an OpenID provider, so the verified primary address is read from
its email endpoint rather than from an identity token.

Password reset is not implemented. The recovery screen says so instead of
pretending to send an email the server cannot deliver.

## Provider integrations

The `JobProvider` contract includes identifiers, coverage metadata, search,
detail retrieval, and health checks. The live registry implements public
Greenhouse and Lever job-board APIs, recognized-partner EURES configuration,
and a robots-aware JSON-LD crawler for administrator-approved employer URLs.
LinkedIn and Indeed domains are rejected by the crawler because those sources
require partner authorization.

Production integrations must be official, licensed, public and permitted, or
initiated by the user (for example a pasted job URL or description). Unauthorized
scraping is out of scope. Provider retry, rate-limit, dead-letter, raw-payload,
sync-run, and health fields are present in the schema for a queue-backed worker.

Worldwide coverage always depends on the set of enabled, licensed providers.
NextJOB never claims that one source contains every vacancy worldwide.

## AI and factual safety

Important generation data is structured and validated. The deterministic demo
provider returns the same schema expected from a production OpenAI-compatible
adapter, including:

- model name;
- prompt version;
- generation time;
- validation result;
- claim-to-source fact IDs.

Generated experience bullets fail validation if their sources are missing or
unsupported. The product statement is visible in the UI:

> NextJOB improves wording and relevance but never invents experience.

A production model adapter should request structured JSON, validate it with Zod,
retry invalid responses within a strict limit, and refuse unsupported claims.
Raw CV text should not leave the system unless required by an explicitly chosen
parser or model and covered by consent and data-processing terms.

The production résumé flow uses server-only credentials:

- `REACTIVE_RESUME_API_KEY` authenticates résumé import, application tailoring,
  and PDF export at `https://rxresu.me/api/openapi`;
- `AI_PROVIDER`, `AI_PROVIDER_API_KEY`, and `AI_MODEL` configure the provider
  used by Reactive Resume to parse PDF/DOCX uploads and tailor applications, and
  by NextJOB's own document writer (`lib/ai-writer.ts`) for the cover letter,
  email and interview prep;
- `AI_BASE_URL` is optional for an explicitly configured compatible provider.

Generating an application (`POST /api/applications/generate`) runs in order:

1. Reactive Resume creates a job application from the exact posting and tailors
   the imported résumé to it; the PDF and the tailored structured content are
   stored privately in R2.
2. The document writer receives the verified CV (no contact details) and the
   posting, writes in the posting's language, and may only *select* CV bullets
   by id, so every experience claim stays a verbatim verified fact. It targets
   OpenAI-compatible chat-completion APIs (OpenAI, OpenRouter, Groq, Mistral,
   DeepSeek, xAI, Ollama, …); other providers fall back to the template with a
   visible warning.
3. Claims are re-validated and the ATS estimate is recomputed on the final text.
4. The package is stored per job and reused on later visits (`regenerate: true`
   or a different tone forces a rewrite), and `GET /api/applications/generate?job=`
   returns it to the studio and the document downloads (`?doc=cv|cover-letter|email|interview`).

The upload request does not continue to profile review until parsing and private
storage have succeeded. Missing credentials or provider failures return an
error; real uploads never silently become the fictional demo profile.

## ATS methodology

The estimate evaluates required and preferred keyword coverage, exact and
semantic skill terminology, title/relevance signals, standard section headings,
simple formatting, readability, and factual integrity. Default CV output is
single-column and avoids images, tables, text boxes, charts, skill bars, and
essential content in headers or footers.

The label is always **NextJOB ATS readiness estimate**. It does not reproduce
or claim access to a proprietary employer or vendor score. Actual employer
systems may parse, weigh, and rank documents differently.

## Security and privacy

Implemented controls include:

- server-side identity boundary and stable hosted user ID;
- owner-scoped prepared writes;
- private R2 object keys and no public CV URL;
- MIME, extension, filename, and file-size validation;
- file signature validation (no malware scanner is currently configured);
- explicit AI, email, and WhatsApp consent;
- same-origin checks for writes;
- API and generation rate limits;
- webhook HMAC verification;
- plain-text rendering of job descriptions;
- CSP, HSTS on HTTPS, `nosniff`, referrer, permissions, and frame policies;
- no raw CV text in analytics;
- audit and deletion-request models;
- manual data-copy/deletion requests through the published support contact.

Self-service server-side deletion and automated retention are not implemented.
Clearing browser data does not delete stored CVs. Closed-test participants should
use fictional or anonymised CVs. Provider health probes require a non-guest
identity whose verified email is in `NEXTJOB_ADMIN_EMAILS`; an empty setting
disables this operational endpoint.

Do not put service keys in `NEXT_PUBLIC_*` variables. Hosted secrets belong in
the deployment platform’s protected runtime configuration.

## Testing

Unit tests cover:

- text/title normalization;
- salary normalization;
- duplicate grouping and direct-employer preference;
- weighted scoring and hard authorization filters;
- ineligible-job suppression;
- ATS estimate semantics;
- factual claim grounding;
- real PDF and DOCX generation.

Integration tests cover:

- server-rendered landing and onboarding flow;
- the no-fictional-fallback guarantee and provider health APIs;
- provider partial failure;
- refusal to generate documents for nonexistent or fictional jobs;
- honest application-state handling;
- cross-site write rejection;
- response security headers.

## Deployment

The application builds as a Cloudflare Worker-compatible ESM bundle through
vinext and the Sites Vite plugin:

```bash
npm run build
```

Before a production launch:

1. provision hosted D1 and R2 bindings;
2. apply the generated migration;
3. configure protected secrets and enabled providers;
4. connect a production identity provider if the hosted SIWC path is not used;
5. configure any additional licensed job sources and employer-authorized native
   submission connectors;
6. configure retention, monitoring, backups, abuse thresholds, and a malware
   scanning service;
7. perform an external penetration test and provider-license review.

## Known limitations

- Worldwide coverage depends on the enabled public, licensed, or
  employer-authorized sources; no provider covers every vacancy.
- Native submission is unavailable for an employer until that employer grants
  ATS credentials and the connector can return an application receipt.
- Indeed and LinkedIn ingestion/submission require approved partner access and
  are not scraped.
- Email, WhatsApp, billing, currency conversion, OCR, and queue delivery remain
  adapter-backed services until their production providers are configured.
- Hosted Sign in with ChatGPT is wired; email/password, magic-link, Google, and
  Supabase auth controls are represented as production adapter surfaces and are
  not a home-grown auth implementation.
- D1 uses server-side ownership enforcement rather than PostgreSQL-native RLS.
- Reactive Resume owns the complete structured CV and production PDF export.
  The built-in renderer remains a simpler ATS-readable fallback.
- E2E coverage validates rendered flows and endpoints at the Worker boundary;
  cross-browser Playwright automation should be added to the deployment CI once
  browser runners are provisioned.
- ATS readiness is an estimate, not a vendor score.
- NextJOB does not guarantee interviews or job offers.
- Generated claims must remain factual and user-approved.
- NextJOB never claims submission from opening an employer form or from a local
  button click.
