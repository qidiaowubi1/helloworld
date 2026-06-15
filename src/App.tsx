import { useEffect, useMemo, useState } from "react";
import type { Alert, Asset, MarketEvent, RiskLevel } from "./types";

type Page = "command" | "stocks" | "events" | "risk";
type SortKey = "score" | "risk" | "change" | "volume";
type DataStatus = "loading" | "ready" | "empty" | "error";

interface DashboardData {
  meta: {
    version: string;
    dataStatus: "ready" | "empty";
    hasApiKey: boolean;
    lastUpdated: string | null;
    message: string;
  };
  marketSnapshot: Record<string, unknown>;
  assets: Asset[];
  alerts: Alert[];
  events: MarketEvent[];
  risk: {
    sectorConcentration: number;
    singleNameExposure: number;
    portfolioBeta: number | null;
    cashRatio: number | null;
    notes: string[];
  };
  themeHeat: Array<{ name: string; value: number; change: number }>;
}

const pages: Array<{ id: Page; label: string }> = [
  { id: "command", label: "Command Center" },
  { id: "stocks", label: "个股" },
  { id: "events", label: "事件" },
  { id: "risk", label: "风险" }
];

const riskRank: Record<RiskLevel, number> = { red: 3, yellow: 2, green: 1 };
const riskLabel: Record<RiskLevel, string> = { red: "红灯", yellow: "黄灯", green: "绿灯" };
const alertLabel = { red: "红色预警", yellow: "黄色复盘", green: "绿色机会" };

