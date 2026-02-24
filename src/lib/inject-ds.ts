import pool, { toSqlVal } from "./db";

async function injectDeepSeekDecisions() {
  const decisions = [
    {
      symbol: "01810.HK",
      action: "HOLD",
      confidence: 85,
      reasoning: "小米当前股价（35.36 HKD）处于52周低位区间（33.32 HKD），且大幅低于您的成本价（48 CNY）。尽管PE估值（~25.2）处于合理区间，Q3 2025财报显示营收与净利强劲增长，基本面改善明显。当前卖出将锁定大幅亏损，建议持有等待市场情绪回暖及业绩兑现带来的估值修复。",
      news_summary: "Q3 2025 营收创历史新高达 1131 亿元 (+22.3% YoY)，经调整净利润 113 亿元 (+81% YoY)，显示核心业务增长强劲。"
    },
    {
      symbol: "MSFT",
      action: "HOLD",
      confidence: 90,
      reasoning: "微软当前股价（397.23 USD）较52周高点（555.45 USD）回撤明显，PE（~34.8）处于历史中高位但不仅是科技股常态。根据您的策略，当前日期（2月21日）非季度末（3/6/9/12月25日后），因此不执行买入操作。考虑到公司长期护城河及目前的盈利浮盈（成本200 USD），建议继续持有。",
      news_summary: "无重大负面突发新闻，股价波动主要随科技板块整体调整及宏观利率环境影响。"
    }
  ];

  for (const d of decisions) {
    await pool.query(
      `INSERT INTO "st-decisions" (symbol, action, confidence, reasoning, news_summary, market_data) VALUES (${toSqlVal(d.symbol)}, ${toSqlVal(d.action)}, ${toSqlVal(d.confidence)}, ${toSqlVal(d.reasoning)}, ${toSqlVal(d.news_summary)}, ${toSqlVal(JSON.stringify({ source: "deepseek-v3.2" }))})`
    );
  }
  process.exit(0);
}

injectDeepSeekDecisions();
