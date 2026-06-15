const signalRules = [
  {
    keywords: ["IPO", "new listing", "volume", "turnover", "换手", "成交量"],
    label: "换手衰减",
    tone: "yellow",
    metric: "成交量倍数 / 换手率",
    howToWatch: "观察成交量/换手率是否从首日高位快速回落，并对照价格是否跌破关键区间。",
    referenceRange: "正常: 0.7-1.5x；异动: >2x；新股过热: >5x；衰减确认: 连续3日低于首日40%。",
    cadence: "盘前、盘中、盘后各看一次",
    source: "行情成交量、流通股本、20日均量"
  },
  {
    keywords: ["lockup", "insider", "Form 4", "Form 3", "内部人", "锁定期"],
    label: "锁定期风险",
    tone: "red",
    metric: "锁定期天数 / 潜在解禁比例",
    howToWatch: "记录锁定期结束日、可流通股比例变化、内部人或早期投资者减持公告。",
    referenceRange: "低: <5%新增流通；中: 5-15%；高: >15%或核心持有人减持。",
    cadence: "每日检查事件日历，临近T-30/T-7/T-1重点复盘",
    source: "招股书、SEC/交易所公告、13F/内部人披露"
  },
  {
    keywords: ["valuation", "EV/Sales", "P/E", "FCF", "估值", "溢价"],
    label: "估值压力",
    tone: "red",
    metric: "EV/Sales、Forward P/E、FCF Yield",
    howToWatch: "把当前估值同时对比自身历史区间、同业均值和未来12个月增速预期。",
    referenceRange: "绿: 低于同业中位且增速不降；黄: 高于同业25-50%；红: 高于同业>50%且增速/量能走弱。",
    cadence: "每日价格更新；财报/指引后重算",
    source: "财报、分析师一致预期、同业估值表"
  },
  {
    keywords: ["FAA", "FCC", "SEC", "regulation", "antitrust", "监管", "出口限制"],
    label: "监管/政策",
    tone: "red",
    metric: "监管事件等级 / 审批延迟天数",
    howToWatch: "区分普通噪声、正式调查、许可延迟、限制令或诉讼升级。",
    referenceRange: "绿: 无正式程序；黄: 问询/听证；红: 调查、延迟>30天、限制令、重大诉讼。",
    cadence: "每日新闻/公告扫描，事件当天即时更新",
    source: "SEC、FAA、FCC、司法部、交易所公告、公司8-K"
  },
  {
    keywords: ["capex", "capital expenditure", "infrastructure", "AI infrastructure", "资本开支"],
    label: "Capex压力",
    tone: "yellow",
    metric: "Capex增速 / 云收入增速 / FCF Margin",
    howToWatch: "确认资本开支上修是否伴随云收入、订单、利用率或利润率同步改善。",
    referenceRange: "绿: 收入增速≥capex增速；黄: capex快于收入10-30pct；红: 快于>30pct且FCF margin下滑。",
    cadence: "财报季重点更新，平时跟踪管理层口径",
    source: "10-Q/10-K、财报电话会、公司指引"
  },
  {
    keywords: ["supply", "order", "HBM", "CoWoS", "capacity", "供应链", "订单", "产能"],
    label: "供应链验证",
    tone: "yellow",
    metric: "上游订单 / 产能利用率 / 交期",
    howToWatch: "检查主公司上涨是否被关键供应商、产能、订单和交期同步确认。",
    referenceRange: "绿: 主公司和2个以上关键供应商同向；黄: 供应链背离1-2周；红: 供应商先跌且订单/交期转弱。",
    cadence: "每周复盘，月营收/财报日重点更新",
    source: "供应商月营收、财报订单、行业价格、交期数据"
  },
  {
    keywords: ["delivery", "margin", "Robotaxi", "FSD", "交付", "毛利率"],
    label: "交付/毛利事件",
    tone: "red",
    metric: "交付量、ASP、汽车毛利率、FSD/Robotaxi节点",
    howToWatch: "先看交付是否达预期，再看价格战是否侵蚀毛利率，最后验证FSD/Robotaxi是否带来新收入。",
    referenceRange: "绿: 交付和毛利率均高于预期；黄: 只达成其一；红: 交付不及预期且毛利率下滑。",
    cadence: "月度/季度数据日即时更新",
    source: "公司交付公告、财报、监管文件"
  },
  {
    keywords: ["financing", "cash", "runway", "商业化", "融资", "小盘", "高波动"],
    label: "高波动融资",
    tone: "red",
    metric: "现金 runway / 融资需求 / 事件兑现率",
    howToWatch: "判断是否需要再融资，以及事件兑现能否覆盖现金消耗。",
    referenceRange: "绿: runway>18个月；黄: 12-18个月；红: <12个月或股价依赖单一事件。",
    cadence: "财报后更新，融资公告即时更新",
    source: "资产负债表、现金流量表、融资公告"
  }
];

