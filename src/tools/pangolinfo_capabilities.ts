/**
 * Pangolinfo MCP - tool: pangolinfo_capabilities
 *
 * Self-introspection tool. Returns the current MCP server's tool
 * catalog + canonical workflow patterns + bilingual usage hints. The
 * idea: an AI client that has never seen this server should call
 * `pangolinfo_capabilities` once at session start, then make
 * informed decisions about *which* tools to chain.
 *
 * This tool is intentionally local (no backend call): per CONTRACT §9
 * MCP must not expose account/billing endpoints to the AI. So we
 * don't report point balance or quota — only what the server itself
 * knows about its own surface.
 */

import { z } from "zod";

import type { Tool } from "./_types.js";
import { t, getLocale } from "../i18n.js";
import { SERVER_VERSION } from "../version.js";

const inputSchema = z.object({
  detail: z
    .enum(["summary", "full"])
    .default("summary")
    .describe(
      t({
        zh: "'summary' 返回工具清单 + 典型链路（默认，省 token）；'full' 把 17 个 tool 的完整 description 也一并展开（约 8KB，第一次接入或上下文不紧时用）。",
        en: "'summary' returns tool catalog + canonical workflows (default, token-light); 'full' also expands the full description of every tool (~8KB — use on first integration or when context budget allows).",
      }),
    ),
});

interface ToolMeta {
  name: string;
  cost: string;
  domain: string;
  oneLiner: { zh: string; en: string };
}

const TOOL_META: ToolMeta[] = [
  {
    name: "search_amazon",
    cost: "1pt/~5s",
    domain: "amazon",
    oneLiner: {
      zh: "Amazon 关键词搜索结果首屏 ASIN 列表",
      en: "Amazon keyword SERP first-page ASIN list",
    },
  },
  {
    name: "get_amazon_product",
    cost: "1pt/~5s",
    domain: "amazon",
    oneLiner: {
      zh: "按 ASIN 抓单品完整 PDP",
      en: "Full PDP scrape by ASIN",
    },
  },
  {
    name: "get_amazon_reviews",
    cost: "10pt/page · ~10s",
    domain: "amazon",
    oneLiner: {
      zh: "按 ASIN 翻页拉真实买家评论",
      en: "Page-fetch real buyer reviews for an ASIN",
    },
  },
  {
    name: "search_amazon_alexa",
    cost: "6pt/call · ~30s",
    domain: "amazon",
    oneLiner: {
      zh: "用自然语言问 Amazon Rufus，拿结构化商品推荐",
      en: "Ask Amazon Rufus in natural language for grouped product picks",
    },
  },
  {
    name: "list_bestsellers",
    cost: "1pt/~5s",
    domain: "amazon",
    oneLiner: {
      zh: "类目 Best Sellers Top-100 + 24h 排名变化",
      en: "Category Best Sellers Top-100 with 24h rank deltas",
    },
  },
  {
    name: "list_new_releases",
    cost: "1pt/~5s",
    domain: "amazon",
    oneLiner: {
      zh: "类目近 30 天新品热销榜",
      en: "Category New Releases ranking (last 30 days)",
    },
  },
  {
    name: "list_seller_products",
    cost: "1pt/~5s",
    domain: "amazon",
    oneLiner: {
      zh: "卖家店铺全部上架商品（分页）",
      en: "All listings under a merchant ID (paginated)",
    },
  },
  {
    name: "list_category_products",
    cost: "1pt/~5s",
    domain: "amazon",
    oneLiner: {
      zh: "按 Node ID 列类目下具体商品",
      en: "Concrete products under a category Browse Node ID",
    },
  },
  {
    name: "search_categories",
    cost: "1pt/~3s",
    domain: "amazon-niche",
    oneLiner: {
      zh: "按关键词搜 Amazon 类目树",
      en: "Match Amazon category tree by keyword",
    },
  },
  {
    name: "get_category_children",
    cost: "1pt/~3s",
    domain: "amazon-niche",
    oneLiner: {
      zh: "类目树下钻列子类目",
      en: "Drill the category tree by listing children",
    },
  },
  {
    name: "filter_categories",
    cost: "1pt/~5s",
    domain: "amazon-niche",
    oneLiner: {
      zh: "按 30+ 商业指标筛/详情类目",
      en: "Filter or detail categories by 30+ commercial metrics",
    },
  },
  {
    name: "filter_niches",
    cost: "1pt/~5s",
    domain: "amazon-niche",
    oneLiner: {
      zh: "按 50+ 指标筛/详情 Amazon Niche",
      en: "Filter or detail Amazon Niches by 50+ metrics",
    },
  },
  {
    name: "get_category_paths",
    cost: "1pt/~2s",
    domain: "amazon-niche",
    oneLiner: {
      zh: "批量解析 categoryId → 面包屑",
      en: "Batch resolve categoryIds to breadcrumb paths",
    },
  },
  {
    name: "search_local_maps",
    cost: "1.5pt/~5s",
    domain: "google",
    oneLiner: {
      zh: "Google Maps 本地商家搜索",
      en: "Google Maps local-business search",
    },
  },
  {
    name: "ai_search",
    cost: "2pt/~30s",
    domain: "google",
    oneLiner: {
      zh: "Google SERP + AI Overview 抓取",
      en: "Google SERP + AI Overview scrape",
    },
  },
  {
    name: "keyword_trends",
    cost: "1.5pt/~5s",
    domain: "google",
    oneLiner: {
      zh: "Google Trends 关键词热度对比",
      en: "Google Trends keyword popularity comparison",
    },
  },
  {
    name: "wipo_search",
    cost: "2pt/~5s",
    domain: "ip",
    oneLiner: {
      zh: "WIPO 全球外观设计/商标检索",
      en: "WIPO global design / IP search",
    },
  },
];


