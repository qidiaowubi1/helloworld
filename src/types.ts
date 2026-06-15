export type RiskLevel = "green" | "yellow" | "red";
export type AlertLevel = "red" | "yellow" | "green";
export type Importance = "high" | "medium" | "low";

export interface IndicatorSignal {
  label: string;
  tone: AlertLevel;
  metric: string;
  current: string;
  howToWatch: string;
  referenceRange: string;
  cadence: string;
  source: string;
  evidence: string;
}

export interface Asset {
  ticker: string;
  name: string;
  theme: string;
  group: string;
  status: string;
  priority?: number;
  hasData: boolean;
  asOf: string | null;
  price: number | null;
  dailyChange: number | null;
  fiveDayChange: number | null;
  twentyDayChange: number | null;
  trend: string;
  volumeRatio: number | null;
  relativeStrength: string;
  score: number | null;
  riskLevel: RiskLevel;
  signals: IndicatorSignal[];
  nextCatalyst: string;
  riskNote: string;
  insight: string;
  fundamentals: {
    revenueGrowth: string;
    margin: string;
    fcf: string;
    guidance: string;
  };
  valuation: {
    primaryMetric: string;
    range: string;
    comment: string;
  };
  events: string[];
}

export interface Alert {
  level: AlertLevel;
  ticker: string;
  title: string;
  reason: string;
  action: string;
  timestamp: string;
}

export interface MarketEvent {
  date: string;
  ticker: string;
  type: string;
  importance: Importance;
  description: string;
  source?: string;
}