export function buildSignals(asset, context) {
  const text = [
    asset.theme,
    asset.status,
    context.newsText || "",
    context.filingText || "",
    context.eventText || ""
  ].join(" ");

  const signals = signalRules
    .filter((rule) => rule.keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase())))
    .map((rule) => ({
      label: rule.label,
      tone: rule.tone,
      metric: rule.metric,
      current: currentFor(rule.label, context),
      howToWatch: rule.howToWatch,
      referenceRange: rule.referenceRange,
      cadence: rule.cadence,
      source: rule.source,
      evidence: context.evidence || "由最新行情、新闻、filings 或事件文本触发。"
    }));

  if (!signals.length && context.volumeRatio > 2) {
    signals.push({
      ...signalRules[0],
      current: currentFor("换手衰减", context),
      evidence: "成交量倍数超过 2x。"
    });
  }

  if (asset.ticker === "SPCX") addSpcxSignals(signals, context);
  if (asset.ticker === "RDW") addRdwSignals(signals, context);

  return signals;
}

function addSpcxSignals(signals, context) {
  for (const signal of signals) {
    if (String(signal.label).includes("估值")) {
      signal.tone = "yellow";
      signal.current = "估值争议升温，等待收入/Starlink/Starship 数据验证";
    }
  }
  const latestNews = context.latestEvent || "等待最新 SpaceX / Starlink / Starship 新闻入库";
  if (!signals.some((signal) => signal.label === "SpaceX 热点新闻")) {
    signals.unshift({
      label: "SpaceX 热点新闻",
      tone: "yellow",
      metric: "发射 / Starship / Starlink / 融资估值 / 监管事件",
      current: latestNews,
      howToWatch: "每天看是否出现发射窗口、FAA/FCC/国防合同、Starlink用户与估值/二级交易新闻；把新闻分成普通曝光、可验证催化和风险事件。",
      referenceRange: "绿: 普通运营更新；黄: 发射/监管/融资/合同进入关键节点；红: 发射失败、监管延迟、重大事故或估值交易显著降温。",
      cadence: "每日更新；发射/监管窗口期盘前和盘后各检查一次",
      source: "Google News RSS fallback；配置 MASSIVE_API_KEY 后叠加 provider news/filings",
      evidence: latestNews
    });
  }

  if (!signals.some((signal) => signal.label === "换手/量能监控" || signal.label === "换手衰减")) {
    signals.push({
      label: "换手/量能监控",
      tone: context.volumeRatio > 2 ? "yellow" : "green",
      metric: "成交量倍数 / 换手率 / 20日均量",
      current: `${context.volumeRatio.toFixed(1)}x 成交量倍数`,
      howToWatch: "继续看成交量是否从事件高点衰减，若价格横盘但量能持续高于 2x，说明资金仍在博弈；若跌破关键价格且量能放大，优先降级风险。",
      referenceRange: "正常: 0.7-1.5x；异动: >2x；新股/事件过热: >5x；衰减确认: 连续3日低于事件首日40%。",
      cadence: "每日更新；事件窗口盘中复查",
      source: "Yahoo chart fallback 日线成交量；后续可接入实时成交额/流通股本",
      evidence: `当前成交量约为20日均量的 ${context.volumeRatio.toFixed(1)}x。`
    });
  }

  if (!signals.some((signal) => signal.label === "锁定期/流动性风险")) {
    signals.push({
      label: "锁定期/流动性风险",
      tone: "yellow",
      metric: "二级交易流动性 / 可交易供给 / 估值折价",
      current: "等待 filings/二级交易数据确认",
      howToWatch: "SpaceX 未上市，重点不是普通股票 lock-up，而是二级市场供给、员工/早期投资人出售窗口、估值 tender offer 和代理标的流动性。",
      referenceRange: "绿: 供给稳定且估值成交活跃；黄: 二级报价分歧扩大或供给增加；红: tender offer 估值下修、交易折价扩大或监管限制。",
      cadence: "每周复盘；出现融资/二级交易新闻时即时更新",
      source: "新闻、公司公告、二级市场报道；配置 MASSIVE_API_KEY 后叠加 filings/insider 数据",
      evidence: "SPCX 作为 SpaceX 观察代理，需要持续保留流动性和估值供给监控。"
    });
  }
}