const WORKFLOWS = [
  {
    title: { zh: "🔍 从关键词到选品（GTM 漏斗）", en: "🔍 Keyword → niche scouting (GTM funnel)" },
    steps: [
      "search_categories",
      "filter_niches",
      "filter_niches (with nicheId for detail)",
      "list_category_products",
      "get_amazon_product",
      "get_amazon_reviews",
      "wipo_search",
    ],
    note: {
      zh: "标准 GTM SOP。filter_niches 用 nicheId 当详情接口取深度报告。",
      en: "Standard GTM SOP. Pass nicheId to filter_niches a second time for the deep report.",
    },
  },
  {
    title: { zh: "🥊 单 ASIN 竞品深拆", en: "🥊 Single-ASIN competitor deep-dive" },
    steps: [
      "search_amazon",
      "get_amazon_product",
      "get_amazon_reviews (filterByStar='critical')",
      "list_seller_products",
    ],
    note: {
      zh: "search_amazon 拿候选 → get_amazon_product 拆详情 → get_amazon_reviews 挖痛点 → list_seller_products 看卖家铺货。",
      en: "search_amazon → get_amazon_product → get_amazon_reviews (mine pain points) → list_seller_products (storefront breadth).",
    },
  },
  {
    title: { zh: "📈 类目趋势监测", en: "📈 Category trend monitoring" },
    steps: ["list_bestsellers", "list_new_releases", "keyword_trends"],
    note: {
      zh: "Best Sellers 看长青、New Releases 看新进、Google Trends 看外部需求方向。",
      en: "Best Sellers for evergreen winners, New Releases for new entrants, Google Trends for external demand direction.",
    },
  },
  {
    title: { zh: "🌐 外部需求验证", en: "🌐 External demand validation" },
    steps: ["keyword_trends", "ai_search (mode='overview')"],
    note: {
      zh: "对一个 keyword 概念，先 trends 看热度走势，再 ai_search 看 AI Overview 引用了哪些信息源（识别内容竞争）。",
      en: "For a keyword concept, run trends for popularity trajectory, then ai_search to see which sources the AI Overview cites (content competition signal).",
    },
  },
  {
    title: { zh: "⚖️ 立项前 IP 风险排查", en: "⚖️ Pre-launch IP risk clearance" },
    steps: [
      "wipo_search (source='USID', hol='<brand>')",
      "wipo_search (source='CNID', prod='<product>' + rd='2024')",
    ],
    note: {
      zh: "美国看 USPTO 外观（USID），中国看 CNID（必须配 rd/status/lcs 至少一项，否则全表扫描被拒）。",
      en: "USPTO designs via USID; China designs via CNID (pair with rd/status/lcs to avoid full-scan rejection).",
    },
  },
  {
    title: { zh: "🏪 卖家/品牌画像", en: "🏪 Seller / brand profiling" },
    steps: [
      "get_amazon_product (get seller.id from a known ASIN)",
      "list_seller_products (with that sellerId)",
    ],
    note: {
      zh: "先从一个已知 ASIN 拿到 seller.id，再扫该 seller 全部铺货。",
      en: "Pull seller.id from one known ASIN, then enumerate the seller's full catalog.",
    },
  },
  {
    title: { zh: "🤖 AI 场景化选品", en: "🤖 Scenario-based AI sourcing" },
    steps: [
      "search_amazon_alexa",
      "get_amazon_product",
      "get_amazon_reviews",
    ],
    note: {
      zh: "用户只有场景没有关键词时：Rufus 给出多组候选商品 → 单 ASIN 深拆 → 差评挖痛点。固定 6pt/次，建议 prompts ≤3 条以保响应稳定。",
      en: "When the user has a scene but no keyword: Rufus returns grouped candidates → single-ASIN deep-dive → critical-review pain points. Flat 6pt/call; keep prompts ≤3 for stable latency.",
    },
  },
];

