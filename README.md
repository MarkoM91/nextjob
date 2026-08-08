# NextJOB

NextJOB is a production-oriented MVP for global job discovery and truthful,
job-specific application preparation.

Its promise is simple:

> Upload your CV once. Discover relevant jobs worldwide and create an ATS-ready
> application in minutes.

The MVP does **not** submit applications. A user reviews every match and every
generated sentence, downloads the documents, and applies manually on the
original employer or job-board website.

## What is implemented

- Public landing page with a focused CV → matches → application journey.
- Sign-up, sign-in, and password-recovery product surfaces, with hosted Sign in
  with ChatGPT support and replaceable production identity adapters.
- PDF, DOCX, and TXT CV upload validation with a 10 MB limit, explicit
  AI-processing consent, a malware-scan hook, and private R2 object keys.
- Structured factual profile review. Extracted fields keep source text,
  confidence, and verification status.
- 30 clearly fictional international vacancies spanning more than 10 countries,
  several languages and currencies, remote/hybrid/on-site work, missing
  salaries, sponsorship signals, expiration, and duplicate sources.
- Replaceable job-provider registry with health checks, partial-failure handling,
  permitted-source boundaries, and provider-specific configuration.
- Deterministic job normalization, salary conversion, duplicate grouping, hard
  eligibility checks, weighted matching, visible gaps, and match explanations.
- Curated matches, saved-jobs view, job detail, and original-source handoff.
- Focused application studio with Original, Tailored, and Changes views.
- Grounded CV, cover-letter, email, and interview-preparation generation.
- Claim-source links and factual validation for every generated CV bullet.
- “NextJOB ATS readiness estimate” with keyword, formatting, and factual
  integrity factors plus an explicit vendor-score disclaimer.
- Server-side selectable PDF, editable DOCX, and plain-text generation without
  rendering documents as images.
- Application package review, document history surface, and simple tracker.
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
```

`db:generate` preloads a tiny Windows sandbox workaround because some managed
Windows environments incorrectly report `ENOMEM` from `os.userInfo()`. It does
not change database behavior.

## Database and storage

`.openai/hosting.json` declares:

- D1 binding `DB` for structured, durable product data.
- R2 binding `DOCUMENTS` for private CV and generated-document bytes.

The initial migration is in `drizzle/0000_real_stature.sql`. It creates 39
tables covering users, verified candidate facts, providers and ingestion,
normalized jobs, matches, saved/rejected roles, application history, document
versions and claim sources, notifications, subscriptions, audit logs, and
deletion requests.

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

## Demo mode

Demo mode is active when `NEXT_PUBLIC_SUPABASE_URL` is missing. It provides a
complete walkthrough with:

- fictional candidate Anna Bianchi;
- simulated, source-attributed CV extraction;
- deterministic AI generation and factual validation;
- 30 fictional jobs from six fictional provider adapters;
- simulated email and WhatsApp delivery;
- real local PDF, DOCX, and TXT document bytes;
- provider degradation and failure states;
- clearly labelled fictional data.

Demo mode never calls an external AI, email, WhatsApp, job-data, or payment
service.

## Provider integrations

The `JobProvider` contract includes identifiers, coverage metadata, search,
detail retrieval, and health checks. The registry demonstrates:

- employer/direct ATS adapters;
- JSON APIs;
- XML/public feeds;
- EURES-style public feeds;
- degraded and offline provider behavior.

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
- malware-scan integration hook;
- explicit AI, email, and WhatsApp consent;
- same-origin checks for writes;
- API and generation rate limits;
- webhook HMAC verification;
- plain-text rendering of job descriptions;
- CSP, HSTS on HTTPS, `nosniff`, referrer, permissions, and frame policies;
- no raw CV text in analytics;
- audit and deletion-request models;
- data export, CV/document deletion, and account deletion product surfaces.

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
- curated matches and provider health APIs;
- provider partial failure;
- structured application generation;
- PDF, DOCX, and TXT downloads;
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
5. replace demo AI, email, WhatsApp, queue, currency, and job-provider adapters;
6. configure retention, monitoring, backups, abuse thresholds, and a malware
   scanning service;
7. perform an external penetration test and provider-license review.

## Known limitations

- The seeded job feed and candidate are fictional; live worldwide coverage is
  not bundled.
- Email, WhatsApp, billing, production AI, live job feeds, currency conversion,
  OCR, and queue delivery remain adapter-backed demo services until credentials
  and provider agreements are configured.
- Hosted Sign in with ChatGPT is wired; email/password, magic-link, Google, and
  Supabase auth controls are represented as production adapter surfaces and are
  not a home-grown auth implementation.
- D1 uses server-side ownership enforcement rather than PostgreSQL-native RLS.
- The current PDF renderer prioritizes ATS-readable selectable text over visual
  templates. It supports a single-page demo CV; a production renderer should add
  pagination, font embedding, and localized typography.
- E2E coverage validates rendered flows and endpoints at the Worker boundary;
  cross-browser Playwright automation should be added to the deployment CI once
  browser runners are provisioned.
- ATS readiness is an estimate, not a vendor score.
- NextJOB does not guarantee interviews or job offers.
- Generated claims must remain factual and user-approved.
- The MVP never auto-applies.
