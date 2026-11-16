# 本地运行记录（无 Docker 方案）

> 目的：在这台机器上把 elmo（v0.7.12）从零跑起来，验证架构与数据链路。
> 结论：**已跑通完整链路**，但运行在「stub 模式」下，页面上的数字由假数据生成，不代表真实 GEO 表现。

---

## 一、为什么没用官方启动方式

官方 README 是 `elmo init` + `elmo compose up -d`，依赖 Docker Compose。本机环境探测结果：

| 依赖 | 状态 |
|---|---|
| Node | v24.21.0 ✓（`engines: 24.x` 正好满足） |
| pnpm | 无 → 用 corepack 拉取 `pnpm@12.18.0` ✓ |
| Docker | **未安装** ✗ |
| WSL2 Ubuntu 26.04 | 存在，但 **sudo 需要密码、且 WSL 内网络不通**（`archive.ubuntu.com` 连不上）✗ |
| PostgreSQL | 未安装 ✗ |

因此改为：**PostgreSQL 装在 Windows 侧（官方 zip 解压即用，不装系统服务），Node 应用直连本地库**。

---

## 二、实际采用的组件与位置

| 组件 | 位置 / 版本 | 说明 |
|---|---|---|
| PostgreSQL | `F:\projects\_tools\pgsql`（17.6），数据目录 `F:\projects\_tools\pgdata` | 官方 binaries zip，`initdb --auth=trust`，仅监听 `127.0.0.1:5432` |
| elmo 源码 | `F:\projects\elmo` | `git clone`，HEAD `2b477bd`（v0.7.12） |
| 环境变量 | `F:\projects\elmo\apps\web\.env` | worker 通过 `--env-file=../web/.env` 复用同一份 |
| 数据库 | `elmo`（41 张表） | 用 `packages/lib/local-migrate.mjs` 跑 drizzle 迁移 |

---

## 三、关键发现：上游内置了三个 keyless 开关

不需要任何付费 API key 就能跑通全链路，因为上游已经为「e2e 测试与无密钥本地开发」预留了开关：

| 开关 | 值 | 作用 | 代码位置 |
|---|---|---|---|
| `SCRAPE_TARGETS` 的 provider | `stub` | 采集层返回 prompt 本身作为答案，不走网络 | `packages/lib/src/providers/registry/stub.ts`，注释明写 "as e2e and keyless local development do" |
| `ONBOARDING_LLM_TARGET` | `stub:stub` | onboarding 分析返回预置的假品牌/竞品/prompts | `packages/lib/src/onboarding/llm.ts`；上游测试 `env.test.ts` 也用 `stub:stub` |
| `TYPESAFE_API_KEY` | `stub` | 判读走 cue-word 规则匹配，不调 Jev | `packages/lib/src/mention-judge/analyze.ts:277`，注释写 "For tests and development only" |

**注意坑点**：`assertRequiredEnv()` 只校验静态项，看似 worker 可以不配 judge key 启动；但 `configureMentionAnalyzer()` 在启动流程里会**强制抛错**——必须显式设 `TYPESAFE_API_KEY=stub` 才能起来。

---

## 四、当前 `.env` 内容（密钥已省略）

```dotenv
DATABASE_URL=postgresql://postgres@127.0.0.1:5432/elmo
BETTER_AUTH_SECRET=<随机 32 字节 hex>
ELMO_ENCRYPTION_KEY=<随机 32 字节 base64>
DEPLOYMENT_MODE=local
APP_URL=http://localhost:3000
DISABLE_TELEMETRY=1

# keyless 采集
SCRAPE_TARGETS=chatgpt:stub,google-ai-overview:stub,deepseek:stub
# keyless onboarding 分析
ONBOARDING_LLM_TARGET=stub:stub
# keyless 判读（cue-word 规则，仅开发用）
TYPESAFE_API_KEY=stub
```

---

## 五、启动 / 停止

### 启动 PostgreSQL
```powershell
& 'F:\projects\_tools\setup-pg.ps1'
```

### 启动 Web（终端 1）
```powershell
cd F:\projects\elmo
pnpm --filter @workspace/web dev      # http://localhost:3000
```

### 启动 Worker（终端 2）
```powershell
cd F:\projects\elmo
pnpm --filter @workspace/worker dev
```

### 停止 PostgreSQL
```powershell
& 'F:\projects\_tools\pgsql\bin\pg_ctl.exe' -D 'F:\projects\_tools\pgdata' stop
```

### 重跑迁移（一般不需要）
```powershell
cd F:\projects\elmo\packages\lib
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:5432/elmo'
node local-migrate.mjs
```

---

## 六、已验证跑通的链路

1. web 启动 → 注册管理员账户（`geotest@example.com`）
2. 创建品牌 `Demo Brand`（example.com）
3. 点 Analyze brand → worker 处理 `analyze-brand` 队列，12.2 秒返回建议
4. 向导确认 → 写入品牌/竞品/prompts，`brands.onboarded = true`
5. worker 自动调度采集：**2 prompts × 5 次重采样 × 3 模型 = 30 条 prompt_runs**
6. 派生提取 30 条、判读 30 条（`run_extractions` / `run_mentions`）
7. Overview 页渲染出 AI Visibility / Share of Voice / Sentiment / Position 与竞品对比

截图见 `elmo-dashboard.png`。

---

## 七、必须知道的局限

1. **页面上的数字是假数据。** stub 采集器把 prompt 原文当答案返回，判读用关键词规则匹配，所以「DeepSeek 100% / 其他 0%」这类结果只证明管道通，不代表任何真实 GEO 表现。
2. **Jina 网站摘录失败**（`r.jina.ai` 连接超时），onboarding 的"用网页内容增强分析"这一步实际没生效（回落到 stub 预置数据）。
3. **`apps/web/src/server/opportunities.ts` 的 `GUIDANCE` 仍是英文市场假设**（ChatGPT/Perplexity/Reddit/Wikipedia 等），对中国场景无参考价值，需按文档第 9 章重写。
4. **上游周更**（v0.7.10/11/12 同日发布），本地改动越多，跟版成本越高。

---

## 八、要接真实数据需要什么

| 目标 | 需要 |
|---|---|
| 真实采集海外模型 | 任一 `scraped` 类 provider 的 key（Cloro / BrightData / Oxylabs / SearchApi）或 `openrouter` + 模型 slug |
| 真实判读 | 真 `TYPESAFE_API_KEY`，或 `OPENROUTER_API_KEY` 走 Jev |
| 真实 onboarding（用自己官网内容） | 上述任一 research provider 的 key + 可访问的 `JINA_API_KEY`（可选，用于绕开匿名 401） |
| 覆盖国内模型 | **上游没有**现成 provider，需按文档第 9 章自建 `providers/registry/<id>.ts` |

切换方式：改 `.env` 里的 `SCRAPE_TARGETS` / `ONBOARDING_LLM_TARGET` / key 即可，无需改代码。
