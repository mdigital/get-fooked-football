# Get Fooked — agent guide

> Project hosted at `/Users/robinm/Work/GF-Football`. Football tipping app for a small group of friends, 2026 World Cup. Production deploys to Railway.

## TL;DR

- **Stack**: Next.js 15 (App Router, server actions, standalone output) + PostgreSQL + Drizzle ORM + iron-session + Tailwind. No client-side framework beyond React; auth is invite-token + bcrypt + encrypted cookies.
- **Tests**: Vitest. Pure logic lives in `src/lib/*` and is unit-tested in `tests/*.test.ts`. There's a full-tournament simulator in `tests/helpers/simulator.ts` that runs every code path end-to-end.
- **TDD is the default for new features.** See "TDD workflow" below.

## TDD workflow (red → green → refactor)

Every new piece of logic gets a failing test first. The simulator catches almost any cross-cutting break, so leaning on it is encouraged.

1. **Write the test in `tests/`**. Import from `@/lib/...`. If the function doesn't exist yet, that's the point — the test should fail with an `import` or `is not a function` error first.
2. **Run `npm test`**. Confirm red. If a different test broke instead, fix that first.
3. **Write the smallest implementation that turns the test green.** Keep the function pure if possible — DB-touching wrappers can sit alongside the pure core (see `planDraw` vs `runRandomDraw`, or `validateScoreEdit` vs `submitScoreEdit`).
4. **Run the full suite (`npm test`) and the simulator test specifically (`npx vitest run tests/simulation.test.ts`)**. Don't move on if either is red.
5. **Refactor**. Move logic into pure helpers if it's drifted into UI code. Re-run tests.
6. **Update CLAUDE.md / README** only if the feature surface or commands changed.

Rules:
- Prefer **pure functions taking plain data** over DB-querying methods. Easier to test, easier to reason about.
- The DB-aware wrapper should be a thin orchestration over the pure function (read → call pure fn → write).
- If a change touches scoring, bracket logic, or assignments, **add a simulator invariant** (`tests/simulation.test.ts`). Example: "the champion gets at least +30 from the Final."
- New routes that mutate state must validate input through a pure validator in `src/lib/*` so the validator can be tested independently.

## Project layout

```
src/
  app/
    layout.tsx             — Get Fooked nav + chrome (neobrutalist neon)
    page.tsx               — landing
    login/, register/      — invite-only auth
    fixtures/              — full 104-match calendar; each row links to /match/:id
    match/[id]/            — per-match page: scoreboard, edit history, sticker reactions
    teams/                 — your assigned teams + leftover pool
    leaderboards/          — overall / population / sheep / underdog / group-only / KO-only
    prizes/                — prize ladder
    inswap/                — InSwap League photo upload + thumbs voting
    inswap/hot-or-not/     — head-to-head tiebreaker
    polymarket/            — live odds from Polymarket Gamma API
    admin/                 — invites, run draw, results entry, award prizes
    api/auth/logout/       — POST /logout
    api/health/            — Railway health check
  db/
    schema.ts              — Drizzle table defs (users, teams, fixtures, assignments,
                             prizes, photos+votes, score_edits, match_stickers, etc.)
    client.ts              — pg pool + db handle
  lib/
    session.ts             — iron-session cookie auth
    auth.ts                — password hashing, invite tokens, bootstrap admin
    draw.ts                — planDraw (pure) + runRandomDraw (DB)
    scoring.ts             — pointsForFixture + computeTeamScores (pure)
    leaderboards.ts        — computeLeaderboard (pure) + buildLeaderboard (DB)
    bracket.ts             — group standings (FIFA tiebreakers) + KO slot fill planner (pure);
                             admin "Bracket" panel applies the plan
    score-edits.ts         — validateScoreEdit (pure) + submitScoreEdit (DB + audit log).
                             Edits are attributed to a human (userId) OR an agent (editorName, e.g. "clanker").
    results-sync.ts        — planResultSync (pure): match online results to fixtures, skip human-edited ones
    results-sync-db.ts     — runResultsSync (DB): fetch → plan → apply as "clanker" edits + audit
    thesportsdb.ts         — keyless TheSportsDB results feed + parser (env: THESPORTSDB_LEAGUE_ID/SEASON/KEY)
    inswap.ts              — InSwap standings + sort (pure)
    uploads.ts             — local image saver
    polymarket.ts          — Gamma API fetcher + 60s cache
    svg-chart.ts           — pure SVG line-chart layout helper
scripts/
  seed.ts                  — teams + group fixtures + KO placeholders + prize ladder
tests/
  scoring.test.ts          — group + KO scoring edge cases
  draw.test.ts             — deterministic draws, leftover handling, distribution invariants
  leaderboards.test.ts     — every board variant, leftover non-contribution
  score-edits.test.ts      — validator: negative scores, KO needs pens, …
  svg-chart.test.ts        — chart layout helper
  simulation.test.ts       — full-tournament invariants (champion bonus, monotonic boards)
  helpers/
    factories.ts           — type-safe data builders
    simulator.ts           — 48 teams, 104 fixtures, full bracket resolver
```

