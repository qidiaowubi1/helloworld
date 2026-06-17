import { buildDecisionSummary } from "../server/decision-summary.js";

const WATCHLIST = [
  { ticker: "SPCX", name: "SpaceX", theme: "Space/AI", group: "主资产", status: "观察", priority: 1 },
  { ticker: "RDW", name: "Redwire", theme: "SpaceX合作线索/太空基础设施", group: "SpaceX生态", status: "重点观察", priority: 2 },
  { ticker: "RKLB", name: "Rocket Lab", theme: "太空经济代理", group: "SpaceX生态", status: "观察", priority: 3 },
  { ticker: "ASTS", name: "AST SpaceMobile", theme: "卫星直连手机", group: "SpaceX生态", status: "事件型", priority: 4 },
  { ticker: "IRDM", name: "Iridium", theme: "卫星通信", group: "SpaceX生态", status: "观察", priority: 5 },
  { ticker: "VSAT", name: "Viasat", theme: "卫星宽带竞争", group: "SpaceX生态", status: "观察", priority: 6 },
  { ticker: "LHX", name: "L3Harris", theme: "国防航天电子", group: "SpaceX生态", status: "观察", priority: 7 },
  { ticker: "HWM", name: "Howmet Aerospace", theme: "航天材料/部件", group: "SpaceX生态", status: "观察", priority: 8 },
  { ticker: "TSM", name: "TSMC", theme: "先进制程", group: "AI/数据中心旁证", status: "核心", priority: 9 },
  { ticker: "ASML", name: "ASML", theme: "EUV瓶颈", group: "AI/数据中心旁证", status: "重点", priority: 10 },
  { ticker: "AVGO", name: "Broadcom", theme: "AI ASIC/网络", group: "AI/数据中心旁证", status: "核心", priority: 11 },
  { ticker: "AMD", name: "AMD", theme: "AI GPU替代", group: "AI/数据中心旁证", status: "重点", priority: 12 },
  { ticker: "MU", name: "Micron", theme: "HBM/DRAM", group: "AI/数据中心旁证", status: "重点", priority: 13 },
  { ticker: "ARM", name: "Arm", theme: "AI CPU生态", group: "AI/数据中心旁证", status: "观察", priority: 14 },
  { ticker: "VRT", name: "Vertiv", theme: "数据中心电源/液冷", group: "AI/数据中心旁证", status: "重点", priority: 15 },
  { ticker: "ANET", name: "Arista Networks", theme: "AI网络", group: "AI/数据中心旁证", status: "重点", priority: 16 },
  { ticker: "CEG", name: "Constellation Energy", theme: "AI电力", group: "AI/数据中心旁证", status: "重点", priority: 17 }
];

const MARKET_SYMBOLS = {
  nasdaq: "^IXIC",
  sp500: "^GSPC",
  vix: "^VIX",
  ten_year_yield: "^TNX",
  dxy: "DX-Y.NYB",
  oil: "CL=F",
  gold: "GC=F"
};

export default async function handler(_request, response) {
  try {
    const cloudSnapshot = await fetchCloudSnapshot();
    if (cloudSnapshot) {
      return response.status(200).json(cloudSnapshot);
    }

    response.status(200).json(await buildLiveDashboard());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Dashboard API failed" });
  }
}

export async function buildLiveDashboard() {
  const [quotes, marketSnapshot, news] = await Promise.all([
    fetchQuotes(WATCHLIST.map((asset) => asset.ticker)),
    fetchMarketSnapshot(),
    fetchSpaceNews()
  ]);
  const assets = WATCHLIST.map((asset) => toAsset(asset, quotes.get(asset.ticker), news));
  const events = buildEvents(news);
  return {
    meta: {
      version: "0.2.5",
      dataStatus: "ready",
      hasApiKey: Boolean(process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY),
      lastUpdated: new Date().toISOString(),
      message: "Vercel cron snapshot: Yahoo chart + Google News RSS fallback."
    },
    marketSnapshot,
    assets,
    alerts: buildAlerts(assets),
    events,
    risk: buildRisk(assets),
    themeHeat: buildThemeHeat(assets),
    decisionSummary: buildDecisionSummary(assets, marketSnapshot)
  };
}

