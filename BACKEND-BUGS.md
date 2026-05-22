# Pangolinfo Backend — MCP 集成期发现的接口问题清单

> 来源: 2026-05-22 ~ 23 三轮独立子 agent 端到端测试 GTM SKILL 跑通 MCP server 时暴露的真实问题. MCP 协议层已修, 这里列的是 **scrapeapi.pangolinfo.com 后端** 层需要跟进的事项. 优先级从高到低.

## 验证环境

- MCP server: `pangolinfo-mcp` v0.2.1 (`http://47.237.210.136/mcp?api_key=<jwt>`)
- 后端: `https://scrapeapi.pangolinfo.com` (Cloudflare 前置)
- 测试 query: 真实 GTM 选品场景 ("Dog Paw Covers H2 2026 选品" / "stanley quencher tumbler")
- 总积分预算: 每轮测试 < 60 积分, 全程在 30 内

---

## P1 (影响客户体验, 建议下版本修)

### B1. `filter_categories` 对真实存在的 categoryId 返回空 rows

**调用:**
```
filter_categories(
  marketplaceId="ATVPDKIKX0DER",
  timeRange="l7d",
  sampleScope="all_asin",
  categoryId="21613423011"   // 从 search_categories 拿到的 "Insulated Tumblers" 节点
)
```

**期望:** 返回该类目 macro telemetry (searchVolumeSum, unitSoldSum, returnRatio 等).
**实际:** `data.items.total = 0`, items 数组为空. 但该类目在 Amazon 上明显有数千 ASIN 在卖.

**影响:** SKILL Phase 1 的"硬筛红海"链路全部失效. AI 不得不绕路到 `filter_niches`. 客户拿到的报告少了"category 级宏观指标", 只剩 niche 级粒度.

**怀疑原因:**
- 后端 filter_categories 数据覆盖只索引了一部分 categoryId? 是否依赖某种采样池
- 或 search_categories 返回的 categoryId 跟 filter_categories 期望的 ID 形态不一致 (一个是 Amazon nodeId, 另一个是后端内部 id?)

**建议:**
- 后端 owner 确认 filter_categories 的数据覆盖范围. 列出"已索引 categoryId" 的命名空间
- 若 ID 形态不一致, 应在 search_categories 返回值里同时给出"可直接喂给 filter_categories 的 ID"字段

---

### B2. `search_categories` 不支持多 token 模糊匹配

**调用:**
```
search_categories(keyword="outdoor dog gear", site="amz_us")
search_categories(keyword="stanley quencher tumbler", site="amz_us")
```

**期望:** 返回相关 Amazon 类目节点.
**实际:** 两次都返回 `total=0`. 必须降级到单 token ("dog" / "tumbler") 才有结果.

**影响:** 客户用自然语言描述需求 (例如 "户外狗狗装备"), 直接 fail. AI 必须自己做"剥离形容词+品牌词, 保留名词头" 的预处理, 这本应是后端的能力.

**建议:**
- 短期: 后端在 keyword 入参做 token 拆分 + OR 查询
- 长期: 对 keyword 做 embedding 相似度匹配 (类似 niche 搜索的方式)

---

### B3. `wipo_search` 的 `hol` 字段是子串匹配, 短词大量误匹

**调用:**
```
wipo_search(source="USID", hol="DOK", pageSize=10)
```
(意图: 查 "DOK" 这个 Amazon 品牌的设计专利)

**期望:** 命中 DOK 品牌的设计专利, 或 0 命中.
**实际:** 返回 Yamaha Hatsudoki Kabushiki Kaisha 等无关 holder (含 "DOK" 子串).

**影响:** 短/通用品牌名 (≤4 字母, 含"DOK", "OXO", "POP") 的 WIPO 检索完全失真. 客户拿到的"商标风险"段会列一堆无关公司, 噪声盖过真实信号.

**建议:**
- 增加 `holExact: true` 入参支持精确匹配
- 或在 score 排序时把"完整词等于 query" 的结果排前
- 或后端做 holder 字段的 tokenization, 把日企日文片假名 ("ヤマハ発動機") 分开存

---

### B4. `pointCost` 字段在多个工具响应中为 null

**调用过且 `pointCost` 缺失的工具:**
- `search_categories`
- `filter_categories`
- `filter_niches`
- `wipo_search`
- `google_ai_search`

**调用过且 `pointCost` 正确返回的工具:**
- `search_amazon` (返回 1)
- `get_amazon_product` (返回 1)
- `get_amazon_reviews` (返回 5)

**影响:** AI 客户端无法准确做预算控制. SKILL 里写的"60 积分预算"得靠经验估算, 没法实时累计. 对最终客户的"我这次跑了多少钱"透明度差.

**建议:** 所有计费接口的响应统一回填 `pointCost`. 0 积分工具也显式回 `pointCost: 0`.

---

### B5. `get_amazon_reviews` 实际费率与文档不一致

**文档:** 10 积分/页 (MCP-TOOLS-MAP.md, capabilities tool 的 cost 字段都写 10pt/page)
**实测:** `pageCount=1` 实扣 5 积分 (响应 `pointCost=5`)

