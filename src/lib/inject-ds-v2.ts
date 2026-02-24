import pool, { toSqlVal } from "./db";

async function injectDeepSeekDecisions() {
  const decisions = [
    {
      symbol: "01810.HK",
      action: "BUY",
      confidence: 85,
      reasoning: "当前股价接近52周低点33.32 HKD，估值具有吸引力；市盈率25.5，考虑到公司强劲的盈利增长（第三季度营收创纪录，调整后净利润同比增长81%）以及电动车发布等积极新闻，预计未来有上涨空间。",
      news_summary: "Q3 2025 营收创历史新高达 1131 亿元 (+22.3% YoY)，经调整净利润 113 亿元 (+81% YoY)；小米发布新款电动车，销量强劲。"
    },
    {
      symbol: "MSFT",
      action: "HOLD",
      confidence: 75,
      reasoning: "当前股价397.23美元，处于52周区间344.79-555.45美元的中下部，市盈率34.8，符合科技巨头估值。近期微软在AI领域持续投资，利好公司长期前景。根据投资策略，目前非季末买入窗口，且无强烈卖出信号，建议持有。",
      news_summary: "微软宣布在 Office 365 中推出新的 AI 功能；计划向 AI 初创公司投资 15 亿美元；分析师讨论微软和苹果是否存在潜在泡沫。"
    }
  ];

  for (const d of decisions) {
    await pool.query(
      `INSERT INTO "st-decisions" (symbol, action, confidence, reasoning, news_summary, market_data) VALUES (${toSqlVal(d.symbol)}, ${toSqlVal(d.action)}, ${toSqlVal(d.confidence)}, ${toSqlVal(d.reasoning)}, ${toSqlVal(d.news_summary)}, ${toSqlVal(JSON.stringify({ source: "deepseek-v3.2-full-analysis" }))})`
    );
  }
  process.exit(0);
}

injectDeepSeekDecisions();
