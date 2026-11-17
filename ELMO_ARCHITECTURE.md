# elmo 项目剖析

> 基于 v0.7.12（commit `2b477bd`）源码阅读，所有结论均可在代码中核对。
> 用途：团队交接、二次开发决策、指标解读时对齐口径。

---

## 一、定位

开源、可自托管的 **AI 可见度追踪平台**（GEO / AEO / LLMO），定位是 Profound、Peec、Otterly 等闭源 SaaS 的开源替代，MIT 协议。

核心命题：买家越来越先问 AI 再搜索，品牌需要知道——AI 提到你了吗？说你好话吗？引用了谁？竞品呢？

最硬的承诺：**每个数字都能从原始回答重新推导**。下文第五节会验证这句话落到什么程度。

---

## 二、代码规模

| 模块 | 文件 | 行数 | 说明 |
|---|---|---|---|
| `apps/web` | 436 | 49,531 | 仪表盘 + REST API + MCP 服务 |
| `packages/lib` | 90 | 36,022 | 核心业务逻辑 |
| ├─ 引用域名库 | 2 | **25,343** | 硬编码媒体/来源域名分类 |
| └─ 其余业务逻辑 | 88 | 10,679 | 采集、判读、调度、聚合 |
| `apps/www` | 180 | 31,597 | 官网（营销站，与产品无关） |
| `packages/ui` | 44 | 4,714 | 共享组件库 |
| `apps/cli` | 29 | 3,566 | `elmo init` / `elmo compose` |
| `apps/worker` | 24 | 2,596 | 后台任务 |
| `packages/config` | 15 | 1,832 | 配置、环境变量、套餐额度 |

产品核心逻辑约 **9.3 万行**（不含官网和域名库）。测试 163 个文件，Storybook 36 个故事。

**结论**：不是靠代码量堆出来的产品，而是靠数据管道设计和对 AI 回答的解析能力。

---

## 三、架构

```
┌─────────────────┐         ┌──────────────┐         ┌─────────────────┐
│  apps/web       │◄───────►│  PostgreSQL  │◄───────►│  apps/worker    │
│  TanStack Start │         │  数据表       │         │  pg-boss        │
│  仪表盘 + API   │         │  + 任务队列   │         │  10 类任务       │
└─────────────────┘         └──────────────┘         └────────┬────────┘
                                                              │
                                                              ▼
                                                       ┌──────────────┐
                                                       │  11 个       │
                                                       │  provider    │
                                                       └──────────────┘
```

**关键选择**：PostgreSQL 同时充当数据库和任务队列（pg-boss），不需要 Redis 或消息中间件。

- 优点：自托管少一个组件，运维简单
- 代价：队列吞吐受 PG 限制，但本业务每天几千次采集，完全够用

---

## 四、数据流水线

```
[1] 调度              [2] 采集                [3] 提取           [4] 判读          [5] 聚合        [6] 读取
decidePromptCycle → provider.run()      → extractRun()   → mentionAnalyzer() → rollup_* 表  → LVCF + 计算
```

### 阶段 1：调度（`apps/worker/src/jobs/process-prompt.ts`）

- 每次触发**重新解析策略**，配置变更立即生效，不用等队列
- 动作为 `stop` / `reschedule` / `run` 三种
- 计量对齐 `prompt_runs` 历史而非 job 节奏，所以一个 job 能服务多个不同采集频率的目标，重复触发只跑到期的

### 阶段 2：采集

一条 prompt × 一个模型 × `replication`（默认 5）次独立采样，`Promise.allSettled` 并发。

四个动作：存原始回答 → 异步触发派生 → 记用量 → 失败上报不拖垮 cycle。

**关键设计**：只存原始回答，解析完全不在这层。

> 原文注释：解析代码出 bug，不会导致重新花钱调 AI。

### 阶段 3：提取（`apps/worker/src/jobs/derive-runs.ts`）

