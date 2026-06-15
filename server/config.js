import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const envPath = resolve(rootDir, ".env.local");
  if (existsSync(envPath)) {
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (!process.env[key]) process.env[key] = rest.join("=").trim();
    }
  }

  return {
    apiKey: process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "",
    apiPort: Number(process.env.API_PORT || 8787),
    dbPath: resolve(rootDir, process.env.DB_PATH || "./data/market.sqlite"),
    watchlistPath: resolve(rootDir, "./config/watchlist.json")
  };
}

export function loadWatchlist(config = loadEnv()) {
  return JSON.parse(readFileSync(config.watchlistPath, "utf8")).assets;
}
