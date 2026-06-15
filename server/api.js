import http from "node:http";
import { spawn } from "node:child_process";
import { migrate, openDb, rowToAsset } from "./db.js";
import { loadEnv } from "./config.js";

const config = loadEnv();
const db = migrate(openDb());

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) return send(response, 404, { error: "Not found" });
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return send(response, 200, {
        ok: true,
        version: "0.2.0",
        hasApiKey: Boolean(config.apiKey),
        provider: config.apiKey ? "massive" : "yahoo-fallback"
      });
    }
    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      return send(response, 200, getDashboard());
    }
    if (request.method === "GET" && url.pathname === "/api/assets") {
      return send(response, 200, { assets: getAssets() });
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/assets/")) {
      const ticker = decodeURIComponent(url.pathname.split("/").at(-1) || "").toUpperCase();
      const asset = getAsset(ticker);
      return asset ? send(response, 200, { asset }) : send(response, 404, { error: "Asset not found" });
    }
    if (request.method === "GET" && url.pathname === "/api/events") {
      return send(response, 200, { events: getEvents() });
    }
    if (request.method === "GET" && url.pathname === "/api/risk") {
      return send(response, 200, getRisk());
    }
    if (request.method === "POST" && url.pathname === "/api/admin/refresh") {
      return runRefresh(response);
    }

    return send(response, 404, { error: "Not found" });
  } catch (error) {
    return send(response, 500, { error: error.message });
  }
});

server.listen(config.apiPort, "127.0.0.1", () => {
  console.log(`API server listening on http://127.0.0.1:${config.apiPort}`);
});

function getDashboard() {
  const assets = getAssets();
  const update = latestUpdateRun();
  return {
    meta: {
      version: "0.2.0",
      dataStatus: assets.some((asset) => asset.hasData) ? "ready" : "empty",
      hasApiKey: Boolean(config.apiKey),
      lastUpdated: update?.finished_at || null,
      message: statusMessage(Boolean(config.apiKey), assets.some((asset) => asset.hasData), update)
    },
    marketSnapshot: getMarketSnapshot(update),
    assets,
    alerts: buildAlerts(assets),
    events: getEvents(),
    risk: getRisk().riskSummary,
    themeHeat: buildThemeHeat(assets)
  };
}

function getAssets() {
  return db.prepare(`
    SELECT a.*, d.as_of, d.score, d.risk_level, d.trend, d.volume_ratio, d.relative_strength,
           d.daily_change, d.five_day_change, d.twenty_day_change, d.price, d.signals_json
    FROM assets a
    LEFT JOIN derived_metrics d ON d.ticker = a.ticker
    WHERE a.enabled = 1
    ORDER BY a.priority, a.ticker
  `).all().map(toApiAsset);
}

function getAsset(ticker) {
  const asset = getAssets().find((item) => item.ticker === ticker);
  if (!asset) return null;
  const news = db.prepare("SELECT * FROM news_items WHERE ticker = ? ORDER BY published_at DESC LIMIT 10").all(ticker);
  const filings = db.prepare("SELECT * FROM filings WHERE ticker = ? ORDER BY filed_at DESC LIMIT 10").all(ticker);
  const quotes = db.prepare("SELECT * FROM quotes_daily WHERE ticker = ? ORDER BY date DESC LIMIT 60").all(ticker);
  return { ...asset, news, filings, quotes };
}

function getEvents() {
  const eventRows = db.prepare("SELECT * FROM events ORDER BY date DESC LIMIT 50").all();
  const newsEvents = db.prepare(`
    SELECT ticker, published_at as date, '新闻' as type,
           CASE WHEN sentiment = 'negative' THEN 'high' ELSE 'medium' END as importance,
           title as description, source
    FROM news_items
    ORDER BY published_at DESC
    LIMIT 30
  `).all();
  const filingEvents = db.prepare(`
    SELECT ticker, filed_at as date, form_type as type, 'high' as importance,
           COALESCE(description, form_type) as description, source
    FROM filings
    ORDER BY filed_at DESC
    LIMIT 30
  `).all();
  return [...eventRows, ...newsEvents, ...filingEvents].filter((event) => event.date).slice(0, 60);
}