只在 **stamp 不同**时才重算。三个设计亮点：

1. **重放不降级** —— 新提取器提不出内容时保留旧值，用 `kept` 标记，防止升级反而丢数据
2. **并发一致性** —— 写入前复核品牌配置 stamp，变了就丢弃重来
3. **失败隔离** —— 单个 run 失败拆成独立 job 重试；长任务 60 秒心跳保活防重复计费

### 阶段 4：判读（`packages/lib/src/mention-judge/`）

**关键数字**：

```typescript
const MENTION_THRESHOLD = 0.3;
const mentioned = probability > MENTION_THRESHOLD;
```

判读模型（Jev）输出四个情绪标签的概率分布，加起来 > 0.3 即判定"被提及"。

判读结果还存了 `passage`（原文段落偏移）和 `probability`，但 **UI 上没有展示**。

### 阶段 5：聚合（`packages/lib/src/rollups/`）

按 `(brand, day, prompt, model, provider, web_search, query)` 七维度预聚合。

产出的统计包含 `no_mention_runs`（AI 谁都没提的回答数）——这个信号有价值，但 UI 没直接展示。

### 阶段 6：读取（`apps/web/src/lib/visibility-stats.ts`）

**LVCF（末值前推）**：某条 prompt 某天没跑，就用它最近一次观测值填充，避免采集节奏不均导致假凹陷。

代价：曲线比真实更平滑，永久下降会被旧值掩盖。

---

## 五、指标口径（精确公式）

### 1. AI 可见度

```
visibility = brand_mentioned_runs / (branded_runs + nonbranded_runs)
```

- 分母是**全部 run**，包括 AI 谁都没提的
- "当前值" = 时间序列**最后一个有值点**，不是平均值

### 2. 声量份额

```
share = brand_mentions / (brand_mentions + Σ competitor_mentions)
```

**存在两套实现，数字可能不一致**：

| 位置 | 实现 | 分母单位 |
|---|---|---|
| 报告页 `report-metrics.ts` | `computePromptSoV` | mention 实例数（一次回答提 3 竞品算 3） |
| 仪表盘 `visibility-stats.ts` | `computeShareOfVoice` | prompt 级提及（每 run 每公司算 1） |

对外汇报前必须确认用的是哪套。

### 3. 情绪倾向

```
score = (positive + (neutral + mixed)/2) / runs_with_sentiment
```

即：正面 1 分、中性 0.5、混合 0.5、负面 0，映射到 0–100。

**问题**：`mixed`（有褒有贬）和 `neutral`（没表态）算同分。从决策角度 mixed 是风险信号，被平均掉了。四标签在图表里分开显示，信息未丢，但综合分会误导。

### 4. 排名位置

```
average = sum(position) / positioned_runs
```

`position = 1` 表示第一个被提到的**被追踪公司**。

**限制**（代码注释原文）：只在被追踪的公司里排名。如果 AI 先提了一个你没追踪的公司，再提你，你的 position 仍是 1。

准确含义是「追踪圈内排名」，不是「AI 心里的真实排名」。

### 5. 引用稳定性

- `setVolatility`：Jaccard 距离（域名集合变化）
- `weightedVolatility`：Bray–Curtis 距离（引用份额变化）
- Stability score = `(1 - weighted) × 100`，0 = 每天全变，100 = 完全不变

双口径的原因（注释原文）：*有一个主导来源加长尾的 prompt，按集合剧烈变化，按份额几乎不动*。

---

## 六、可靠性评估

### 硬的部分（工程可靠性高）

| 能力 | 实现 | 意义 |
|---|---|---|
| 原始回答可重放 | `prompt_runs.raw_output` | 修 bug 不重采、不花钱 |
| 判定可版本化 | `stamp` = 配置指纹 + 判读器版本 | 改口径不污染历史 |
| 增量重判 | 逐 subject 的 fingerprint | 加竞品只重判那一个 |
| 重放不降级 | 保留旧值 + `kept` | 升级不丢数据 |
| 并发一致性 | 写入前复核 stamp | 不写入过期结论 |
| 计量防失控 | `dailyRunCeiling` = 1.5×理论峰值 | 异常不烧爆账单 |