function addRdwSignals(signals, context) {
  const latestNews = context.latestEvent || "等待 Redwire / SpaceX / NASA 相关新闻入库";
  const text = `${context.newsText || ""} ${context.eventText || ""}`.toLowerCase();
  const cooperationHit = ["spacex", "starship", "dragon", "falcon", "rideshare", "payload"].some((word) => text.includes(word));

  signals.unshift({
    label: "SpaceX 合作线索",
    tone: cooperationHit ? "yellow" : "green",
    metric: "Redwire + SpaceX/Starship/Dragon/Falcon/载荷 共同出现",
    current: cooperationHit ? latestNews : "暂无直接 SpaceX 同框新闻",
    howToWatch: "每天检查 Redwire 新闻是否和 SpaceX、Starship、Dragon、Falcon、rideshare、payload integration、NASA commercial space 同时出现；同框但无合同先记黄灯，出现合同/任务/发射清单再升级。",
    referenceRange: "绿: 只有普通 Redwire/NASA 新闻；黄: 新闻中出现 SpaceX/Starship/Dragon/载荷同框；红: 合作落空、合同延期、发射失败或任务取消。",
    cadence: "每日新闻扫描；发射/合同窗口即时复查",
    source: "Google News RSS fallback；后续可叠加 SEC filings、NASA award、launch manifest",
    evidence: latestNews
  });

  signals.push({
    label: "载荷/任务蛛丝马迹",
    tone: text.includes("payload") || text.includes("mission") || text.includes("manifest") ? "yellow" : "green",
    metric: "payload / mission / launch manifest / integration",
    current: latestNews,
    howToWatch: "重点找 Redwire 硬件、太阳能阵列、空间制造、导航/传感器、空间基础设施是否进入某次 SpaceX 发射或 NASA 商业任务载荷清单。",
    referenceRange: "绿: 无任务映射；黄: 出现 payload/mission/integration 字样；红: 任务推迟、载荷取消、客户延期。",
    cadence: "每日；NASA/SpaceX 发射清单更新时即时复查",
    source: "新闻、NASA award、SpaceX launch manifest、公司公告",
    evidence: latestNews
  });

  signals.push({
    label: "订单/融资压力",
    tone: context.twentyDayChange < -12 || context.volumeRatio > 2 ? "yellow" : "green",
    metric: "20日涨跌 / 成交量倍数 / backlog 新闻",
    current: `${context.twentyDayChange.toFixed(1)}% 20日涨跌，${context.volumeRatio.toFixed(1)}x 量能`,
    howToWatch: "小盘太空股容易被单一订单和融资预期驱动；如果新闻热但股价不跟，或量能放大下跌，要优先怀疑融资/订单兑现压力。",
    referenceRange: "绿: 20日跌幅>-8%且量能0.7-1.5x；黄: 跌幅<-12%或量能>2x；红: 融资稀释、订单取消、现金 runway 低于12个月。",
    cadence: "每日价格量能；财报/融资公告即时更新",
    source: "Yahoo chart fallback、公司财报、融资公告",
    evidence: `RDW 当前 ${context.twentyDayChange.toFixed(1)}% / ${context.volumeRatio.toFixed(1)}x。`
  });
}

function currentFor(label, context) {
  if (label === "换手衰减") return `${context.volumeRatio.toFixed(1)}x 成交量倍数`;
  if (label === "估值压力") return "等待基本面/估值 provider 补充";
  if (label === "供应链验证") return context.relativeStrength;
  if (label === "Capex压力") return "等待财报/指引文本确认";
  if (label === "监管/政策") return context.latestEvent || "待事件确认";
  if (label === "锁定期风险") return context.latestFiling || "待 filings/招股书确认";
  if (label === "交付/毛利事件") return context.latestEvent || "待交付/财报数据确认";
  if (label === "高波动融资") return `${context.twentyDayChange.toFixed(1)}% 20日涨跌`;
  return context.latestEvent || "待数据确认";
}