function getRisk() {
  const assets = getAssets();
  const readyAssets = assets.filter((asset) => asset.hasData);
  const redAssets = assets.filter((asset) => asset.riskLevel === "red");
  const yellowAssets = assets.filter((asset) => asset.riskLevel === "yellow");
  const groups = new Map();
  for (const asset of assets) groups.set(asset.group, (groups.get(asset.group) || 0) + 1);
  const maxGroup = Math.max(0, ...groups.values());

  return {
    riskSummary: {
      sectorConcentration: assets.length ? Math.round((maxGroup / assets.length) * 100) : 0,
      singleNameExposure: 0,
      portfolioBeta: null,
      cashRatio: null,
      notes: readyAssets.length
        ? ["风险敞口基于最新入库数据计算。", "红灯资产优先于总分排序。"]
        : ["未完成首次更新，风险敞口只显示 watchlist 结构，不显示模拟行情。"]
    },
    redAssets,
    yellowAssets
  };
}

function toApiAsset(row) {
  const base = rowToAsset(row);
  const signals = row.signals_json ? JSON.parse(row.signals_json) : [];
  return {
    ...base,
    hasData: Boolean(row.as_of),
    asOf: row.as_of || null,
    price: row.price,
    dailyChange: row.daily_change,
    fiveDayChange: row.five_day_change,
    twentyDayChange: row.twenty_day_change,
    trend: row.trend || "未更新",
    volumeRatio: row.volume_ratio,
    relativeStrength: row.relative_strength || "未更新",
    score: row.score,
    riskLevel: row.risk_level || "yellow",
    signals,
    nextCatalyst: signals[0]?.label || (row.as_of ? "无触发信号" : "等待首次更新"),
    riskNote: signals[0]?.evidence || (row.as_of ? "价格、量能和趋势已更新；暂无额外动态指标触发。" : "未完成首次更新；请运行 data:update。"),
    insight: row.as_of ? "由 SQLite 中的最新行情、新闻和 filings 派生。" : "尚无真实行情入库。",
    fundamentals: {
      revenueGrowth: "等待 provider 接入",
      margin: "等待 provider 接入",
      fcf: "等待 provider 接入",
      guidance: "等待 provider 接入"
    },
    valuation: {
      primaryMetric: "等待 provider 接入",
      range: "未更新",
      comment: "估值字段不使用模拟数据。"
    },
    events: signals.map((signal) => signal.label)
  };
}

function latestUpdateRun() {
  return db.prepare("SELECT * FROM update_runs ORDER BY id DESC LIMIT 1").get();
}

function statusMessage(hasApiKey, hasData, update) {
  if (!hasData) return "未完成首次更新：请运行 npm run data:update。";
  if (update?.status === "partial") return "数据已部分更新，部分 ticker 失败；查看 update_runs.errors_json。";
  if (!hasApiKey) return "数据已由公开行情 fallback 入库；设置 MASSIVE_API_KEY 后可升级新闻和 filings。";
  return "数据已由本地 API 和 SQLite 提供。";
}

function getMarketSnapshot(update) {
  const row = db.prepare("SELECT * FROM market_snapshots ORDER BY date DESC LIMIT 1").get();
  return row || {
    date: update?.finished_at?.slice(0, 10) || null,
    mode: "Neutral",
    fetched_at: update?.finished_at || null
  };
}

function buildAlerts(assets) {
  return assets
    .flatMap((asset) => asset.signals.slice(0, 2).map((signal) => ({
      level: signal.tone,
      ticker: asset.ticker,
      title: signal.label,
      reason: signal.howToWatch,
      action: signal.referenceRange,
      timestamp: asset.asOf || ""
    })))
    .slice(0, 8);
}

function buildThemeHeat(assets) {
  const byGroup = new Map();
  for (const asset of assets) {
    const bucket = byGroup.get(asset.group) || [];
    bucket.push(asset);
    byGroup.set(asset.group, bucket);
  }
  return Array.from(byGroup, ([name, groupAssets]) => ({
    name,
    value: Math.round(groupAssets.reduce((sum, asset) => sum + (asset.score || 0), 0) / Math.max(1, groupAssets.length)),
    change: Number((groupAssets.reduce((sum, asset) => sum + (asset.twentyDayChange || 0), 0) / Math.max(1, groupAssets.length)).toFixed(1))
  }));
}

function runRefresh(response) {
  const child = spawn(process.execPath, ["server/update-data.js"], { cwd: process.cwd(), stdio: "ignore", detached: true });
  child.unref();
  return send(response, 202, { status: "started", provider: config.apiKey ? "massive" : "yahoo-fallback" });
}

function send(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload));
}