这部分比多数商业产品严谨。

### 软的部分（统计与语义不确定性）

**1. 提及判定 30% 门槛** —— 阈值附近结论可翻转，UI 不提示某条判定有多接近临界。

**2. 概率与原文位置存了但没展示** —— `probability`、`passage` 都在数据库，界面看不到。对主打"可审计"的产品是明显缺口。

**3. LVCF 平滑掩盖波动** —— 曲线是填充值，不是原始观测。

**4. 采样量决定置信区间**（最容易被忽视）

以 33% 可见度为例，二项分布粗算：

| 采样量 | 95% 置信区间 |
|---|---|
| n = 30 | 33% ± 17% → **[16%, 50%]** |
| n = 100 | 33% ± 9% → [24%, 42%] |
| n = 300 | 33% ± 5% → [28%, 38%] |

同一 prompt 的多次重采样高度相关，不满足独立性假设，**真实区间比上表更宽**。

elmo 不呈现任何置信区间或采样量提示。

**5. 单条回答的品牌区分** —— 多品牌并列时无法可靠判断"谁更被推荐"，`position` 只解决"谁先被提到"。

---

## 七、扩展点（二次开发入口）

| 想做的事 | 改哪里 | 工作量 |
|---|---|---|
| 接入新 AI 引擎 | 新建 `packages/lib/src/providers/registry/xxx.ts`，实现 `Provider` 接口，在 `index.ts` 的 `providerMap` 加一行 | 小（每个约 100–200 行） |
| 新增指标 | `packages/lib/src/db/schema.ts` 加表 + `rollups/rebuild.ts` 加 SQL + 前端展示 | 中 |
| 改判定口径 | `mention-judge/analyze.ts`，改完 stamp 自动触发重算 | 小 |
| 换判读模型 | `mention-judge/jev.ts` | 小 |
| 补中文引用域名 | `packages/lib/src/citations/editorial-domains.ts` | 小，但需要数据积累 |
| 改界面文案 | 已全站汉化（`zh-cn` 分支） | — |

Provider 接口（`providers/types.ts`）：

```typescript
interface Provider {
  id: string
  name: string
  access: "scraped" | "api"     // 抓消费端 vs 调 API
  isConfigured(): boolean
  run(model, prompt, options): Promise<ScrapeResult>
  validateTarget?(config): ModelConfig | null
  runStructuredResearch?<T>(options): Promise<{ object: T }>
}
```

---

## 八、放到国内 GEO 场景看

### 能直接用

采集调度框架、判读重算架构、引用分类体系、指标计算口径。

### 必须改

| 问题 | 现状 |
|---|---|
| 国内 AI 引擎 | 零覆盖，需自建 provider |
| 引用域名库 | 25,343 条以英文媒体为主，国内会大量归入"其他" |
| 优化建议 | `server/opportunities.ts` 的 `GUIDANCE` 假设 ChatGPT/Reddit/Wikipedia 生态 |
| 界面语言 | 已汉化 |

### 要警惕

- **它是测量工具，不是优化工具**。告诉你现状，不帮你改内容。
- **成本非线性**。抓取类 provider 按次收费，prompt 数和引擎数一乘就上去了。
- **单条回答的品牌区分有物理上限**，UI 不呈现置信区间。

---

## 九、一句话总结

elmo 的架构本质是：**把「AI 怎么谈论你」做成一条可重放、可版本化、可审计的数据流水线**。

代码质量与管理成熟度（测试、迁移、部署模式抽象）在开源产品里属偏上。

对国内使用的价值峰值在**测量框架**这层，不在**开箱即用**这层——国内模型、中文引用库、本土化建议三块必须自己补。
