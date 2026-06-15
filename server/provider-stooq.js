export class StooqProvider {
  constructor() {
    this.name = "yahoo-fallback";
  }

  async fetchDailyQuotes(ticker) {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
    url.searchParams.set("range", "3mo");
    url.searchParams.set("interval", "1d");
    url.searchParams.set("includePrePost", "false");
    url.searchParams.set("events", "div,splits");

    const response = await fetch(url, {
      headers: {
        "user-agent": "SpaceXMonitoringDashboard/0.2.0"
      }
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result || data.chart?.error) {
      throw new Error(data.chart?.error?.description || `No daily quote data for ${ticker}`);
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const rows = timestamps.map((timestamp, index) => ({
      ticker,
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: quote.volume?.[index]
    })).filter((row) => Number.isFinite(row.close));

    if (!rows.length) {
      throw new Error(`No daily quote data for ${ticker}`);
    }

    return rows.slice(-120);
  }

  async fetchMarketSnapshot() {
    const [nasdaq, sp500, vix, tenYearRaw, dxy, oil, gold] = await Promise.all([
      fetchLatestClose("^IXIC"),
      fetchLatestClose("^GSPC"),
      fetchLatestClose("^VIX"),
      fetchLatestClose("^TNX"),
      fetchLatestClose("DX-Y.NYB"),
      fetchLatestClose("CL=F"),
      fetchLatestClose("GC=F")
    ]);
    const tenYearYield = tenYearRaw > 20 ? tenYearRaw / 10 : tenYearRaw;
    const mode = vix > 25 || tenYearYield > 4.8 ? "Risk-off" : vix < 16 && nasdaq ? "Risk-on" : "Neutral";

    return {
      date: new Date().toISOString().slice(0, 10),
      nasdaq,
      sp500,
      vix,
      ten_year_yield: tenYearYield,
      dxy,
      oil,
      gold,
      mode,
      fetched_at: new Date().toISOString()
    };
  }

  async fetchNews(ticker) {
    const query = newsQueryFor(ticker);
    if (!query) return [];

    const url = new URL("https://news.google.com/rss/search");
    url.searchParams.set("q", `${query} when:14d`);
    url.searchParams.set("hl", "en-US");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:en");

    const response = await fetch(url, {
      headers: {
        "user-agent": "SpaceXMonitoringDashboard/0.2.0"
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const xml = await response.text();
    return parseRssItems(xml).slice(0, 10).map((item) => ({
      id: `${ticker}-${item.published_at}-${item.title}`.replace(/\s+/g, "-").slice(0, 220),
      ticker,
      published_at: item.published_at,
      title: item.title,
      summary: item.summary,
      url: item.url,
      sentiment: "",
      source: "google-news"
    }));
  }

  async fetchFilings() {
    return [];
  }
}

function newsQueryFor(ticker) {
  const queries = {
    SPCX: '(SpaceX OR Starlink OR Starship OR "SpaceX valuation" OR "SpaceX tender offer")',
    TSLA: '(Tesla OR Robotaxi OR FSD)',
    NVDA: '(Nvidia OR "AI chips" OR GPU)',
    RKLB: '("Rocket Lab" OR RKLB)',
    ASTS: '("AST SpaceMobile" OR ASTS)',
    IRDM: '(Iridium OR IRDM satellite)',
    VSAT: '(Viasat OR VSAT satellite)',
    RDW: '("Redwire" OR RDW) (SpaceX OR Starship OR Dragon OR NASA OR payload OR "in-space manufacturing" OR "commercial space")'
  };
  return queries[ticker] || null;
}

function parseRssItems(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  return items.map((item) => ({
    title: decodeXml(textBetween(item, "title")),
    summary: stripTags(decodeXml(textBetween(item, "description"))),
    url: decodeXml(textBetween(item, "link")),
    published_at: new Date(decodeXml(textBetween(item, "pubDate")) || Date.now()).toISOString()
  })).filter((item) => item.title);
}

function textBetween(text, tag) {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1]?.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "") || "";
}

function stripTags(text) {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchLatestClose(symbol) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "5d");
  url.searchParams.set("interval", "1d");

  const response = await fetch(url, {
    headers: {
      "user-agent": "SpaceXMonitoringDashboard/0.2.0"
    }
  });
  if (!response.ok) throw new Error(`${symbol}: ${response.status} ${response.statusText}`);
  const data = await response.json();
  const result = data.chart?.result?.[0];
  if (!result || data.chart?.error) throw new Error(`${symbol}: ${data.chart?.error?.description || "No data"}`);
  const closes = result.indicators?.quote?.[0]?.close || [];
  const latest = [...closes].reverse().find((value) => Number.isFinite(value));
  if (!Number.isFinite(latest)) throw new Error(`${symbol}: missing close`);
  return latest;
}
