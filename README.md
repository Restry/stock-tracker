# Stock Tracker — AI 自动交易监控平台

基于 **Next.js 16** 的全栈 AI 自动交易监控系统，集成 DeepSeek 大模型（兼容 Azure OpenAI）进行实时决策，自动完成「行情更新 → AI 决策 → 模拟交易」的完整周期。

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 19 + Recharts + Tailwind CSS 4 |
| 后端 | Next.js App Router (API Routes) |
| 数据库 | PostgreSQL（通过 Supabase REST 端点执行 SQL） |
| AI 引擎 | DeepSeek API（兼容 Azure OpenAI 部署格式） |
| 新闻搜索 | Tavily AI Search API |
| 行情数据 | Yahoo Finance API + Google Finance 爬虫 + Tavily 兜底 |

## 核心数据流

```
Scheduler (每5分钟) / Cron / 手动触发
  → updateAllPrices()   [Yahoo v8 → Yahoo HTML → Google Finance → Tavily]
  → runDecisions()      [实时报价 → Tavily新闻 → 构建上下文 → DeepSeek AI → 规则回退]
  → executeSimulatedTrade()  [记录交易 + 更新持仓]
  → logAction()         [所有操作写入 st-logs]
```

---

## 数据库 Schema

共 8 张表，通过 `src/lib/db.ts` 中的 REST 适配器（`https://db.dora.restry.cn/pg/query`）执行原始 SQL。所有参数通过 `toSqlVal()` 客户端插值。

### `st-holdings`（持仓）

| 列 | 类型 | 说明 |
|----|------|------|
| symbol | VARCHAR(20) UNIQUE | 股票代码 (`MSFT`, `01810.HK`) |
| name | VARCHAR(100) | 公司名称 |
| shares | NUMERIC | 持有股数 |
| cost_price | NUMERIC | 成本价（本币） |
| cost_currency | VARCHAR(10) | 成本币种 |
| current_price | NUMERIC | 当前价 |
| price_currency | VARCHAR(10) | 当前价币种 |
| exchange | VARCHAR(20) | 交易所 (NASDAQ/HKEX/AUTO) |

### `st-trades`（交易记录）

| 列 | 类型 | 说明 |
|----|------|------|
| symbol | VARCHAR(20) | 股票代码 |
| action | VARCHAR(10) | BUY / SELL |
| shares | NUMERIC | 交易股数 |
| price | NUMERIC | 成交价 |
| currency | VARCHAR(10) | 币种 |
| reason | TEXT | AI 决策理由 |
| source | VARCHAR(20) | 来源 (ai / manual) |

### `st-decisions`（AI 决策记录）

| 列 | 类型 | 说明 |
|----|------|------|
| symbol | VARCHAR(20) | 股票代码 |
| action | VARCHAR(10) | BUY / SELL / HOLD |
| confidence | NUMERIC | 信心度 0–100 |
| reasoning | TEXT | 决策理由 |
| market_data | JSONB | 完整上下文快照 |
| news_summary | TEXT | 新闻摘要 |

### `st-price-history`（价格历史）

| 列 | 类型 | 说明 |
|----|------|------|
| symbol | VARCHAR(20) | 股票代码 |
| price / currency / change / change_percent | NUMERIC | 价格相关 |
| pe_ratio / market_cap / dividend_yield | NUMERIC | 基本面指标 |
| fifty_two_week_high / fifty_two_week_low | NUMERIC | 52 周区间 |

### `st-symbol-settings`（股票配置）

| 列 | 类型 | 说明 |
|----|------|------|
| symbol | VARCHAR(20) PK | 股票代码 |
| name | VARCHAR(100) | 公司名称 |
| enabled | BOOLEAN | 是否监控 |
| auto_trade | BOOLEAN | 是否自动交易 |

### 其他表

- **`st-daily-reports`**：每日报告（持仓快照 + 决策摘要）
- **`st-logs`**：操作日志（category / message / details JSONB）
- **`st-app-settings`**：全局设置（目前仅 `global_auto_trade` 键）

---

## 行情获取（四级回退链）

`src/lib/prices.ts` 按顺序尝试，第一个成功即返回：

| 优先级 | 来源 | 方式 | 超时 |
|--------|------|------|------|
| 1 | Yahoo Finance v8 Chart API | `query1.finance.yahoo.com/v8/finance/chart/{symbol}` | 10s |
| 2 | Yahoo Finance HTML | 爬取 `finance.yahoo.com/quote/{symbol}/`，解析 `<fin-streamer>` | 15s |
| 3 | Google Finance | 爬取 `google.com/finance/quote/`，5 种 HTML 模式匹配 | 10s |
| 4 | Tavily AI Search | 自然语言搜索价格，`parsePriceFromText()` 提取 | 25s |