function formatChange(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "未更新";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "未更新";
  return `$${value.toFixed(2)}`;
}

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function App() {
  const [page, setPage] = useState<Page>("command");
  const [selectedTicker, setSelectedTicker] = useState("SPCX");
  const [groupFilter, setGroupFilter] = useState("全部");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<DataStatus>("loading");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function loadDashboard() {
    try {
      setStatus("loading");
      const response = await fetch("/api/dashboard");
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as DashboardData;
      setData(payload);
      setStatus(payload.meta.dataStatus);
      setError("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unable to load dashboard API.");
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const assets = data?.assets ?? [];
  const groups = useMemo(() => ["全部", ...Array.from(new Set(assets.map((asset) => asset.group)))], [assets]);
  const selectedAsset = assets.find((asset) => asset.ticker === selectedTicker) ?? assets[0];

  const sortedAssets = useMemo(() => {
    const filtered = groupFilter === "全部" ? assets : assets.filter((asset) => asset.group === groupFilter);
    return [...filtered].sort((a, b) => {
      if (sortKey === "score") return (b.score ?? -1) - (a.score ?? -1);
      if (sortKey === "risk") return riskRank[b.riskLevel] - riskRank[a.riskLevel];
      if (sortKey === "change") return (b.dailyChange ?? -999) - (a.dailyChange ?? -999);
      return (b.volumeRatio ?? -1) - (a.volumeRatio ?? -1);
    });
  }, [assets, groupFilter, sortKey]);

  async function refreshData() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/refresh", { method: "POST" });
      if (!response.ok) throw new Error(await response.text());
      setError("已触发后台更新；稍后刷新 Dashboard 查看结果。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SX</div>
          <div>
            <strong>SpaceX Monitor</strong>
            <span>API + SQLite Dashboard</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="Dashboard pages">
          {pages.map((item) => (
            <button className={cx("nav-item", page === item.id && "active")} key={item.id} onClick={() => setPage(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-panel">
          <span className="eyebrow">数据状态</span>
          <strong>{data?.meta.lastUpdated ?? "未完成首次更新"}</strong>
          <p>{data?.meta.message ?? "正在连接本地 API..."}</p>
          <button className="secondary-button" disabled={refreshing} onClick={refreshData}>
            {refreshing ? "触发中..." : "手动更新"}
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">本地 API → SQLite → 派生指标 → Dashboard</span>
            <h1>{pageTitle(page)}</h1>
          </div>
          <div className={cx("mode-pill", data?.meta.dataStatus === "ready" ? "riskon" : "neutral")}>
            v{data?.meta.version ?? "0.2.0"} · {statusText(status)}
          </div>
        </header>

        {error && <div className="notice">{error}</div>}
        {status === "loading" && <EmptyState title="正在读取本地 API" message="Dashboard 会从 /api/dashboard 获取 SQLite 中的数据。" />}
        {status === "error" && <EmptyState title="API 连接失败" message={error || "请确认 npm run api 已启动。"} />}
        {status !== "loading" && status !== "error" && assets.length === 0 && (
          <EmptyState title="未配置关注列表" message="请检查 config/watchlist.json，然后运行 npm run data:migrate。" />
        )}
        {status === "empty" && assets.length > 0 && (
          <EmptyState
            title="未连接数据源 / 未完成首次更新"
            message="当前只读取 watchlist 元数据，不显示模拟行情。设置 .env.local 的 MASSIVE_API_KEY 后运行 npm run data:update。"
          />
        )}

        {assets.length > 0 && page === "command" && (
          <CommandCenter
            data={data}
            selectedTicker={selectedTicker}
            setSelectedTicker={setSelectedTicker}
            setPage={setPage}
            sortedAssets={sortedAssets.slice(0, 18)}
            groupFilter={groupFilter}
            setGroupFilter={setGroupFilter}
            groups={groups}
            sortKey={sortKey}
            setSortKey={setSortKey}
          />
        )}
        {assets.length > 0 && page === "stocks" && selectedAsset && (
          <StocksPage
            selectedAsset={selectedAsset}
            setSelectedTicker={setSelectedTicker}
            sortedAssets={sortedAssets}
            groupFilter={groupFilter}
            setGroupFilter={setGroupFilter}
            groups={groups}
            sortKey={sortKey}
            setSortKey={setSortKey}
          />
        )}
        {assets.length > 0 && page === "events" && <EventsPage events={data?.events ?? []} setSelectedTicker={setSelectedTicker} setPage={setPage} />}
        {assets.length > 0 && page === "risk" && <RiskPage assets={assets} risk={data?.risk} setSelectedTicker={setSelectedTicker} setPage={setPage} />}
      </main>
    </div>
  );
}

function statusText(status: DataStatus) {
  if (status === "ready") return "真实数据";
  if (status === "empty") return "等待首次更新";
  if (status === "error") return "API 错误";
  return "加载中";
}

function pageTitle(page: Page) {
  if (page === "command") return "市场决策中枢";
  if (page === "stocks") return "个股质量雷达";
  if (page === "events") return "未来事件日历";
  return "组合风险敞口";
}

function CommandCenter(props: {
  data: DashboardData | null;
  selectedTicker: string;
  setSelectedTicker: (ticker: string) => void;
  setPage: (page: Page) => void;
  sortedAssets: Asset[];
  groupFilter: string;
  setGroupFilter: (group: string) => void;
  groups: string[];
  sortKey: SortKey;
  setSortKey: (key: SortKey) => void;
}) {
  const spcx = props.data?.assets.find((asset) => asset.ticker === "SPCX");
  if (spcx) {
    return <SpaceXFocusDashboard data={props.data} spcx={spcx} setSelectedTicker={props.setSelectedTicker} setPage={props.setPage} />;
  }

  return (
    <section className="dashboard-grid command-grid">
      <MarketTemperature snapshot={props.data?.marketSnapshot} />
      <WatchlistTable {...props} />
      <AlertsPanel alerts={props.data?.alerts ?? []} />
      <ThemeHeat themes={props.data?.themeHeat ?? []} />
      <RiskSignalBoard assets={props.data?.assets ?? []} />
      <PortfolioRiskMini risk={props.data?.risk} />
    </section>
  );
}

function SpaceXFocusDashboard({
  data,
  spcx,
  setSelectedTicker,
  setPage
}: {
  data: DashboardData | null;
  spcx: Asset;
  setSelectedTicker: (ticker: string) => void;
  setPage: (page: Page) => void;
}) {
  const assets = data?.assets ?? [];
  const relatedTickers = ["RDW", "RKLB", "ASTS", "IRDM", "VSAT", "LHX", "HWM"];
  const infraTickers = ["TSM", "ASML", "AVGO", "AMD", "MU", "ARM", "VRT", "ANET", "CEG"];
  const related = relatedTickers.map((ticker) => assets.find((asset) => asset.ticker === ticker)).filter(Boolean) as Asset[];
  const infra = infraTickers.map((ticker) => assets.find((asset) => asset.ticker === ticker)).filter(Boolean) as Asset[];
  const spcxEvents = (data?.events ?? []).filter((event) => event.ticker === "SPCX").slice(0, 6);
  const advice = buildSpcxAdviceV2(spcx, data?.marketSnapshot, related);

  return (
    <section className="spacex-focus">
      <section className="panel spacex-hero-panel">
        <div className="spacex-hero">
          <div>
            <span className="eyebrow">SpaceX Only Command Center</span>
            <h2>SPCX · SpaceX 每日监控</h2>
            <p>把政策、产业链、大盘、资金面和消息面收在一个视图里；其它股票只作为 SpaceX 叙事的证据，不再做排名游戏。</p>
          </div>
          <div className="spacex-scorebox">
            <span>机会分</span>
            <strong>{spcx.score ?? "-"}</strong>
            <RiskPill risk={spcx.riskLevel} />
          </div>
        </div>
        <div className="spacex-quick-grid">
          <MiniFact label="价格" value={formatPrice(spcx.price)} detail={formatChange(spcx.dailyChange)} />
          <MiniFact label="20日表现" value={formatChange(spcx.twentyDayChange)} detail={spcx.relativeStrength} />
          <MiniFact label="量能" value={typeof spcx.volumeRatio === "number" ? `${spcx.volumeRatio.toFixed(1)}x` : "未更新"} detail="对比20日均量" />
          <MiniFact label="下一关注" value={spcx.nextCatalyst} detail={spcx.asOf ?? "未更新"} />
        </div>
      </section>

      <section className={cx("panel action-panel", advice.tone)}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">操作建议</span>
            <h2>{advice.action}</h2>
          </div>
          <RiskPill risk={advice.tone} />
        </div>
        <p>{advice.reason}</p>
        <TriggerChecklist items={advice.triggers} />
      </section>

      <SpaceXSignalSection spcx={spcx} />
      <PolicySection spcx={spcx} events={spcxEvents} />
      <MarketSection snapshot={data?.marketSnapshot} />
      <FlowSection spcx={spcx} />
      <ChainSection title="SpaceX 生态代理" assets={related} setSelectedTicker={setSelectedTicker} setPage={setPage} />
      <ChainSection title="AI/数据中心旁证" assets={infra.slice(0, 6)} setSelectedTicker={setSelectedTicker} setPage={setPage} />
      <NewsSection events={spcxEvents} />
      <DailyRules />
    </section>
  );
}

function MiniFact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="mini-fact">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{detail}</em>
    </div>
  );
}

type TriggerStatus = "triggered" | "watch" | "clear";

type TriggerItem = {
  label: string;
  current: string;
  threshold: string;
  status: TriggerStatus;
  note: string;
};

function statusTone(status: TriggerStatus): RiskLevel {
  if (status === "triggered") return "red";
  if (status === "watch") return "yellow";
  return "green";
}

function triggerLabel(status: TriggerStatus) {
  if (status === "triggered") return "已触发";
  if (status === "watch") return "接近/需要盯";
  return "未触发";
}

function marketNumber(snapshot: Record<string, unknown> | undefined, key: string) {
  const value = Number(snapshot?.[key] ?? NaN);
  return Number.isFinite(value) ? value : null;
}

function buildSpcxAdviceV2(spcx: Asset, snapshot: Record<string, unknown> | undefined, related: Asset[]) {
  const vix = marketNumber(snapshot, "vix");
  const tenYear = marketNumber(snapshot, "ten_year_yield");
  const redRelatedCount = related.filter((asset) => asset.riskLevel === "red").length;
  const yellowRelatedCount = related.filter((asset) => asset.riskLevel === "yellow").length;
  const volumeRatio = spcx.volumeRatio ?? null;
  const dailyChange = spcx.dailyChange ?? null;
  const score = spcx.score ?? 0;

  const triggers: TriggerItem[] = [
    {
      label: "大盘风险",
      current: `VIX ${vix == null ? "未更新" : vix.toFixed(1)} / 10Y ${tenYear == null ? "未更新" : `${tenYear.toFixed(2)}%`}`,
      threshold: "VIX > 22 或 10Y > 4.8% 才算触发",
      status: vix != null && tenYear != null && (vix > 22 || tenYear > 4.8) ? "triggered" : vix != null && tenYear != null && (vix > 19 || tenYear > 4.6) ? "watch" : "clear",
      note: "这是宏观降级条件。未触发时只是每日背景监控，不代表已经看空。"
    },
    {
      label: "SpaceX生态代理",
      current: `${redRelatedCount} 只红灯 / ${yellowRelatedCount} 只黄灯`,
      threshold: "RDW、RKLB、ASTS、IRDM、VSAT、LHX、HWM 中 2 只以上红灯才触发",
      status: redRelatedCount >= 2 ? "triggered" : redRelatedCount === 1 || yellowRelatedCount >= 3 ? "watch" : "clear",
      note: "这是产业链确认项。代理股同步走弱时，说明叙事没有被资金面确认。"
    },
    {
      label: "SPCX量能/换手",
      current: volumeRatio == null ? "未更新" : `${volumeRatio.toFixed(1)}x 20日均量`,
      threshold: "0.7-1.5x 正常；>2x 异动；>5x 过热；连续低于首日40% 算衰减确认",
      status: volumeRatio == null ? "watch" : volumeRatio > 2 || volumeRatio < 0.4 ? "watch" : "clear",
      note: "这是你每天最该看的资金面指标：放量不涨、缩量破位、或高位换手衰减都要降级观察。"
    },
    {
      label: "价格确认",
      current: dailyChange == null ? "未更新" : `${dailyChange > 0 ? "+" : ""}${dailyChange.toFixed(1)}% 当日变化`,
      threshold: "放量下跌或跌破近5日低点才算风险触发",
      status: dailyChange != null && dailyChange < -5 && (volumeRatio ?? 0) > 1.5 ? "triggered" : dailyChange != null && dailyChange < -3 ? "watch" : "clear",
      note: "不是跌一天就否定叙事；要看价格是否和量能一起变坏。"
    },
    {
      label: "消息/政策催化",
      current: spcx.nextCatalyst || "等待新闻",
      threshold: "FAA/FCC/NASA/国防合同/Starlink数据/Starship发射窗口进入关键节点",
      status: spcx.signals.some((signal) => signal.tone === "red") ? "triggered" : spcx.signals.some((signal) => signal.tone === "yellow") ? "watch" : "clear",
      note: "这是消息面分层：普通新闻只记录，可验证催化才升级，事故/监管延迟才降级。"
    }
  ];

  const triggered = triggers.filter((item) => item.status === "triggered").length;
  const watch = triggers.filter((item) => item.status === "watch").length;
  const highOpportunity = score >= 75;

  if (spcx.riskLevel === "red" || triggered > 0) {
    return {
      tone: "red" as RiskLevel,
      action: "风险优先，暂停追高",
      reason: "下面不是泛泛提醒，而是按当前数据跑出来的降级检查表。红色代表已经触发；黄色代表接近阈值，需要盘中/盘后重点复核。",
      triggers
    };
  }

  if (highOpportunity || watch >= 2) {
    return {
      tone: "yellow" as RiskLevel,
      action: "核心观察，等待确认",
      reason: "SpaceX 叙事强，但现在更重要的是看资金面、政策和生态代理是否继续确认。黄色项不是坏消息，而是每日必须盯的观察点。",
      triggers
    };
  }

  return {
    tone: "green" as RiskLevel,
    action: "观察为主，等催化",
    reason: "当前没有硬性降级信号。继续按下方清单跟踪，大盘、量能、产业链和消息面同时转强时再升级判断。",
    triggers
  };
}

function TriggerChecklist({ items }: { items: TriggerItem[] }) {
  return (
    <div className="trigger-checklist">
      <div className="trigger-heading">
        <span>降级/升级检查表</span>
        <em>红=已发生；黄=接近阈值；绿=目前正常</em>
      </div>
      {items.map((item) => (
        <article className={cx("trigger-item", statusTone(item.status))} key={item.label}>
          <div>
            <strong>{item.label}</strong>
            <span>{item.current}</span>
          </div>
          <div>
            <b>{triggerLabel(item.status)}</b>
            <p>{item.threshold}</p>
            <p>{item.note}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function buildSpcxAdvice(spcx: Asset, snapshot: Record<string, unknown> | undefined, related: Asset[]) {
  const riskOff = Number(snapshot?.vix ?? 0) > 22 || Number(snapshot?.ten_year_yield ?? 0) > 4.8;
  const weakRelated = related.filter((asset) => asset.riskLevel === "red").length >= 2;
  const hotVolume = (spcx.volumeRatio ?? 0) > 2;
  const highOpportunity = (spcx.score ?? 0) >= 75;

  if (spcx.riskLevel === "red" || riskOff || weakRelated) {
    return {
      tone: "red" as RiskLevel,
      action: "风险优先，暂停追高",
      reason: "SpaceX 叙事仍强，但风险灯、大盘或生态代理出现压力时，先保护观察质量。等待风险信号缓和后再重新评估。",
      rules: ["VIX > 22 或 10Y > 4.8% 降级", "生态代理两只以上红灯降级", "价格跌破关键区间且量能放大降级"]
    };
  }

  if (highOpportunity && spcx.riskLevel === "yellow") {
    return {
      tone: "yellow" as RiskLevel,
      action: "核心观察，等待确认",
      reason: "机会分高来自 SpaceX 叙事、Starlink/Starship/IPO 新闻热度；但估值、锁定期/流动性和换手衰减仍未完全确认。",
      rules: ["量能 0.7-1.5x 且新闻无负面可维持观察", "出现合同/发射/监管正反馈可升级", "估值折价或供给增加则降级"]
    };
  }

  return {
    tone: hotVolume ? "yellow" as RiskLevel : "green" as RiskLevel,
    action: "观察为主，等催化",
    reason: "当前没有足够强的新增确认信号。继续看新闻、量能和产业链代理是否同步转强。",
    rules: ["无新增催化不主动升级", "新闻热但价格不跟要谨慎", "RDW/RKLB/ASTS 同步走强是加分证据"]
  };
}

function SpaceXSignalSection({ spcx }: { spcx: Asset }) {
  return (
    <section className="panel focus-wide">
      <div className="panel-header"><div><span className="eyebrow">Signals</span><h2>最需要盯的指标</h2></div></div>
      <div className="focus-card-grid">
        {spcx.signals.map((signal) => (
          <article className={cx("focus-card", signal.tone)} key={signal.label}>
            <strong>{signal.label}</strong>
            <dl>
              <div><dt>当前</dt><dd>{signal.current}</dd></div>
              <div><dt>怎么盯</dt><dd>{signal.howToWatch}</dd></div>
              <div><dt>Reference</dt><dd>{signal.referenceRange}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function PolicySection({ spcx, events }: { spcx: Asset; events: MarketEvent[] }) {
  const policySignals = spcx.signals.filter((signal) => /监管|FAA|FCC|锁定|流动性|估值|新闻/.test(`${signal.label} ${signal.metric} ${signal.howToWatch}`));
  return (
    <section className="panel">
      <div className="panel-header"><div><span className="eyebrow">Policy / Listing</span><h2>政策与上市供给</h2></div></div>
      <div className="focus-list">
        {policySignals.slice(0, 3).map((signal) => <p key={signal.label}><strong>{signal.label}</strong>{signal.referenceRange}</p>)}
        {events.slice(0, 2).map((event) => <p key={`${event.date}-${event.description}`}><strong>{event.date}</strong>{event.description}</p>)}
      </div>
    </section>
  );
}

function MarketSection({ snapshot }: { snapshot?: Record<string, unknown> }) {
  return (
    <section className="panel">
      <div className="panel-header"><div><span className="eyebrow">Macro Tape</span><h2>大盘环境</h2></div><span className="status-chip">{String(snapshot?.mode ?? "Neutral")}</span></div>
      <div className="macro-grid">
        <MiniFact label="Nasdaq" value={valueOrPending(snapshot?.nasdaq)} detail="风险偏好" />
        <MiniFact label="VIX" value={valueOrPending(snapshot?.vix)} detail=">22 降级" />
        <MiniFact label="10Y" value={valueOrPending(snapshot?.ten_year_yield)} detail=">4.8% 降级" />
        <MiniFact label="DXY" value={valueOrPending(snapshot?.dxy)} detail="美元压力" />
      </div>
    </section>
  );
}

function FlowSection({ spcx }: { spcx: Asset }) {
  return (
    <section className="panel">
      <div className="panel-header"><div><span className="eyebrow">Flow</span><h2>资金面</h2></div></div>
      <div className="focus-list">
        <p><strong>成交量</strong>{typeof spcx.volumeRatio === "number" ? `${spcx.volumeRatio.toFixed(1)}x 20日均量。正常 0.7-1.5x，>2x 表示异动，>5x 过热。` : "等待更新。"}</p>
        <p><strong>价格确认</strong>1日 {formatChange(spcx.dailyChange)}，5日 {formatChange(spcx.fiveDayChange)}，20日 {formatChange(spcx.twentyDayChange)}。</p>
        <p><strong>风险条件</strong>新闻很热但量价不跟，或放量跌破关键区间，操作偏保守。</p>
      </div>
    </section>
  );
}

function ChainSection({ title, assets, setSelectedTicker, setPage }: { title: string; assets: Asset[]; setSelectedTicker: (ticker: string) => void; setPage: (page: Page) => void }) {
  return (
    <section className="panel">
      <div className="panel-header"><div><span className="eyebrow">Chain Evidence</span><h2>{title}</h2></div></div>
      <div className="chain-list">
        {assets.map((asset) => (
          <button key={asset.ticker} onClick={() => { setSelectedTicker(asset.ticker); setPage("stocks"); }}>
            <span><strong>{asset.ticker}</strong>{asset.theme}</span>
            <em>{formatChange(asset.dailyChange)} · {asset.score ?? "-"} · {riskLabel[asset.riskLevel]}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function NewsSection({ events }: { events: MarketEvent[] }) {
  return (
    <section className="panel focus-wide">
      <div className="panel-header"><div><span className="eyebrow">News Tape</span><h2>消息面</h2></div></div>
      <div className="news-strip">
        {events.length === 0 && <p className="empty-state">暂无 SpaceX 新闻入库。</p>}
        {events.map((event) => (
          <article key={`${event.date}-${event.description}`}>
            <span>{event.date}</span>
            <strong>{event.description}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function DailyRules() {
  return (
    <section className="panel focus-wide">
      <div className="panel-header"><div><span className="eyebrow">Daily Process</span><h2>每日监控规则</h2></div></div>
      <div className="daily-rules">
        <p><strong>盘前</strong>扫 SpaceX / Starlink / Starship / FAA / FCC / NASA / tender / lock-up 新闻，标记普通、催化、风险。</p>
        <p><strong>盘中</strong>看 SPCX 量能是否 {">"}2x、是否跌破关键区间；RDW/RKLB/ASTS 是否同步确认。</p>
        <p><strong>盘后</strong>复盘新闻是否兑现到价格和产业链，更新风险灯；无确认则不升级。</p>
      </div>
    </section>
  );
}

function MarketTemperature({ snapshot }: { snapshot?: Record<string, unknown> }) {
  const metrics = [
    ["Nasdaq", valueOrPending(snapshot?.nasdaq)],
    ["S&P 500", valueOrPending(snapshot?.sp500)],
    ["VIX", valueOrPending(snapshot?.vix)],
    ["10Y", valueOrPending(snapshot?.ten_year_yield)],
    ["DXY", valueOrPending(snapshot?.dxy)],
    ["Oil", valueOrPending(snapshot?.oil)],
    ["Gold", valueOrPending(snapshot?.gold)]
  ];

  return (
    <section className="panel market-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Market Temperature</span>
          <h2>市场温度</h2>
        </div>
        <span className="status-chip">{String(snapshot?.mode ?? "Neutral")}</span>
      </div>
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function WatchlistTable(props: {
  selectedTicker: string;
  setSelectedTicker: (ticker: string) => void;
  setPage: (page: Page) => void;
  sortedAssets: Asset[];
  groupFilter: string;
  setGroupFilter: (group: string) => void;
  groups: string[];
  sortKey: SortKey;
  setSortKey: (key: SortKey) => void;
}) {
  const { selectedTicker, setSelectedTicker, setPage, sortedAssets, groupFilter, setGroupFilter, groups, sortKey, setSortKey } = props;
  return (
    <section className="panel watchlist-panel">
      <div className="panel-header toolbar-header">
        <div>
          <span className="eyebrow">Watchlist</span>
          <h2>关注资产</h2>
        </div>
        <div className="toolbar">
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="按资产分组筛选">
            {groups.map((group) => <option key={group}>{group}</option>)}
          </select>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} aria-label="排序">
            <option value="score">按机会分</option>
            <option value="risk">按风险</option>
            <option value="change">按涨跌</option>
            <option value="volume">按量能</option>
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>资产</th>
              <th>主题</th>
              <th>状态</th>
              <th>价格</th>
              <th>涨跌</th>
              <th>趋势</th>
              <th>量能</th>
              <th>风险/指标</th>
              <th>机会分</th>
            </tr>
          </thead>
          <tbody>
            {sortedAssets.map((asset) => (
              <tr
                className={cx(selectedTicker === asset.ticker && "selected-row")}
                key={asset.ticker}
                onClick={() => {
                  setSelectedTicker(asset.ticker);
                  setPage("stocks");
                }}
              >
                <td><strong>{asset.ticker}</strong><span>{asset.name}</span></td>
                <td>{asset.theme}</td>
                <td><span className="status-chip">{asset.status}</span></td>
                <td>{formatPrice(asset.price)}</td>
                <td className={(asset.dailyChange ?? 0) >= 0 ? "positive" : "negative"}>{formatChange(asset.dailyChange)}</td>
                <td>{asset.trend}</td>
                <td>{typeof asset.volumeRatio === "number" ? `${asset.volumeRatio.toFixed(1)}x` : "未更新"}</td>
                <td><RiskPill risk={asset.riskLevel} /><SignalChips signals={asset.signals} limit={2} /></td>
                <td><ScoreBar score={asset.score} risk={asset.riskLevel} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  return (
    <section className="panel alerts-panel">
      <div className="panel-header"><div><span className="eyebrow">Alerts</span><h2>今日预警</h2></div></div>
      <div className="alert-list">
        {alerts.length === 0 && <p className="empty-state">暂无真实预警；完成首次更新后由 API 生成。</p>}
        {alerts.map((alert) => (
          <article className={cx("alert-item", alert.level)} key={`${alert.ticker}-${alert.title}`}>
            <div><span>{alertLabel[alert.level]} · {alert.timestamp}</span><strong>{alert.ticker} · {alert.title}</strong></div>
            <p>{alert.reason}</p>
            <em>{alert.action}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function ThemeHeat({ themes }: { themes: DashboardData["themeHeat"] }) {
  return (
    <section className="panel theme-panel">
      <div className="panel-header"><div><span className="eyebrow">Theme Heat</span><h2>主题链条</h2></div></div>
      <div className="heat-list">
        {themes.map((theme) => (
          <div className="heat-row" key={theme.name}>
            <div><strong>{theme.name}</strong><span className={theme.change >= 0 ? "positive" : "negative"}>{formatChange(theme.change)}</span></div>
            <div className="heat-track"><span style={{ width: `${Math.max(0, Math.min(100, theme.value))}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RiskSignalBoard({ assets }: { assets: Asset[] }) {
  const signalItems = assets.flatMap((asset) => asset.signals.map((signal) => ({ asset, signal }))).slice(0, 6);
  return (
    <section className="panel workflow-panel">
      <div className="panel-header"><div><span className="eyebrow">Dynamic Indicators</span><h2>动态监控指标</h2></div></div>
      <div className="signal-list">
        {signalItems.length === 0 && <p className="empty-state">暂无真实指标；完成首次更新后显示指标、当前值和参考区间。</p>}
        {signalItems.map(({ asset, signal }) => (
          <article className={cx("signal-item", signal.tone)} key={`${asset.ticker}-${signal.label}`}>
            <div><strong>{asset.ticker}</strong><span>{signal.label}</span></div>
            <dl className="signal-brief">
              <div><dt>指标</dt><dd>{signal.metric}</dd></div>
              <div><dt>当前</dt><dd>{signal.current}</dd></div>
              <div><dt>参考</dt><dd>{signal.referenceRange}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function PortfolioRiskMini({ risk }: { risk?: DashboardData["risk"] }) {
  return (
    <section className="panel risk-mini-panel">
      <div className="panel-header"><div><span className="eyebrow">Portfolio Risk</span><h2>组合风险</h2></div></div>
      <div className="risk-metrics">
        <RiskGauge label="行业集中" value={risk?.sectorConcentration ?? 0} suffix="%" />
        <RiskGauge label="单票上限" value={risk?.singleNameExposure ?? 0} suffix="%" />
        <RiskGauge label="现金比例" value={risk?.cashRatio ?? 0} suffix="%" />
        <RiskGauge label="Beta" value={risk?.portfolioBeta ?? 0} suffix="" max={2} />
      </div>
    </section>
  );
}

function StocksPage(props: {
  selectedAsset: Asset;
  setSelectedTicker: (ticker: string) => void;
  sortedAssets: Asset[];
  groupFilter: string;
  setGroupFilter: (group: string) => void;
  groups: string[];
  sortKey: SortKey;
  setSortKey: (key: SortKey) => void;
}) {
  const asset = props.selectedAsset;
  return (
    <section className="stocks-layout">
      <WatchlistTable {...props} selectedTicker={asset.ticker} setPage={() => undefined} />
      <section className="panel detail-panel">
        <div className="asset-hero">
          <div>
            <span className="eyebrow">{asset.group} · {asset.theme}</span>
            <h2>{asset.ticker} · {asset.name}</h2>
            <p>{asset.insight}</p>
          </div>
          <div className="asset-price"><strong>{formatPrice(asset.price)}</strong><span>{asset.asOf ?? "未更新"}</span></div>
        </div>
        <div className="detail-grid">
          <DetailBlock title="价格行为" items={[
            ["趋势", asset.trend],
            ["1日", formatChange(asset.dailyChange)],
            ["5日", formatChange(asset.fiveDayChange)],
            ["20日", formatChange(asset.twentyDayChange)],
            ["量能", typeof asset.volumeRatio === "number" ? `${asset.volumeRatio.toFixed(1)}x` : "未更新"]
          ]} />
          <DetailBlock title="数据状态" items={[
            ["来源", asset.hasData ? "SQLite / Massive API" : "等待首次更新"],
            ["风险灯", riskLabel[asset.riskLevel]],
            ["说明", asset.riskNote]
          ]} />
        </div>
        <IndicatorPanel asset={asset} />
        <div className="score-grid">
          <div className="score-card"><span>机会分</span><strong>{asset.score ?? "未更新"}</strong><div className="mini-track"><span style={{ width: `${asset.score ?? 0}%` }} /></div></div>
          <div className="score-card"><span>相对强弱</span><strong>{asset.relativeStrength}</strong></div>
          <div className="score-card"><span>下一关注</span><strong>{asset.nextCatalyst}</strong></div>
          <div className="score-card"><span>数据日期</span><strong>{asset.asOf ?? "未更新"}</strong></div>
        </div>
      </section>
    </section>
  );
}

function IndicatorPanel({ asset }: { asset: Asset }) {
  return (
    <section className="risk-signal-panel">
      <div className="risk-signal-header"><div><span className="eyebrow">API Derived</span><h3>动态监控指标</h3></div><RiskPill risk={asset.riskLevel} /></div>
      {asset.signals.length === 0 ? <p className="empty-state">当前没有真实派生指标；完成首次更新或新闻/filings 入库后显示。</p> : (
        <div className="risk-signal-grid">
          {asset.signals.map((signal) => (
            <article className={cx("risk-signal-card", signal.tone)} key={signal.label}>
              <strong>{signal.label}</strong>
              <dl className="indicator-list">
                <div><dt>关注指标</dt><dd>{signal.metric}</dd></div>
                <div><dt>当前状态</dt><dd>{signal.current}</dd></div>
                <div><dt>如何关注</dt><dd>{signal.howToWatch}</dd></div>
                <div><dt>Reference range</dt><dd>{signal.referenceRange}</dd></div>
                <div><dt>频率 / 来源</dt><dd>{signal.cadence} · {signal.source}</dd></div>
              </dl>
              <span className="signal-evidence">触发描述：{signal.evidence}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EventsPage({ events, setSelectedTicker, setPage }: { events: MarketEvent[]; setSelectedTicker: (ticker: string) => void; setPage: (page: Page) => void }) {
  return (
    <section className="panel events-panel">
      <div className="panel-header"><div><span className="eyebrow">Calendar</span><h2>事件日历</h2></div></div>
      <div className="event-list">
        {events.length === 0 && <p className="empty-state">暂无真实事件；news/filings 入库后自动生成。</p>}
        {events.map((event) => (
          <button className={cx("event-item", event.importance)} key={`${event.date}-${event.ticker}-${event.description}`} onClick={() => { setSelectedTicker(event.ticker); setPage("stocks"); }}>
            <span>{event.date}</span><strong>{event.ticker} · {event.type}</strong><p>{event.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function RiskPage({ assets, risk, setSelectedTicker, setPage }: { assets: Asset[]; risk?: DashboardData["risk"]; setSelectedTicker: (ticker: string) => void; setPage: (page: Page) => void }) {
  const redAssets = assets.filter((asset) => asset.riskLevel === "red");
  const yellowAssets = assets.filter((asset) => asset.riskLevel === "yellow");
  const groupExposure = Array.from(new Set(assets.map((asset) => asset.group))).map((group) => {
    const groupAssets = assets.filter((asset) => asset.group === group);
    const avgScore = groupAssets.reduce((sum, asset) => sum + (asset.score || 0), 0) / Math.max(1, groupAssets.length);
    return { group, count: groupAssets.length, avgScore };
  });

  return (
    <section className="risk-layout">
      <PortfolioRiskMini risk={risk} />
      <section className="panel">
        <div className="panel-header"><div><span className="eyebrow">Exposure</span><h2>分组暴露</h2></div></div>
        <div className="exposure-list">
          {groupExposure.map((item) => (
            <div className="exposure-row" key={item.group}>
              <div><strong>{item.group}</strong><span>{item.count} 个资产 · 平均分 {item.avgScore.toFixed(0)}</span></div>
              <div className="heat-track"><span style={{ width: `${item.avgScore}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><div><span className="eyebrow">Risk First</span><h2>红黄灯资产</h2></div></div>
        <div className="risk-list">
          {[...redAssets, ...yellowAssets].map((asset) => (
            <button className="risk-asset" key={asset.ticker} onClick={() => { setSelectedTicker(asset.ticker); setPage("stocks"); }}>
              <RiskPill risk={asset.riskLevel} /><strong>{asset.ticker}</strong><span>{asset.riskNote}<SignalChips signals={asset.signals} limit={3} /></span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel risk-notes">
        <div className="panel-header"><div><span className="eyebrow">Rules</span><h2>风险约束</h2></div></div>
        {(risk?.notes ?? []).map((note) => <p key={note}>{note}</p>)}
      </section>
    </section>
  );
}

function SignalChips({ signals, limit }: { signals: Asset["signals"]; limit?: number }) {
  const visibleSignals = typeof limit === "number" ? signals.slice(0, limit) : signals;
  if (visibleSignals.length === 0) return null;
  return <div className="signal-chips">{visibleSignals.map((signal) => <span className={cx("signal-chip", signal.tone)} key={signal.label}>{signal.label}</span>)}</div>;
}

function DetailBlock({ title, items }: { title: string; items: Array<[string, string]> }) {
  return <article className="detail-block"><h3>{title}</h3><dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>;
}

function RiskPill({ risk }: { risk: RiskLevel }) {
  return <span className={cx("risk-pill", risk)}>{riskLabel[risk]}</span>;
}

function ScoreBar({ score, risk }: { score: number | null | undefined; risk: RiskLevel }) {
  return <div className="score-bar"><strong>{score ?? "-"}</strong><span className={risk} style={{ width: `${score ?? 0}%` }} /></div>;
}

function RiskGauge({ label, value, suffix, max = 100 }: { label: string; value: number; suffix: string; max?: number }) {
  const width = Math.min((value / max) * 100, 100);
  return <div className="risk-gauge"><div><span>{label}</span><strong>{value}{suffix}</strong></div><div className="heat-track"><span style={{ width: `${width}%` }} /></div></div>;
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return <section className="panel empty-panel"><h2>{title}</h2><p>{message}</p></section>;
}

function valueOrPending(value: unknown) {
  return typeof value === "number" ? value.toFixed(2) : "未更新";
}