**影响:** AI 看着文档以为很贵, 不敢调; 实际比预想便宜一半. 客户该用没用上, 数据深度不够.

**建议:** 后端 owner 确认到底是 5 还是 10? 如果是 5, 我同步改 capabilities tool 和 MCP-TOOLS-MAP.md; 如果是 10 但某次抓页失败按比例退费 (返回 5), 需要明确文档说明.

---

## P2 (体验优化, v0.3 一起处理)

### B6. `google_ai_search` 的 `ai_overview` block 经常为空

**调用:**
```
google_ai_search(query="best dog paw covers for hot pavement 2026")
```

**期望:** 返回 Google AI Overview 综合答案 + 引用源.
**实际:** `ai_overview.items = []`, `ai_overview.references = []`, 但 organic `items[]` (搜索结果) 是有的.

**影响:** SKILL Phase 1 Task 2 / Phase 4 Task 3 都依赖 AI Overview 综合理解能力. 当它空了, AI 只能逐条读 organic 结果, 效果降级.

**怀疑:**
- 不是所有 query 都触发 Google AI Overview (Google 自己只对 ~30-40% query 显示)
- 还是后端解析逻辑没捕捉到 AI Overview block?

**建议:**
- 在响应里显式区分: "Google 没返回 AI Overview" vs "后端解析失败"
- 如果是前者, 增加 fallback 字段如 `featured_snippet` 也有用

---

### B7. `wipo_search` 文字商标支持不够明确

**测试发现:** SKILL 原本用 `source="USID"` 查文字商标, 但 USID 是设计专利 DB, 不含 STATUS=Live 字段. 真正查文字商标应该是 `source="USTM"`.

**问题:** 文档/capabilities tool 里没有讲清楚哪些 source 是 USTM 哪些是 USID. 测试期间发现 sources 列表里有 USTM 但没有人测过它的字段形态. SKILL 已经在 v3 里改成 USTM, 但需要后端确认:
- USTM 真的存在且有数据?
- 它的返回字段长什么样 (是否有 `wordmark`, `goods_and_services`, `STATUS`)?
- 当前命中量级?

**建议:**
- 后端 owner 拉一次 USTM 命中样本, 提供字段 schema 文档
- 在 wipo_search 工具 description 里明确列出 source 候选: `USTM`(美国商标)/`USID`(美国设计专利)/各国对应代号

---

### B8. 跨工具的 `pointCost` 单位混淆

**现象:**
- `search_amazon` `pointCost: 1` — 1 积分?
- `get_amazon_product` `pointCost: 1` — 1 积分?
- `get_amazon_reviews` `pointCost: 5` — 5 积分?

但 capabilities tool 写的 cost:
- `search_amazon`: "1pt/~5s"
- `get_amazon_product`: "1pt/~5s"
- `get_amazon_reviews`: "10pt/page"

**问题:** 单位是 "pt" (point/积分) 还是别的? 客户在网站充值时看的是 "credits", 在响应里看的是 "pointCost", 在 capabilities 里看的是 "pt". 三个术语对齐到一个.

**建议:** 统一使用 `credits`, 或显式定义 1 point = N credits.

---

## P3 (低优先, 文档/可观测性)

### B9. 没有公开的 schema/字段文档

每个工具响应的字段长什么样, 哪些是 nullable, 哪些是 enum — 全靠 AI 试出来. AI 在第一次见到工具时容易写错参数名 (比如 `searchVolumeSum` vs `searchVolumeT90`).

**建议:**
- 在 docs.pangolinfo.com 加一页 "MCP Tool Response Schemas"
- 或在 capabilities tool 加一个 `detail="full"` 模式返回每个工具的 JSON schema

### B10. 错误 message 偶尔是英文混中文

某次 4029 错误的 message 是 `Rate limit exceeded, please reduce QPS and retry` (英文), 但其他错误是中文. 不一致.

**建议:** 后端按 client 传入的 `Accept-Language` 或 `lang` 参数返回对应语言.

---

## 不要修的"伪 bug"

为避免重复讨论, 列一下被测试发现但实际**不需要后端改**的事项:

- **`wipo_search source=USID 没有 STATUS 字段`** — 这是 USID DB 本身就没有 STATUS 字段 (设计专利只有 RD 注册日期, 没有 Live/Dead). SKILL 那边已经修, 让 AI 用 USTM 查文字商标.
- **`pangolinfo_capabilities tool 返回 version=0.1.0`** — 这是 MCP server 自己代码里写死了, 已修 (v0.2.1).
- **`get_amazon_reviews pageCount=1 扣 5pt`** — 这是后端实际行为, 已让 SKILL 与之对齐 (改成 "~5 credits per page"). 但还是建议明确文档.

---

## 联系/跟进

发现这些问题的人: Randy (MCP 集成方)
后端 owner: scrapeapi 维护团队
讨论渠道: 飞书群 / GitHub Issues

请就 B1-B5 (P1) 在 v0.3 之前给一个修复 / 不修的明确回应; B6-B10 可以批次处理.
