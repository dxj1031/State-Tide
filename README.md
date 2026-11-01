# State Tides

State Tides is a lightweight Next.js prototype for showing that a mental or emotional state is not continuous over time.

The app takes a short fragmented note, looks for similar past entries in a local longitudinal dataset, and presents:

- a calm `Analysis` view with structured state inference
- related past fragments
- a dot-based timeline with visible gaps
- a lightweight `Next Action` reflection flow showing that responses vary

The product message is evidence-based rather than advisory:

> This state appeared before, but it was not continuous.

## Stack

- Next.js 15
- TypeScript
- React 19
- local JSON demo data
- Claude API integration with local fallback

## What The Prototype Does

When a user submits a short note, the app:

1. sends the text to `/api/classify-state`
2. infers a structured internal state record
3. compares it against known state nodes
4. uses Claude if available, otherwise falls back to local heuristics
5. finds similar past entries from local demo data
6. visualizes recurrence and discontinuity on a timeline
7. lets the user record a lightweight `next_action`
8. shows that past responses were not always the same

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and add your own Anthropic API key:

```env
ANTHROPIC_API_KEY=your-real-anthropic-api-key
ANTHROPIC_MODEL=claude-haiku-4-5
```

Important notes:

- `.env.example` is only a template
- `.env.local` is the file Next.js actually reads during local development
- do not commit `.env.local`

### 3. Run the app

```bash
npm run dev
```

Then open:

```txt
http://127.0.0.1:3000
```

If you want the same host/port used during local testing in this repo:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3002
```

## Claude API Behavior

The prototype is already wired to call Claude through:

- `app/api/classify-state/route.ts`

Claude is used only as the semantic layer. It helps:

- infer strict JSON state records with:
  - `situation`
  - `automatic_thought`
  - `emotion_labels`
  - `emotion_intensity`
  - `behavior`
- compare a new note against existing state nodes
- score similarity to multiple states
- decide whether the note is novel enough to create a new state

### Expected runtime behavior

- If `ANTHROPIC_API_KEY` is present and the account has available credits, the app will use Claude.
- If the API key is missing, invalid, rate-limited, or out of credits, the app automatically falls back to the local heuristic implementation.

This means the prototype still works end-to-end without external API availability.

## Internal Data Model

The app keeps a hidden structured state schema behind the UI. That schema includes fields such as:

- `situation`
- `automatic_thought`
- `emotion_labels`
- `emotion_intensity`
- `behavior`
- `alternative_framing`
- `tags`
- `similar_states`
- `is_novel`
- `next_action`

This structure is used internally for inference and comparison. It is not exposed as a CBT worksheet UI.

## Demo Data

The repo uses local anonymized synthetic data for the demo:

- `data/journal-entries.json`
- `data/state-nodes.json`

Note:

- `data/state-nodes.json` can change locally during runtime when a note is classified as novel
- for clean demos or commits, restore that file before committing if you do not want runtime-generated state nodes in git

The dataset is designed to show:

- recurrence
- gaps
- discontinuity
- variation in next actions

## Scripts

```bash
npm run accept
npm run dev
npm run build
npm test
```

`npm run accept` runs the tests and production build, starts the app at
`http://127.0.0.1:3002`, and opens the acceptance page in your browser.

### Failure-path regression (no live model)

Validated with Node 24.12.0. `npm test` runs the local unit suite. If the host
blocks test worker processes, run the same suite with
`node --test --test-isolation=none --experimental-strip-types tests/**/*.test.ts`.

Build once with `npm run build`. To run the eight HTTP input scenarios, start a
fresh server in one PowerShell window with `ANTHROPIC_API_KEY` empty, then run
`tests/classify-state.integration.mjs` against its URL in a second window.

For the eight model-failure scenarios, use the synthetic fixture instead. This
intercepts model requests locally; the key below is a test label, not a credential.
Start a fresh server for each suite because the endpoint allows eight requests
per minute per client.

```powershell
# Window 1, from the project root
$env:ANTHROPIC_API_KEY = 'local-synthetic-fixture'
$env:NEXT_TELEMETRY_DISABLED = '1'
node --require ./tests/fixtures/model-response.cjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3147
```

```powershell
# Window 2, from the project root
$env:STATE_TIDES_TEST_URL = 'http://127.0.0.1:3147'
$env:STATE_TIDES_TEST_MODEL = '1'
node --test --test-isolation=none tests/classify-state.reliability.mjs
```

The model request deadline is ten seconds, including response-body reading;
timeouts return a completed local fallback result. Non-object model JSON is
rejected before normalization. The tests cover those paths, synthetic upstream
rate-limit/credit failures, invalid JSON, and a valid synthetic response. They do
not measure a live model's accuracy, clinical benefit, or deployment reliability.

Historical matching uses local word/emoji overlap. Only emoji supplied in the
original note enter the search query; generated display markers do not create
history matches. Same-day records have zero absent days. Demo history is
synthetic, and next actions remain in page memory and reset on refresh.

## Project Structure

- `app/page.tsx`: main prototype UI
- `app/api/classify-state/route.ts`: Claude/fallback classification endpoint
- `lib/state-classification.ts`: internal state inference and parsing
- `lib/state-tides-service.ts`: similarity and timeline helpers
- `lib/matching.ts`: local similarity matching
- `tests/matching.test.ts`: lightweight test coverage
- `docs/similarity-and-retrieval.md`: bilingual similarity and retrieval design notes

## Automatic run animation

Each submission starts a new, in-memory run. The main stage automatically plays
captured input checks, model/local branches, field normalization, scoring,
persistence outcomes, history ranking, and timeline construction. Saving a next
action appends its actual page-memory event to the same run.

Fast execution can finish before its presentation; the animation explicitly says
it is playing captured events. Pausing pauses presentation, not the request.
Replay uses the captured events and does not call the model again. Export run
JSON downloads only the current run's input/output events and timestamps; no
server-side run history or new credentials are created. Client receipt time and
the original server clock are retained separately in the export. Reduced-motion
preferences disable decorative movement while keeping the recorded steps usable.

Persistence is reported as saved, not-saved, skipped, or reused. A returned
classification is not proof that a serverless write succeeded. The request gate,
retrieval, timeline, and optional action have explicit events, rather than being
inferred from the model response.

## Notes For Demo Use

- This is not a therapy app.
- It does not recommend what the user should do.
- It does not rank behaviors.
- The main insight is recurrence with interruption, not continuity.