async function fetchCloudSnapshot() {
  const url = process.env.DASHBOARD_BLOB_URL;
  if (!url) return null;
  try {
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
      headers: { accept: "application/json" },
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`Blob snapshot returned ${res.status}`);
    const snapshot = await res.json();
    return {
      ...snapshot,
      meta: {
        ...snapshot.meta,
        version: snapshot.meta?.version || "0.2.5",
        dataStatus: snapshot.meta?.dataStatus || "ready",
        message: `Cloud batch snapshot via Vercel Blob. ${snapshot.meta?.message || ""}`.trim(),
        cloudSource: "vercel-blob",
        cloudUrl: url
      }
    };
  } catch (error) {
    console.warn(`Cloud snapshot unavailable: ${error.message}`);
    return null;
  }
}

async function fetchQuotes(tickers) {
  const pairs = await Promise.all(tickers.map(async (ticker) => [ticker, await fetchQuote(ticker)]));
  return new Map(pairs);
}

async function fetchQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1mo&interval=1d`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const meta = result?.meta || {};
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  const points = timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    close: quote?.close?.[index],
    volume: quote?.volume?.[index] || 0
  })).filter((point) => Number.isFinite(point.close));
  const metaPrice = Number(meta.regularMarketPrice);
  const metaTime = Number(meta.regularMarketTime);
  if (Number.isFinite(metaPrice)) {
    const metaDate = Number.isFinite(metaTime) ? new Date(metaTime * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const latest = points.at(-1);
    const metaVolume = Number(meta.regularMarketVolume || latest?.volume || 0);
    if (!latest || latest.date !== metaDate) {
      points.push({ date: metaDate, close: metaPrice, volume: metaVolume });
    } else {
      latest.close = metaPrice;
      latest.volume = metaVolume;
    }
  }
  if (!points.length) return null;
  const price = points.at(-1).close;
  const prev = points.at(-2)?.close || Number(meta.chartPreviousClose) || price;
  const five = points.at(-6)?.close || points[0]?.close || price;
  const twenty = points.at(-21)?.close || points[0]?.close || price;
  const previousVolumes = points.slice(-21, -1).map((point) => point.volume).filter((value) => Number.isFinite(value));
  const avgVolume = average(previousVolumes);
  const lastVolume = points.at(-1).volume || 0;
  const asOf = points.at(-1).date;
  return {
    price,
    dailyChange: pct(price, prev),
    fiveDayChange: pct(price, five),
    twentyDayChange: pct(price, twenty),
    volumeRatio: avgVolume ? lastVolume / avgVolume : null,
    asOf
  };
}

async function fetchMarketSnapshot() {
  const entries = await Promise.all(Object.entries(MARKET_SYMBOLS).map(async ([key, symbol]) => {
    const quote = await fetchQuote(symbol);
    return [key, quote?.price ?? null];
  }));
  const snapshot = Object.fromEntries(entries);
  const vix = Number(snapshot.vix ?? 0);
  const tenYear = Number(snapshot.ten_year_yield ?? 0);
  return {
    date: new Date().toISOString().slice(0, 10),
    ...snapshot,
    mode: vix > 22 || tenYear > 4.8 ? "Risk-off" : vix > 18 ? "Neutral" : "Constructive",
    fetched_at: new Date().toISOString()
  };
}

async function fetchSpaceNews() {
  const query = encodeURIComponent('(SpaceX OR Starlink OR Starship OR "Redwire" OR RDW) (FAA OR FCC OR NASA OR launch OR contract OR payload OR valuation)');
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g)]
    .slice(0, 10)
    .map((match) => ({
      ticker: /redwire|\brdw\b/i.test(match[1]) ? "RDW" : "SPCX",
      title: clean(match[1]),
      url: clean(match[2]),
      date: new Date(match[3]).toISOString(),
      source: "Google News RSS"
    }));
}

function toAsset(asset, quote, news) {
  const volumeRatio = quote?.volumeRatio ?? null;
  const twentyDayChange = quote?.twentyDayChange ?? null;
  const signals = asset.ticker === "SPCX" ? spcxSignals(quote, news) : relatedSignals(asset, quote, news);
  const riskLevel = deriveRisk(volumeRatio, twentyDayChange, signals);
  return {
    ...asset,
    hasData: Boolean(quote),
    asOf: quote?.asOf ?? null,
    price: quote?.price ?? null,
    dailyChange: quote?.dailyChange ?? null,
    fiveDayChange: quote?.fiveDayChange ?? null,
    twentyDayChange,
    trend: trendLabel(twentyDayChange),
    volumeRatio,
    relativeStrength: relativeStrength(twentyDayChange),
    score: opportunityScore(asset, quote, signals),
    riskLevel,
    signals,
    nextCatalyst: signals[0]?.label || "等待新闻",
    riskNote: signals[0]?.evidence || "等待公开行情/新闻确认",
    insight: "生产环境由 Vercel API 动态抓取公开行情和新闻；本地 SQLite 自动化仍用于桌面版本。",
    fundamentals: {
      revenueGrowth: "待接入基本面 provider",
      margin: "待接入基本面 provider",
      fcf: "待接入基本面 provider",
      guidance: "待接入基本面 provider"
    },
    valuation: {
      primaryMetric: "新闻/二级市场估值线索",
      range: "待接入 provider",
      comment: "不使用模拟估值；只展示公开新闻和行情派生信号。"
    },
    events: signals.map((signal) => signal.label)
  };
}

function spcxSignals(quote, news) {
  const latest = news.find((item) => item.ticker === "SPCX")?.title || "等待 SpaceX / Starlink / Starship 新闻";
  const volume = quote?.volumeRatio;
  return [
    {
      label: "SpaceX 热点新闻",
      tone: "yellow",
      metric: "发射 / Starship / Starlink / 融资估值 / 监管事件",
      current: latest,
      howToWatch: "每天看是否出现 FAA/FCC/NASA/国防合同、Starlink 用户数据、Starship 发射窗口或二级交易新闻。",
      referenceRange: "绿: 普通运营更新；黄: 发射/监管/融资/合同进入关键节点；红: 发射失败、监管延迟、重大事故或估值交易显著降温。",
      cadence: "每日；发射/监管窗口盘前和盘后各复核一次",
      source: "Google News RSS + Yahoo chart via Vercel API",
      evidence: latest
    },
    {
      label: "SPCX量能/换手",
      tone: volume == null || volume < 0.4 || volume > 2 ? "yellow" : "green",
      metric: "成交量倍数 / 20日均量",
      current: volume == null ? "未更新" : `${volume.toFixed(1)}x 20日均量`,
      howToWatch: "观察成交量是否从事件高位衰减，并对照价格是否跌破关键区间。",
      referenceRange: "正常 0.7-1.5x；异动 >2x；新股/事件过热 >5x；衰减确认 连续3日低于首日40%。",
      cadence: "每日",
      source: "Yahoo chart volume",
      evidence: volume == null ? "等待成交量更新" : `当前约为20日均量的 ${volume.toFixed(1)}x`
    },
    {
      label: "锁定期/流动性风险",
      tone: "yellow",
      metric: "二级交易流动性 / 可交易供给 / 估值折价",
      current: "等待二级交易和 filings 数据确认",
      howToWatch: "SpaceX 未上市，重点看二级市场供给、tender offer、估值折价和代理标的流动性。",
      referenceRange: "绿: 供给稳定且估值成交活跃；黄: 报价分歧扩大或供给增加；红: tender 估值下修、交易折价扩大或监管限制。",
      cadence: "每周复盘；出现融资/二级交易新闻时即时更新",
      source: "新闻、公司公告、二级市场报道",
      evidence: "生产 API 暂未接入 filings，保留为每日观察项。"
    }
  ];
}

function relatedSignals(asset, quote, news) {
  if (asset.ticker === "RDW") {
    const latest = news.find((item) => item.ticker === "RDW")?.title || "暂未发现 RDW 与 SpaceX 同框新闻";
    return [{
      label: "SpaceX合作线索",
      tone: /spacex|starship|dragon|falcon|payload/i.test(latest) ? "yellow" : "green",
      metric: "RDW + SpaceX/Starship/Dragon/Falcon/载荷 同框",
      current: latest,
      howToWatch: "每天检查 Redwire 新闻是否和 SpaceX、Starship、Dragon、Falcon、rideshare、payload integration 同时出现。",
      referenceRange: "绿: 普通 RDW/NASA 新闻；黄: 出现 SpaceX/Starship/Dragon/载荷同框；红: 合作落空、合同延期、发射失败或任务取消。",
      cadence: "每日",
      source: "Google News RSS + Yahoo chart via Vercel API",
      evidence: latest
    }];
  }
  return [{
    label: `${asset.group}旁证`,
    tone: quote?.twentyDayChange != null && quote.twentyDayChange < -12 ? "red" : "green",
    metric: "20日表现 / 量能",
    current: quote?.twentyDayChange == null ? "未更新" : `${quote.twentyDayChange.toFixed(1)}% 20日表现`,
    howToWatch: "只作为 SpaceX 叙事的产业链和风险偏好旁证，不单独做交易排名。",
    referenceRange: "绿: 同步走强；黄: 背离1-2周；红: 连续走弱且量能放大。",
    cadence: "每日",
    source: "Yahoo chart",
    evidence: `${asset.ticker} is monitored as SpaceX ecosystem evidence.`
  }];
}

function buildEvents(news) {
  return news.map((item) => ({
    ticker: item.ticker,
    date: item.date,
    type: "新闻",
    importance: "medium",
    description: item.title,
    source: item.source
  }));
}

function buildAlerts(assets) {
  return assets.flatMap((asset) => asset.signals.slice(0, 1).map((signal) => ({
    level: signal.tone,
    ticker: asset.ticker,
    title: signal.label,
    reason: signal.howToWatch,
    action: signal.referenceRange,
    timestamp: asset.asOf || new Date().toISOString()
  }))).slice(0, 8);
}

function buildRisk(assets) {
  const redAssets = assets.filter((asset) => asset.riskLevel === "red");
  const yellowAssets = assets.filter((asset) => asset.riskLevel === "yellow");
  return {
    sectorConcentration: 100,
    singleNameExposure: 0,
    portfolioBeta: null,
    cashRatio: null,
    notes: [
      "生产环境使用 Vercel API 动态抓取公开行情和新闻。",
      `${redAssets.length} 个红灯，${yellowAssets.length} 个黄灯；红灯优先于分数。`
    ]
  };
}

function buildThemeHeat(assets) {
  const groups = new Map();
  for (const asset of assets) {
    const list = groups.get(asset.group) || [];
    list.push(asset);
    groups.set(asset.group, list);
  }
  return Array.from(groups, ([name, list]) => ({
    name,
    value: Math.round(list.reduce((sum, asset) => sum + (asset.score || 0), 0) / list.length),
    change: Number((list.reduce((sum, asset) => sum + (asset.twentyDayChange || 0), 0) / list.length).toFixed(1))
  }));
}

function deriveRisk(volumeRatio, twentyDayChange, signals) {
  if (signals.some((signal) => signal.tone === "red")) return "red";
  if ((twentyDayChange ?? 0) < -12 || (volumeRatio ?? 1) > 2.5 || (volumeRatio ?? 1) < 0.4) return "yellow";
  return "green";
}

function opportunityScore(asset, quote, signals) {
  const base = asset.ticker === "SPCX" ? 76 : asset.ticker === "RDW" ? 68 : asset.group === "SpaceX生态" ? 58 : 55;
  const trend = Math.max(-12, Math.min(12, quote?.twentyDayChange ?? 0));
  const signalBonus = signals.some((signal) => signal.tone === "yellow") ? 4 : 0;
  const riskPenalty = signals.some((signal) => signal.tone === "red") ? 15 : 0;
  return Math.max(0, Math.min(100, Math.round(base + trend + signalBonus - riskPenalty)));
}

function trendLabel(value) {
  if (value == null) return "未更新";
  if (value > 8) return "多头";
  if (value < -8) return "破位";
  return "震荡";
}

function relativeStrength(value) {
  if (value == null) return "未更新";
  if (value > 8) return "很强";
  if (value > 2) return "偏强";
  if (value < -8) return "偏弱";
  return "中性";
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function pct(current, previous) {
  return previous ? ((current - previous) / previous) * 100 : 0;
}

function clean(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}
