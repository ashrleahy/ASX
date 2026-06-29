-- Run this once against your Neon database before first use.
-- e.g. via Neon's SQL editor, or `psql $DATABASE_URL -f schema.sql`

CREATE TABLE IF NOT EXISTS prices (
    ticker      TEXT NOT NULL,
    date        DATE NOT NULL,
    close       DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices (ticker, date);

CREATE TABLE IF NOT EXISTS sync_log (
    id          SERIAL PRIMARY KEY,
    run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    tickers_ok  INTEGER NOT NULL,
    tickers_failed INTEGER NOT NULL,
    notes       TEXT
);
