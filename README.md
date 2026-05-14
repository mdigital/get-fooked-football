# Get Fooked — 2026 World Cup tipping

Invite-only football tipping for a small group of friends. Random team draw with a leftover pool, six leaderboards (overall, by population, by sheep, underdog cup, group-only, KO-only), a fixture calendar, prize tracker, the **InSwap League** photo competition, sticker reactions on every match, and a live **Polymarket** odds page.

## Stack

- **Next.js 15** App Router · server actions · standalone output
- **PostgreSQL** + **Drizzle ORM**
- **iron-session** + bcrypt (invite-token auth, no SMTP)
- **Tailwind** with a neobrutalist-neon theme
- **Vitest** for unit + full-tournament simulation tests
- Local file uploads, persisted via a Railway volume

## Local dev

```bash
npm install
cp .env.example .env       # DATABASE_URL, SESSION_SECRET, BOOTSTRAP_ADMIN_*
npm run db:migrate         # apply migrations (creates tables on a fresh DB)
npm run db:seed            # 48 teams + 104 fixtures + starter prizes (idempotent)
npm run dev
```

Open <http://localhost:3000>. Sign in as your bootstrap admin, go to `/admin`, generate an invite link, share it.

## Tests

```bash
npm test                   # all suites
npm run test:watch
```

Highlights:
- **`tests/scoring.test.ts`** — group/KO scoring edge cases, ET, pens, the cap at 4 goal points.
- **`tests/draw.test.ts`** — deterministic seeded draws, leftover pool, even distribution, edge cases (1 user, more users than teams).
- **`tests/leaderboards.test.ts`** — every board variant, leftover non-contribution.
- **`tests/score-edits.test.ts`** — validator: negative scores, integer-only, plausibility, KO ties need pens.
- **`tests/svg-chart.test.ts`** — chart layout helper.
- **`tests/simulation.test.ts`** — runs an entire 104-match World Cup with a seeded PRNG and verifies invariants (champion takes home +30, runner-up +15, board totals = sum of team scores, every board monotonically sorted, determinism, variety across seeds).

The simulator (in `tests/helpers/simulator.ts`) is the workhorse — every cross-cutting refactor should keep it green.

## TDD

New features follow red-green-refactor. See [CLAUDE.md](CLAUDE.md) for the discipline. Short version:

1. Add a failing test in `tests/` against a function in `@/lib/...`.
2. Run `npm test` and confirm red.
3. Implement the smallest change to turn it green.
4. Run `npm test` again. Refactor if needed. Add a simulator invariant if the feature affects scoring/draw/bracket.

## Deploy to Railway

1. Push the repo to GitHub.
2. Railway → New Project → Deploy from GitHub.
3. Add the **PostgreSQL** plugin (auto-populates `DATABASE_URL`).
4. Set env vars on the web service:
   - `SESSION_SECRET` (32+ chars; `openssl rand -base64 48`)
   - `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`
   - `BUY_IN_NZD=100` (optional)
   - `POLYMARKET_EVENT_SLUG=fifa-world-cup-2026-winner` (default — adjust if Polymarket renames it)
5. Attach a **volume** mounted at `/app/public/uploads`. This is where match stickers, InSwap photos, and other uploads live.
6. After the first deploy, in the Railway shell: `npm run db:seed` (the container entrypoint already runs `db:migrate` on every start).
7. Sign in as the bootstrap admin → `/admin` → generate invite → share the link.

`railway.json` configures the Dockerfile builder and a `/api/health` healthcheck.

## Scoring

- **Group**: win 3, draw 1, loss 0 + 1 per goal scored (capped at 4).
- **KO advance bonus**: R32 +4, R16 +6, QF +8, SF +12.
- **Final**: champion +30, runner-up +15.

Each player's total = sum of points across their assigned teams. Leftover teams don't tally for any player but feed special prizes.

## Match scores — anyone can edit

Any signed-in member can update a fixture's score from its match page (`/match/:id`). Every edit is appended to `score_edits` with the editor's name and timestamp, and the full history is shown on the page. The admin panel still works for bulk entry; edits there also flow through the same audit log.

Validation lives in `src/lib/score-edits.ts::validateScoreEdit` — negatives, non-integers, implausible totals, and drawn KO matches without penalty scores all get rejected.

## InSwap League

- Sign in → `/inswap` → upload a JPG/PNG/WEBP/GIF (6MB max).
- Everyone thumbs-ups whatever they like. Toggle on / off.
- Tied at the top? `/inswap/hot-or-not` presents random pairs for head-to-head votes.

## Match stickers (iPhone Stickers app support)

Each `/match/:id` page has a sticker board. Two ways to add:

- **Quick emoji buttons** + a custom-emoji field.
- **Image stickers** — paste, drag, or pick. On iPhone, long-press a sticker in Messages or Photos → **Copy**, then ⌘V into the paste field (or paste on iOS if your keyboard supports it). The image lands in the upload input and is saved as a sticker tied to the match.

> iOS Safari currently exposes pasted images via the standard Clipboard API, so this works. Native Sticker-pack extensions (the kind that show inside the iOS Messages app) require a dedicated iOS app — out of scope for the web build.

Stickers are auto-positioned with a slight randomness so the board doesn't pile up. Owners (and admins) can delete their own.

## Polymarket odds

`/polymarket` clones Polymarket's market header for the 2026 World Cup Winner event: title, top-4 percentages, time-series chart, full ladder of countries with Buy Yes / Buy No prices, and a deep-link back to Polymarket.

Implementation: server-side fetch against `gamma-api.polymarket.com` and `clob.polymarket.com`, cached for 60s. No API key needed. If Polymarket renames the event slug, override via the `POLYMARKET_EVENT_SLUG` env var.

## Customising

- **Teams / draw / fixtures**: edit `scripts/seed.ts` and re-run `npm run db:seed`. Idempotent — only inserts missing rows.
- **Population, sheep, FIFA rank, custom stats**: stored on the `teams` row (`stats` jsonb for anything bespoke).
- **Prize ladder**: same seed file. Admin can also award/un-award via the UI.
- **Adding a new board** (e.g. "by average team age"): add it to `BOARD_META` and `computeLeaderboard()` in `src/lib/leaderboards.ts` — both are pure and easy to test.

## Security

- bcrypt password hashes (cost 10).
- iron-session cookies; rotate `SESSION_SECRET` to log everyone out.
- Invite tokens are 24 random bytes (URL-safe base64), single-use.
- Uploads filtered by MIME + 6MB max.
- Score edits are audit-logged with `score_edits` — anyone can edit, but everyone sees who.
