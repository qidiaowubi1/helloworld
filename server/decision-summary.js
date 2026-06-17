export function buildDecisionSummary(assets = [], snapshot = {}) {
  const spcx = assets.find((asset) => asset.ticker === "SPCX") || assets[0];
  if (!spcx) return null;

  const relatedTickers = new Set(["RDW", "RKLB", "ASTS", "IRDM", "VSAT", "LHX", "HWM"]);
  const related = assets.filter((asset) => relatedTickers.has(asset.ticker));
  const triggers = buildTriggerChecklist(spcx, snapshot, related);
  const hardTriggered = triggers.filter((trigger) => trigger.status === "triggered");
  const watchTriggers = triggers.filter((trigger) => trigger.status === "watch");

  const priceChange = numberOrZero(spcx.dailyChange);
  const twentyDayChange = numberOrZero(spcx.twentyDayChange);
  const volumeRatio = numberOrNull(spcx.volumeRatio);
  const redRelated = related.filter((asset) => asset.riskLevel === "red");
  const yellowRelated = related.filter((asset) => asset.riskLevel === "yellow");
  const vix = numberOrNull(snapshot?.vix);
  const tenYear = numberOrNull(snapshot?.ten_year_yield);
  const macroOk = (vix == null || vix < 19) && (tenYear == null || tenYear < 4.6);
  const volumeWeak = volumeRatio != null && volumeRatio < 0.4;
  const ecosystemWeak = redRelated.length >= 2 || redRelated.length + yellowRelated.length >= 4;
  const priceStrong = priceChange >= 10 || twentyDayChange >= 15;
  const newsSignal = spcx.signals?.find((signal) =>
    /news|headline|SpaceX|Starlink|Starship|消息|新闻|热点/i.test(`${signal.label} ${signal.metric}`)
  );

  let tone = "green";
  let title = "观察为主，等待硬催化";
  let action = "保持观察，不因单条热点新闻主动升级。";

  if (hardTriggered.length || ecosystemWeak || (priceStrong && volumeWeak)) {
    tone = "yellow";
    title = "强叙事，确认仍不完整";
    action = "不追高；已有仓位以观察为主，等量能和生态代理确认。";
  }

  if (hardTriggered.length >= 2 || (priceChange < -5 && (volumeRatio ?? 0) > 1.5)) {
    tone = "red";
    title = "风险优先，暂停追高";
    action = "暂停新增风险，先确认是否是假突破或消息兑现失败。";
  }

  if (priceStrong && !volumeWeak && !ecosystemWeak && macroOk && hardTriggered.length === 0) {
    tone = "green";
    title = "价格与环境共振";
    action = "可升级为核心观察，但仍需等待可验证催化延续。";
  }

  const thesisParts = [
    priceStrong ? "价格确认偏强" : priceChange > 3 ? "价格开始转强" : "价格尚未给出强确认",
    volumeWeak ? "量能/换手不足" : "量能未触发衰减警报",
    ecosystemWeak ? "生态代理没有同步确认" : "生态代理压力可控",
    macroOk ? "宏观环境未触发降级" : "宏观环境需要防守"
  ];

  return {
    tone,
    title,
    action,
    thesis: `${thesisParts.join("；")}。当前结论由价格、量能、SpaceX生态代理、宏观和消息面共同推导，随每次 batch 数据更新重新计算。`,
    reasons: [
      `SPCX 当前 ${formatPrice(spcx.price)}，日内 ${formatChange(spcx.dailyChange)}，20日 ${formatChange(spcx.twentyDayChange)}。`,
      `量能 ${volumeRatio == null ? "未更新" : `${volumeRatio.toFixed(1)}x 20日均量`}；${volumeWeak ? "低于正常换手区间，需要防止价格信号失真。" : "暂未触发换手衰减警报。"}`,
      `SpaceX生态代理：${redRelated.length} 个红灯，${yellowRelated.length} 个黄灯。`,
      newsSignal ? `消息面：${newsSignal.current}` : "消息面：等待可验证催化，不把普通热度当作确认。"
    ],
    watch: [
      { label: "价格确认", value: formatChange(spcx.dailyChange), state: priceChange >= 10 ? "green" : priceChange < -3 ? "red" : "yellow" },
      { label: "量能/换手", value: volumeRatio == null ? "未更新" : `${volumeRatio.toFixed(1)}x`, state: volumeWeak || (volumeRatio ?? 0) > 2 ? "yellow" : "green" },
      { label: "生态代理", value: `${redRelated.length}红 / ${yellowRelated.length}黄`, state: ecosystemWeak ? "yellow" : "green" },
      { label: "宏观", value: `VIX ${vix == null ? "-" : vix.toFixed(1)} / 10Y ${tenYear == null ? "-" : `${tenYear.toFixed(2)}%`}`, state: macroOk ? "green" : "yellow" },
      { label: "风险触发", value: `${hardTriggered.length} 已触发 / ${watchTriggers.length} 需观察`, state: hardTriggered.length ? "red" : watchTriggers.length ? "yellow" : "green" }
    ],
    upgrade: [
      "SPCX 不快速回落，并能站稳日内关键区间。",
      "量能回到 0.7-1.5x，或放量上涨但不放量回落。",
      "RDW/RKLB/ASTS 至少两个同步转强。",
      "新闻从普通热度升级为发射、监管、合同、Starlink数据或二级估值确认。"
    ],
    downgrade: [
      "SPCX 放量回落，或跌破近5日关键低点。",
      "量能持续低于 0.4x 且价格高位滞涨。",
      "SpaceX生态代理红灯扩大到2个以上并持续。",
      "出现 FAA/FCC 延迟、发射事故、估值下修或二级交易折价扩大。"
    ],
    triggers
  };
}