export function deriveMetrics(asset, quotes, newsItems = [], filings = [], events = []) {
  const sorted = [...quotes].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  if (!latest) return null;

  const prev = sorted.at(-2);
  const fiveAgo = sorted.length >= 6 ? sorted.at(-6) : undefined;
  const twentyAgo = sorted.length >= 21 ? sorted.at(-21) : undefined;
  const avg20Volume = average(sorted.slice(-21, -1).map((quote) => quote.volume).filter(Number.isFinite));
  const volumeRatio = avg20Volume ? latest.volume / avg20Volume : 1;
  const dailyChange = prev?.close ? percent(latest.close, prev.close) : 0;
  const fiveDayChange = fiveAgo?.close ? percent(latest.close, fiveAgo.close) : dailyChange;
  const twentyDayChange = twentyAgo?.close ? percent(latest.close, twentyAgo.close) : fiveDayChange;
  const trend = deriveTrend(latest.close, sorted);
  const relativeStrength = deriveRelativeStrength(twentyDayChange);
  let riskLevel = volumeRatio > 5 || twentyDayChange < -12 ? "red" : volumeRatio > 2 || Math.abs(twentyDayChange) > 8 ? "yellow" : "green";
  const newsText = newsItems.map((item) => `${item.title} ${item.summary || ""}`).join(" ");
  const filingText = filings.map((item) => `${item.form_type} ${item.description || ""}`).join(" ");
  const eventText = events.map((item) => item.description).join(" ");
  const latestEvent = events[0]?.description || newsItems[0]?.title || "";
  const latestFiling = filings[0]?.description || filings[0]?.form_type || "";
  const signals = buildSignals(asset, {
    volumeRatio,
    relativeStrength,
    twentyDayChange,
    newsText,
    filingText,
    eventText,
    latestEvent,
    latestFiling,
    evidence: newsItems[0]?.title || events[0]?.description || latestFiling || ""
  });
  riskLevel = strongerRisk(riskLevel, signals);
  const score = calculateOpportunityScore(asset, {
    volumeRatio,
    twentyDayChange,
    trend,
    relativeStrength,
    signals,
    newsText
  });

  return {
    ticker: asset.ticker,
    asOf: latest.date,
    score,
    riskLevel,
    trend,
    volumeRatio,
    relativeStrength,
    dailyChange,
    fiveDayChange,
    twentyDayChange,
    price: latest.close,
    signals
  };
}

function strongerRisk(current, signals) {
  if (signals.some((signal) => signal.tone === "red")) return "red";
  if (current !== "red" && signals.some((signal) => signal.tone === "yellow")) return "yellow";
  return current;
}

function calculateOpportunityScore(asset, context) {
  const narrative = unifiedStrategicQualityScore(asset);
  const catalyst = unifiedCatalystScore(asset, context);
  const technical = marketConfirmationScore(context.twentyDayChange, context.trend, context.relativeStrength);
  const volume = volumeHealthScore(context.volumeRatio);
  const penalty = riskPenalty(context.signals);
  return clamp(Math.round(narrative + catalyst + technical + volume - penalty), 0, 100);
}

function unifiedStrategicQualityScore(asset) {
  const text = `${asset.group || ""} ${asset.theme || ""} ${asset.status || ""}`.toLowerCase();
  let score = 16;

  if (asset.priority <= 3) score += 8;
  else if (asset.priority <= 8) score += 6;
  else if (asset.priority <= 14) score += 4;
  else if (asset.priority <= 20) score += 3;
  else score += 2;

  if (/(核心|core)/i.test(text)) score += 6;
  else if (/(重点|重点观察|focus)/i.test(text)) score += 5;
  else if (/(事件型|event)/i.test(text)) score += 4;
  else if (/(观察|watch)/i.test(text)) score += 2;

  if (/(主资产|ai|算力|云|搜索|广告|tpu|gpu|asic|hbm|space\/ai|spacex|starlink|starship|space)/i.test(text)) score += 7;
  if (/(数据中心|电力|power|server|网络|network)/i.test(text)) score += 4;
  if (/(生态|代理|小盘|竞争)/i.test(text)) score -= 2;

  return clamp(score, 0, 40);
}

