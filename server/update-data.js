import { openDb, migrate, rowToAsset } from "./db.js";
import { loadEnv } from "./config.js";
import { MassiveProvider } from "./provider-massive.js";
import { StooqProvider } from "./provider-stooq.js";
import { deriveMetrics } from "./signals.js";

const config = loadEnv();
const startedAt = new Date().toISOString();
const errors = [];
let updatedCount = 0;

{
  const db = migrate(openDb());
  const provider = config.apiKey ? new MassiveProvider(config.apiKey) : new StooqProvider();
  const providerName = provider.name || (config.apiKey ? "massive" : "stooq");

  if (!config.apiKey) {
    console.warn("MASSIVE_API_KEY is missing. Using public quotes/news fallback provider; filings will stay empty.");
  }

  const run = db.prepare("INSERT INTO update_runs (started_at, status, provider, errors_json) VALUES (?, ?, ?, ?)").run(
    startedAt,
    "running",
    providerName,
    "[]"
  );
  const runId = run.lastInsertRowid;
  const assets = db.prepare("SELECT * FROM assets WHERE enabled = 1 ORDER BY priority, ticker").all().map(rowToAsset);

  for (const asset of assets) {
    try {
      const updated = await updateAsset(db, provider, asset, providerName);
      if (updated) updatedCount += 1;
      console.log(`Updated ${asset.ticker}`);
    } catch (error) {
      const message = `${asset.ticker}: ${error.message}`;
      errors.push(message);
      console.error(message);
    }
  }

  try {
    await updateMarketSnapshot(db, provider);
    console.log("Updated market snapshot");
  } catch (error) {
    const message = `market snapshot: ${error.message}`;
    errors.push(message);
    console.error(message);
  }

  db.prepare("UPDATE update_runs SET finished_at = ?, status = ?, errors_json = ? WHERE id = ?").run(
    new Date().toISOString(),
    updatedCount === 0 ? "failed" : errors.length ? "partial" : "success",
    JSON.stringify(errors),
    runId
  );
  db.close();

  if (updatedCount === 0) process.exitCode = 1;
}

async function updateAsset(db, provider, asset, providerName) {
  const fetchedAt = new Date().toISOString();
  const [quotes, news, filings] = await Promise.all([
    provider.fetchDailyQuotes(asset.ticker),
    provider.fetchNews(asset.ticker).catch((error) => {
      console.warn(`${asset.ticker} news skipped: ${error.message}`);
      return [];
    }),
    provider.fetchFilings(asset.ticker).catch((error) => {
      console.warn(`${asset.ticker} filings skipped: ${error.message}`);
      return [];
    })
  ]);

  const quoteStmt = db.prepare(`
    INSERT INTO quotes_daily (ticker, date, open, high, low, close, volume, source, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ticker, date) DO UPDATE SET
      open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close,
      volume = excluded.volume, source = excluded.source, fetched_at = excluded.fetched_at
  `);
  for (const quote of quotes) {
    quoteStmt.run(asset.ticker, quote.date, quote.open, quote.high, quote.low, quote.close, quote.volume, providerName, fetchedAt);
  }

  const newsStmt = db.prepare(`
    INSERT OR REPLACE INTO news_items (id, ticker, published_at, title, summary, url, sentiment, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of news) {
    newsStmt.run(item.id, asset.ticker, item.published_at, item.title, item.summary, item.url, item.sentiment, item.source);
  }

  const filingStmt = db.prepare(`
    INSERT OR REPLACE INTO filings (id, ticker, filed_at, form_type, description, url, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const filing of filings) {
    filingStmt.run(filing.id, asset.ticker, filing.filed_at, filing.form_type, filing.description, filing.url, filing.source);
  }

  const latestNews = db.prepare("SELECT * FROM news_items WHERE ticker = ? ORDER BY published_at DESC LIMIT 10").all(asset.ticker);
  const latestFilings = db.prepare("SELECT * FROM filings WHERE ticker = ? ORDER BY filed_at DESC LIMIT 10").all(asset.ticker);
  const latestEvents = db.prepare("SELECT * FROM events WHERE ticker = ? ORDER BY date DESC LIMIT 10").all(asset.ticker);
  const metrics = deriveMetrics(asset, quotes, latestNews, latestFilings, latestEvents);
  if (!metrics) return false;

  db.prepare(`
    INSERT INTO derived_metrics (
      ticker, as_of, score, risk_level, trend, volume_ratio, relative_strength,
      daily_change, five_day_change, twenty_day_change, price, signals_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ticker) DO UPDATE SET
      as_of = excluded.as_of, score = excluded.score, risk_level = excluded.risk_level,
      trend = excluded.trend, volume_ratio = excluded.volume_ratio, relative_strength = excluded.relative_strength,
      daily_change = excluded.daily_change, five_day_change = excluded.five_day_change,
      twenty_day_change = excluded.twenty_day_change, price = excluded.price,
      signals_json = excluded.signals_json
  `).run(
    asset.ticker,
    metrics.asOf,
    metrics.score,
    metrics.riskLevel,
    metrics.trend,
    metrics.volumeRatio,
    metrics.relativeStrength,
    metrics.dailyChange,
    metrics.fiveDayChange,
    metrics.twentyDayChange,
    metrics.price,
    JSON.stringify(metrics.signals)
  );
  return true;
}

async function updateMarketSnapshot(db, provider) {
  if (typeof provider.fetchMarketSnapshot !== "function") return;
  const snapshot = await provider.fetchMarketSnapshot();
  db.prepare(`
    INSERT INTO market_snapshots (
      date, nasdaq, sp500, vix, ten_year_yield, dxy, oil, gold, mode, fetched_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      nasdaq = excluded.nasdaq,
      sp500 = excluded.sp500,
      vix = excluded.vix,
      ten_year_yield = excluded.ten_year_yield,
      dxy = excluded.dxy,
      oil = excluded.oil,
      gold = excluded.gold,
      mode = excluded.mode,
      fetched_at = excluded.fetched_at
  `).run(
    snapshot.date,
    snapshot.nasdaq,
    snapshot.sp500,
    snapshot.vix,
    snapshot.ten_year_yield,
    snapshot.dxy,
    snapshot.oil,
    snapshot.gold,
    snapshot.mode,
    snapshot.fetched_at
  );
}