**符号规范化**：`01810.HK` → `1810.HK`（Yahoo 格式）

**币种推断**：`.HK` → HKD, `.SS/.SZ` → CNY, `.L` → GBP, `.T` → JPY, 默认 USD

**汇率**（硬编码近似）：HKD→USD `×0.128`, CNY→USD `×0.138`

---

## AI 决策引擎

### DeepSeek 调用 (`src/lib/ai-decision.ts`)

- **API**：支持原生 DeepSeek 和 Azure OpenAI 两种认证方式（自动检测 URL 中的 `.openai.azure.com`）
- **温度**：`0.1`（极低随机性）
- **System Prompt**：`"You are a disciplined equity trader. Return ONLY JSON: {\"action\":\"BUY|SELL|HOLD\",\"confidence\":0-100,\"reasoning\":\"...\"}"`
- **输入**：完整 `DecisionContext`（报价 + 持仓 + 情绪 + 12 条价格历史 + 新闻摘要 + 策略偏好）
- **超时**：60s

### 决策上下文结构

```
DecisionContext {
  symbol, companyName,
  quote: { price, currency, changePercent, pe, marketCap, dividendYield, 52wHigh, 52wLow },
  position: { shares, costPrice, pnlPct },
  sentiment: { score(-1~1), positiveHits[], negativeHits[] },
  recentPriceHistory: [{ price, changePercent, timestamp }] × 12条,
  newsSummary (截断至2000字符),
  strategyBias
}
```

### 规则回退引擎 `analyzeSignals()`

当 DeepSeek 不可用时自动降级为多因子信号评分：

| 因子 | 分值变化 |
|------|----------|
| 情绪基础分 | `sentimentScore × 40` |
| 盈亏 > 30% | −15（获利了结压力） |
| 盈亏 10%–30% | +10 |
| 盈亏 < −20% | +15（抄底信号） |
| PE < 25 且情绪正面 | +10 |
| 股息率 > 1.5% | +5 |
| 接近 52 周低点（< 低点×1.15）且情绪正面 | +15 |
| 日内涨跌 > 3% | ±6 |
| 小米额外情绪加成 | `sentimentScore × 12` |
| 新闻量 ≥ 5 条 | ±10 |

**情绪评分公式**：

$$\text{sentimentScore} = \frac{\text{positiveHits} - \text{negativeHits}}{\max(\text{positiveHits} + \text{negativeHits},\; 1)}$$

**决策阈值**：

| 股票 | BUY 阈值 | SELL 阈值 | 特殊规则 |
|------|----------|-----------|----------|
| MSFT | 季度末（3/6/9/12月25日后） | signalStrength < −25 | 季度定投策略 |
| 小米 (01810.HK) | > 8 | < −8 | 每日主动监控，阈值更激进 |
| 通用 | > 15 | < −15 | 标准多因子 |

**Confidence 计算**：$\min(95,\; 55 + \lfloor|\text{signalStrength}|\rfloor)$

---

## 交易执行逻辑

### BUY 股数计算

- **MSFT**：固定约 $2,900 USD → `Math.floor(2900 / price)`
- **其他**：按信心度 200–1000 股 → `Math.max(200, Math.floor(confidence / 100 × 1000))`

### SELL 股数计算

- 卖出比例：`Math.min(0.25, confidence / 400)`（最多卖 25%）
- 最终股数：`Math.min(currentShares, Math.max(1, floor(shares × sellPct)))`

### 执行前置条件（全部需满足）

- 是交易日（非周末）
- 全局自动交易 = true
- 符号自动交易 = true
- 当前价格 > 0

执行后：写入 `st-trades` + 更新 `st-holdings` 的 shares 和 current_price。

---

## 调度器系统

### 内建调度器 (`src/lib/scheduler.ts`)

- **启动**：服务器启动时通过 `src/instrumentation.ts` 自动调用 `startScheduler()`
- **间隔**：`SCHEDULER_INTERVAL_MIN` 环境变量控制（默认 5 分钟）
- **首次运行**：启动后延迟 5 秒
- **防重入**：`isRunning` 标志位防并发
- **市场开盘检测**：仅当至少一个被监控股票的市场开盘时才运行

**市场交易时段**：

| 市场 | 后缀 | 时区 | 交易时段 |
|------|------|------|----------|
| 港股 | .HK | Asia/Hong_Kong | 09:30–12:00, 13:00–16:00 |
| A 股 | .SS/.SZ | Asia/Shanghai | 09:30–11:30, 13:00–15:00 |
| 日股 | .T | Asia/Tokyo | 09:00–11:30, 12:30–15:00 |
| 美股 | 默认 | America/New_York | 09:30–16:00 |