function unifiedCatalystScore(asset, context) {
  const text = `${asset.theme || ""} ${context.newsText || ""}`.toLowerCase();
  let score = 8;

  if (/(ai|cloud|search|advertising|gpu|asic|hbm|tpu|aws|robotaxi|space|云|搜索|广告|算力|芯片)/i.test(text)) score += 5;
  if (/(spacex|starlink|starship|redwire|payload|dragon|falcon)/i.test(text)) score += 4;
  if (/(ipo|contract|launch|faa|fcc|nasa|defense|tender|valuation|订单|合同|发射|监管|估值)/i.test(text)) score += 3;
  if (context.signals.length) score += Math.min(5, context.signals.length * 2);
  if (context.signals.some((signal) => signal.tone === "red")) score -= 3;

  return clamp(score, 0, 24);
}

function strategicQualityScore(asset) {
  const profiles = {
    SPCX: 40,
    NVDA: 38,
    MSFT: 37,
    GOOGL: 36,
    AMZN: 35,
    META: 33,
    TSLA: 32,
    TSM: 33,
    ASML: 33,
    AVGO: 32,
    AMD: 29,
    ARM: 28,
    MU: 27,
    CEG: 27,
    VRT: 27,
    ANET: 27,
    ETN: 25,
    DELL: 24,
    SMCI: 22,
    RDW: 24,
    RKLB: 23,
    ASTS: 22,
    IRDM: 21,
    VSAT: 18,
    LHX: 23,
    HWM: 22
  };
  if (profiles[asset.ticker]) return profiles[asset.ticker];
  if (asset.group?.includes("主资产")) return 30;
  if (asset.group?.includes("AI")) return 27;
  if (asset.group?.includes("SpaceX")) return 21;
  return 20;
}

function catalystScore(asset, context) {
  const text = `${asset.theme} ${context.newsText || ""}`.toLowerCase();
  let score = 8;
  if (/(ai|cloud|search|advertising|gpu|asic|hbm|tpu|aws|starlink|starship|spacex|robotaxi|space|云|搜索|广告|算力|芯片)/i.test(text)) score += 5;
  if (context.signals.length) score += 4;
  if (asset.ticker === "SPCX") score += 5;
  if (asset.ticker === "RDW" && text.includes("spacex")) score += 5;
  if (/(ipo|contract|launch|payload|faa|fcc|nasa|defense|tender|valuation)/i.test(text)) score += 3;
  if (context.signals.some((signal) => signal.tone === "red")) score -= 3;
  return clamp(score, 0, 24);
}

function marketConfirmationScore(change, trend, strength) {
  let score = 13;
  if (trend === "多头") score += 5;
  if (trend === "破位") score -= 4;
  if (strength === "很强") score += 5;
  else if (strength === "强") score += 3;
  else if (strength === "弱") score -= 2;
  score += clamp(change / 5, -4, 6);
  return clamp(score, 0, 24);
}

function volumeHealthScore(volumeRatio) {
  if (volumeRatio >= 0.7 && volumeRatio <= 1.5) return 15;
  if (volumeRatio > 1.5 && volumeRatio <= 2.5) return 13;
  if (volumeRatio > 2.5 && volumeRatio <= 5) return 9;
  if (volumeRatio > 5) return 5;
  if (volumeRatio >= 0.35) return 10;
  return 8;
}

function riskPenalty(signals) {
  const red = signals.filter((signal) => signal.tone === "red").length;
  const yellow = signals.filter((signal) => signal.tone === "yellow").length;
  return Math.min(15, red * 6 + yellow * 2);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function percent(current, base) {
  return ((current - base) / base) * 100;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deriveTrend(close, quotes) {
  const ma20 = average(quotes.slice(-20).map((quote) => quote.close));
  const ma50 = average(quotes.slice(-50).map((quote) => quote.close));
  if (quotes.length < 20) return "数据不足";
  if (close > ma20 && (!ma50 || ma20 > ma50)) return "多头";
  if (close < ma20 && ma50 && close < ma50) return "破位";
  return "震荡";
}

function deriveRelativeStrength(change) {
  if (change >= 10) return "很强";
  if (change >= 3) return "强";
  if (change <= -6) return "弱";
  return "中性";
}
