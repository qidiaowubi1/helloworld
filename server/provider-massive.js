const BASE_URL = "https://api.polygon.io";

export class MassiveProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async fetchDailyQuotes(ticker) {
    const to = new Date();
    const from = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90);
    const path = `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${isoDate(from)}/${isoDate(to)}`;
    const data = await this.get(path, { adjusted: "true", sort: "asc", limit: "120" });
    return (data.results || []).map((row) => ({
      ticker,
      date: isoDate(new Date(row.t)),
      open: row.o,
      high: row.h,
      low: row.l,
      close: row.c,
      volume: row.v
    }));
  }

  async fetchNews(ticker) {
    const data = await this.get("/v2/reference/news", { ticker, limit: "10", order: "desc", sort: "published_utc" });
    return (data.results || []).map((row) => ({
      id: row.id || `${ticker}-${row.published_utc}-${row.title}`,
      ticker,
      published_at: row.published_utc,
      title: row.title || "",
      summary: row.description || "",
      url: row.article_url || "",
      sentiment: row.insights?.find((insight) => insight.ticker === ticker)?.sentiment || "",
      source: "massive"
    }));
  }

  async fetchFilings(ticker) {
    const forms = await Promise.allSettled([
      this.get("/stocks/filings/vX/form-3", { ticker, limit: "10" }),
      this.get("/stocks/filings/vX/form-4", { ticker, limit: "10" })
    ]);
    return forms.flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      return (result.value.results || []).map((row) => ({
        id: row.id || `${ticker}-${row.filing_date || row.filed_at}-${row.form_type || "filing"}`,
        ticker,
        filed_at: row.filing_date || row.filed_at || row.acceptance_datetime || "",
        form_type: row.form_type || row.form || "filing",
        description: row.description || row.document_description || "",
        url: row.filing_url || row.url || "",
        source: "massive"
      }));
    });
  }

  async get(path, params = {}) {
    const url = new URL(path, BASE_URL);
    for (const [key, value] of Object.entries({ ...params, apiKey: this.apiKey })) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    }
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 180)}`);
    }
    return response.json();
  }
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}