## Day-to-day commands

```bash
npm install
cp .env.example .env       # set DATABASE_URL + SESSION_SECRET + BOOTSTRAP_ADMIN_*
npm run db:migrate         # apply pending migrations (creates tables on a fresh DB)
npm run db:seed            # idempotent seed
npm run dev                # http://localhost:3000
npm test                   # vitest one-shot
npm run test:watch         # watch mode while iterating on a feature
npm run typecheck          # tsc --noEmit
npm run build              # next build (also runs typecheck)
```

## Database migrations

We use **Drizzle migrations**, not `drizzle-kit push`. Push is interactive,
brittle on composite primary keys, and doesn't track applied state — it cost
us a broken prod deploy when the schema diverged silently.

The flow:

1. Change `src/db/schema.ts`.
2. `npm run db:generate` — drizzle-kit writes a numbered SQL file into
   `drizzle/`. Open it. Read it. If it's destructive, hand-edit (it's just
   SQL).
3. `git add drizzle/` — migrations are committed to source control.
4. `npm run db:migrate` — applies any pending migrations against the
   connected `DATABASE_URL`. Idempotent — running on an already-up-to-date
   DB is a no-op.

On Railway, `docker-entrypoint.sh` runs `db:migrate` automatically on
container start, so a deploy that includes schema changes auto-applies them
before the app boots. Set `SKIP_MIGRATIONS=1` in env to disable that (e.g.
rolling the app back without touching the DB).

`scripts/migrate.ts` handles the legacy-DB bootstrap case: if the DB has
tables but no `drizzle.__drizzle_migrations` journal (because we used to
`push`), it creates the journal and marks `0000_baseline` as already
applied so the first migrate run doesn't re-CREATE existing tables.

**`db:push` is not gone**, but it's now for **local-dev-only**: throwaway DBs
where you want a quick "make the schema match the file" without bothering
to generate a migration. Never run it on prod.

## Scoring rules (one source of truth: `src/lib/scoring.ts`)

Per match a team earns:
- **GROUP**: win 3, draw 1, loss 0, plus 1 point per goal scored (capped at 4).
- **KO**: same goal points; winner picks up an advance bonus — R32 +4, R16 +6, QF +8, SF +12.
- **FINAL**: champion +30, runner-up +15 (plus their goal points).

A player's overall score = sum of points across every team allocated to them. Leftover teams don't contribute to any player but are still tracked (used for the Wooden Spoon, Cinderella Cup, etc.).

## What not to do

- Don't add behaviour to the DB-aware wrapper that isn't covered by a pure-function test.
- Don't expand the schema without a corresponding migration plan and seed update.
- Don't introduce a charting/animation library — the SVG chart is intentionally hand-rolled to stay dependency-light. If a real chart is unavoidable, ask first.
- Don't sneak business logic into route components — that bypasses the simulator. Push it down to `src/lib/*` and call from the route.

## Memory references

When working in this repo, the agent should also check `/Users/robinm/.claude/projects/-Users-robinm-Work-GF-Football/memory/MEMORY.md` for project-specific facts the user has confirmed (e.g. invariants they care about, prize amounts, group preferences).