export function buildTriggerChecklist(spcx, snapshot = {}, related = []) {
  const vix = numberOrNull(snapshot?.vix);
  const tenYear = numberOrNull(snapshot?.ten_year_yield);
  const redRelatedCount = related.filter((asset) => asset.riskLevel === "red").length;
  const yellowRelatedCount = related.filter((asset) => asset.riskLevel === "yellow").length;
  const volumeRatio = numberOrNull(spcx?.volumeRatio);
  const dailyChange = numberOrNull(spcx?.dailyChange);
  const signals = Array.isArray(spcx?.signals) ? spcx.signals : [];

  return [
    {
      label: "大盘风险",
      current: `VIX ${vix == null ? "未更新" : vix.toFixed(1)} / 10Y ${tenYear == null ? "未更新" : `${tenYear.toFixed(2)}%`}`,
      threshold: "VIX > 22 或 10Y > 4.8% 才算触发",
      status: vix != null && tenYear != null && (vix > 22 || tenYear > 4.8) ? "triggered" : vix != null && tenYear != null && (vix > 19 || tenYear > 4.6) ? "watch" : "clear",
      note: "这是宏观降级条件；未触发时只是每日背景监控，不代表已经看空。"
    },
    {
      label: "SpaceX生态代理",
      current: `${redRelatedCount} 只红灯 / ${yellowRelatedCount} 只黄灯`,
      threshold: "RDW、RKLB、ASTS、IRDM、VSAT、LHX、HWM 中 2 只以上红灯才触发",
      status: redRelatedCount >= 2 ? "triggered" : redRelatedCount === 1 || yellowRelatedCount >= 3 ? "watch" : "clear",
      note: "这是产业链确认项；代理股同步走弱时，说明叙事没有被资金面确认。"
    },
    {
      label: "SPCX量能/换手",
      current: volumeRatio == null ? "未更新" : `${volumeRatio.toFixed(1)}x 20日均量`,
      threshold: "0.7-1.5x 正常；>2x 异动；>5x 过热；连续低于首日40% 算衰减确认",
      status: volumeRatio == null ? "watch" : volumeRatio > 2 || volumeRatio < 0.4 ? "watch" : "clear",
      note: "这是每天最该看的资金面指标；放量不涨、缩量破位或高位换手衰减都要降级观察。"
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
      current: spcx?.nextCatalyst || "等待新闻",
      threshold: "FAA/FCC/NASA/国防合同/Starlink数据/Starship发射窗口进入关键节点",
      status: signals.some((signal) => signal.tone === "red") ? "triggered" : signals.some((signal) => signal.tone === "yellow") ? "watch" : "clear",
      note: "普通新闻只记录；可验证催化才升级，事故或监管延迟才降级。"
    }
  ];
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function formatChange(value) {
  const number = numberOrNull(value);
  if (number == null) return "未更新";
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function formatPrice(value) {
  const number = numberOrNull(value);
  if (number == null) return "未更新";
  return `$${number.toFixed(2)}`;
}