### 外部 Cron API (`/api/cron`)

POST 请求，通过 `x-cron-secret` header 认证。

| task 参数 | 行为 |
|-----------|------|
| `prices` | 仅更新价格 |
| `decisions` | 仅运行 AI 决策 |
| `health` | 24h 交易/决策统计 |
| `full`（默认） | 完整周期 |

---

## 新闻与情绪分析

### Tavily 搜索 (`searchMarketNews()`)

- **深度**：`advanced`，结果数 `max_results: 8`
- **查询**：`"{companyName} {symbol} stock market news latest financial analysis {year}"`
- **超时**：25s
- **降级**：认证失败 / 限流 / 超时 → 回退到纯技术信号

### 情绪关键词

- **利好（21 个）**：growth, beat, upgrade, surge, rally, bullish, outperform, strong, record, innovation, partnership, expansion, revenue growth, profit, dividend, breakthrough, exceed, momentum, buy rating, ai, cloud
- **利空（21 个）**：decline, miss, downgrade, drop, bearish, underperform, weak, lawsuit, investigation, layoff, recession, loss, warning, cut, sell rating, tariff, sanction, ban, debt, default, concern

---

## 认证系统

- **密码**：`stock2026`
- **Cookie 认证**：`st-auth` cookie，httpOnly，有效期 30 天
- **Bearer Token**：`Authorization: Bearer stock2026`（用于 API 调用）
- **公开路径**：`/api/auth`
- **保护范围**：`/dashboard/:path*` 和 `/api/((?!auth).*)`

---

## API 端点汇总

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/auth` | POST | 登录（设置 cookie） |
| `/api/holdings` | GET | 持仓列表 + USD 市值/盈亏 |
| `/api/prices` | POST | 触发全量价格更新 |
| `/api/prices` | GET | 价格历史（?symbol=&limit=） |
| `/api/decisions` | POST | 触发 AI 决策周期 |
| `/api/decisions` | GET | 决策历史（?symbol=&limit=） |
| `/api/trades` | GET | 最近 50 条交易记录 |
| `/api/settings` | GET/POST/PATCH | 股票配置与全局开关管理 |
| `/api/seed` | POST | 创建表 + 种子数据 |
| `/api/cron` | POST | 外部 Cron 触发（?task=） |
| `/api/report` | GET/POST | 日报生成与查看 |
| `/api/health` | GET | 系统健康状态（?hours=） |
| `/api/history` | GET | 完整价格历史 + symbol 列表 |
| `/api/logs` | GET | 操作日志（按任务运行分组） |
| `/api/clear` | POST | 清空决策和交易数据 |

---

## Dashboard UI

| 页面 | 功能 |
|------|------|
| `/` | 登录页 |
| `/dashboard` | 主面板：系统状态 · 指标卡片 · 组合曲线图 · 资产饼图 · 持仓表 · 决策/交易标签页 · 操作按钮 |
| `/dashboard/settings` | 全局自动交易开关 · 添加/管理 symbol · 逐个切换 enabled/autoTrade |
| `/dashboard/history` | Symbol 筛选 · 价格趋势图 · 完整历史数据表 |
| `/dashboard/logs` | 按任务分组的价格日志 · 可展开详细数据 |

**健康指示器**：`LIVE/OFFLINE` · `MARKET OPEN/CLOSED` · `TRADING/WATCHING` · `PRICE FRESH/STALE`（30 秒刷新）

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek / Azure OpenAI API 密钥 |
| `DEEPSEEK_MODEL` | 模型名称（默认 `deepseek-chat`） |
| `DEEPSEEK_API_URL` | API 端点（支持 Azure OpenAI 部署格式） |
| `TAVILY_API_KEY` | Tavily 搜索 API 密钥 |
| `CRON_SECRET` | 外部 Cron 认证密钥 |
| `SCHEDULER_INTERVAL_MIN` | 调度器间隔分钟数（默认 5） |
| `TRADER_APP_URL` | 应用 URL（默认 `http://localhost:3001`） |

---

## 初始种子数据

| Symbol | Name | Shares | Cost Price | Currency | Exchange |
|--------|------|--------|------------|----------|----------|
| MSFT | Microsoft Corporation | 200 | $200 | USD | NASDAQ |
| 01810.HK | Xiaomi Corporation | 8000 | ¥48 | CNY | HKEX |

---

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env  # 填入 API keys

# 初始化数据库
# 启动后访问 dashboard，点击 "Seed DB" 按钮

# 启动开发服务器（调度器自动启动）
npm run dev

# 访问
open http://localhost:3001
# 密码: stock2026
```
