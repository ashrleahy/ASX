# ASX Momentum

A 12-month momentum + 200-day trend-filter signal board for a basket of ~80
liquid ASX-listed stocks. Generates a monthly-rebalanced, equal-weighted
"buy list" and backtests it against the ASX200. **Signals only — it doesn't
place trades.**

Free data via [`yahoo-finance2`](https://github.com/gadicc/node-yahoo-finance2),
stored in Postgres, kept current with a daily Vercel Cron job.

> ⚠️ The ticker list in `lib/universe.ts` is a hand-picked basket of today's
> liquid large/mid-caps, **not** the official point-in-time ASX200
> constituent history. That means the backtest has a mild survivorship
> bias (you never see stocks that got delisted or dropped out of the index
> along the way). Fine for testing the strategy logic; if you want to trust
> absolute backtest returns, that's the gap a paid bias-free dataset
> (e.g. Norgate Data) closes.

## Stack

- Next.js 14 (App Router, TypeScript)
- Postgres via [Neon](https://neon.tech) (serverless driver, free tier)
- `yahoo-finance2` for price data (free, no API key)
- Vercel Cron for daily sync
- Recharts for the equity curve

## 1. Set up the database

1. Create a free [Neon](https://neon.tech) project.
2. Copy the connection string it gives you.
3. Run `schema.sql` against it once, e.g.:
   ```bash
   psql "$DATABASE_URL" -f schema.sql
   ```
   (or paste it into Neon's SQL editor in the dashboard)

## 2. Push to GitHub

```bash
git init
git add -A
git commit -m "Initial commit"
gh repo create asx-momentum --private --source=. --push
# or create the repo on github.com and: git remote add origin <url> && git push -u origin main
```

## 3. Deploy on Vercel

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Add environment variables (Project Settings → Environment Variables):
   - `DATABASE_URL` — your Neon connection string
   - `CRON_SECRET` — any random 16+ character string (Vercel sends this
     automatically as a Bearer token when it triggers the cron job)
3. Deploy.

The `vercel.json` in this repo already registers a daily cron job
(`/api/cron/sync`, weekdays at 08:00 UTC — comfortably after the ASX
closes) so once deployed it'll keep itself updated automatically.

## 4. Backfill history (run once)

The daily cron only pulls ~30 days at a time, so right after your first
deploy you need to backfill the full ~10 years of history once:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://your-app.vercel.app/api/backfill"
```

On the free Hobby plan, function duration is capped lower than Pro, so this
single call may time out partway through ~80 tickers. That's fine — it's
safe to re-run (upserts), or batch it explicitly:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://your-app.vercel.app/api/backfill?offset=0&limit=20"
curl -H "Authorization: Bearer $CRON_SECRET" "https://your-app.vercel.app/api/backfill?offset=20&limit=20"
curl -H "Authorization: Bearer $CRON_SECRET" "https://your-app.vercel.app/api/backfill?offset=40&limit=20"
curl -H "Authorization: Bearer $CRON_SECRET" "https://your-app.vercel.app/api/backfill?offset=60&limit=20"
```

Then visit your deployed URL — the dashboard reads straight from Postgres.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and CRON_SECRET
npm run dev
```

## Strategy logic (`lib/momentum.ts`)

- **Momentum**: 12-month return, skipping the most recent month (the
  standard "12-1" momentum factor — skipping the last month avoids
  short-term mean-reversion noise).
- **Trend filter**: only consider stocks currently trading above their
  200-day simple moving average.
- **Selection**: rank trend-qualified stocks by momentum, take the top 15%,
  equal-weight.
- **Rebalance**: monthly, using each calendar month's last trading day.
- **Backtest**: no transaction costs, fees, or slippage modelled — real
  returns will be lower, especially with monthly turnover across ~12 names.

## Extending this

- Swap `lib/universe.ts` for a proper point-in-time ASX200/300 list if you
  get access to one (e.g. via Norgate) — biggest lever on backtest realism.
- Add position sizing / risk overlays beyond simple equal-weight.
- Add a notifications route (email/Slack) the cron job calls when the
  monthly buy list changes, so you don't have to check the dashboard.
- Track realized trades against the signals to see how following them
  manually actually performed (slippage vs. the frictionless backtest).