const TIPS = [
  {
    zh: "成本意识：get_amazon_reviews 是最贵的（10 积点/页），其他多数 1-2 积点。批量抓评论前先 pageCount=1 探。",
    en: "Cost awareness: get_amazon_reviews is the priciest (10pt/page), most others 1-2pt. Probe with pageCount=1 before scaling.",
  },
  {
    zh: "格式选择：search_amazon / get_amazon_product 默认 format='json' 取结构化字段；只在用户明确要原始页时切 'markdown'。",
    en: "Format choice: search_amazon / get_amazon_product default to format='json' for structured fields. Only switch to 'markdown' when the user wants the raw page.",
  },
  {
    zh: "类目路径：用户给关键词 → search_categories；用户给 ID → 直接喂下游或用 get_category_paths 换面包屑；想下钻 → get_category_children。",
    en: "Category routing: user gives keyword → search_categories; user gives ID → feed downstream directly or use get_category_paths for breadcrumbs; want to drill → get_category_children.",
  },
  {
    zh: "WIPO 性能契约：CNID + 模糊 (hol/prod) 必须配 id/idSearch/rd/status/lcs；USID 无 STATUS；JPID 无 HOL/PROD；ed 永远被忽略。",
    en: "WIPO perf contract: CNID + fuzzy (hol/prod) MUST pair with id/idSearch/rd/status/lcs; USID has no STATUS; JPID has no HOL/PROD; ed is always ignored.",
  },
];

export const pangolinfoCapabilities: Tool<typeof inputSchema> = {
  name: "pangolinfo_capabilities",
  description: t({
    zh: `[Pangolinfo MCP 自省] 一次性获取本服务的全部能力清单、典型协同链路、使用提示——无后端调用，免费。
Use when: AI 客户端第一次连上 pangolinfo-mcp，需要快速了解"有哪些工具""怎么搭配用""哪些场景该用哪条链路"；用户问"你能做什么""有哪些能力"；做 SOP 规划前的能力盘点。
Don't use: 想知道某个具体工具的完整 description（用 tools/list，本工具的 'summary' 模式只给一句话定位）；想查账号余额或剩余积点（CONTRACT §9 禁止 MCP 暴露账号接口）。
Returns: { version, locale, liveTools[{name, domain, oneLiner, cost}], workflows[{title, steps[], note}], tips[] }。
Pair with: ↓ AI 看完决定调哪个具体 tool；不消耗下游。
Cost: 0 积点（本地数据，不走后端）。`,
    en: `[Pangolinfo MCP self-introspection] One call to get the full capability catalog, canonical workflows, and usage tips — no backend call, free.
Use when: an AI client first connects to pangolinfo-mcp and needs to quickly grasp "what tools exist" / "how do they chain" / "which workflow for which scene"; user asks "what can you do" / "what capabilities are there"; capability audit before SOP planning.
Don't use: for the full description of one specific tool (use tools/list — the 'summary' mode here gives one-liners only); for account balance or remaining credits (CONTRACT §9 forbids exposing account endpoints via MCP).
Returns: { version, locale, liveTools[{name, domain, oneLiner, cost}], workflows[{title, steps[], note}], tips[] }.
Pair with: ↓ AI decides which concrete tool to call next; does not consume downstream tools.
Cost: 0 points (local data, no backend round-trip).`,
  }),
  inputSchema,
  async execute(input, _ctx) {
    const locale = getLocale();
    const isZh = locale === "zh";

    const liveTools = TOOL_META.map((m) => ({
      name: m.name,
      domain: m.domain,
      cost: m.cost,
      oneLiner: isZh ? m.oneLiner.zh : m.oneLiner.en,
    }));

    const workflows = WORKFLOWS.map((w) => ({
      title: isZh ? w.title.zh : w.title.en,
      steps: w.steps,
      note: isZh ? w.note.zh : w.note.en,
    }));

    const tips = TIPS.map((tip) => (isZh ? tip.zh : tip.en));

    const summary = {
      server: "pangolinfo-mcp",
      version: SERVER_VERSION,
      locale,
      // Two distinct counts to avoid client confusion:
      //   - wireTotalCount: total tools visible via tools/list (includes
      //     this self-introspection tool itself).
      //   - businessToolCount: tools that actually call the backend
      //     (excludes pangolinfo_capabilities). Equals liveTools.length.
      wireTotalCount: TOOL_META.length + 1,
      businessToolCount: TOOL_META.length,
      liveTools,
      workflows,
      tips,
    };

    if (input.detail === "summary") {
      return summary;
    }

    // 'full' mode: include the language-specific description from every
    // tool. We resolve them lazily here (rather than importing all
    // tools at top-level) to keep this file decoupled from the registry
    // — index.ts already wires the canonical list.
    const { tools } = await import("./index.js");
    const fullDescriptions = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));

    return { ...summary, fullDescriptions };
  },
};
