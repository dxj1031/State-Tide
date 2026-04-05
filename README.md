# State Tides

State Tides is a lightweight Next.js prototype for showing that a mental or emotional state is not continuous over time.

The app takes a short fragmented note, looks for similar past entries in a local longitudinal dataset, and presents:

- a calm `Reading` view with structured state inference
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
ANTHROPIC_MODEL=claude-sonnet-4-20250514
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

- infer structured internal state records
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

The dataset is designed to show:

- recurrence
- gaps
- discontinuity
- variation in next actions

## Scripts

```bash
npm run dev
npm run build
npm test
```

## Project Structure

- `app/page.tsx`: main prototype UI
- `app/api/classify-state/route.ts`: Claude/fallback classification endpoint
- `lib/state-classification.ts`: internal state inference and parsing
- `lib/state-tides-service.ts`: similarity and timeline helpers
- `lib/matching.ts`: local similarity matching
- `tests/matching.test.ts`: lightweight test coverage

## Notes For Demo Use

- This is not a therapy app.
- It does not recommend what the user should do.
- It does not rank behaviors.
- The main insight is recurrence with interruption, not continuity.
