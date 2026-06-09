# Judge Paw

Judge Paw is a fictional mini-court demo for emotionally literate couple argument judgments.

The demo captures a live argument between two people, blends it with built-in case history, and returns a playful courtroom-inspired ruling with:

- a verdict
- responsibility split
- key evidence
- emotional logic
- an `OBJECTION!` escalation moment
- repair orders
- a Judge Paw stamp

Important: the demo uses public celebrity names as fictional placeholders. It is not a claim about real people, real private conversations, or real relationship dynamics.

## Stack

- Next.js 15
- TypeScript
- React 19
- Claude API integration with local fallback

## Local Setup

```bash
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:3000
```

For the local review port used in this workspace:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3005
```

## Claude Behavior

The judgment route is:

- `app/api/judge-paw/route.ts`

If `ANTHROPIC_API_KEY` is available, the app asks Claude for a structured verdict. If the API key is missing or the request fails, the app uses a deterministic local fallback so the demo remains reviewable.

## Demo Flow

1. Start from a preloaded fictional argument.
2. Add more lines from either participant.
3. Watch the tension meter update.
4. Click `Judge`.
5. Review the verdict, objection moment, evidence, responsibility split, emotional logic, and repair order.

## Scripts

```bash
npm test
npm run build
```
