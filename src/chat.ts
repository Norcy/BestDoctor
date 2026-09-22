import OpenAI from "openai";
import { doctorReviews, searchDoctors } from "./health160.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

const CITY_SLUGS: Record<string, string> = {
  深圳: "sz",
  广州: "gz",
  北京: "bj",
  上海: "sh",
  长沙: "cs",
  郑州: "zz",
  重庆: "cq",
  成都: "cd",
  东莞: "dg",
  杭州: "hz",
  苏州: "su",
  武汉: "wh",
  西安: "xa",
  南京: "nj",
};

type Intent = {
  city: string;
  city_slug: string;
  department: string | null;
  department_code: string | null;
  symptoms: string[];
  keywords: string[];
};

async function parseIntent(message: string, cityHint?: string): Promise<Intent> {
  const response = await client.responses.create({
    model: MODEL,
    reasoning: { effort: "none" },
    max_output_tokens: 300,
    instructions: [
      "你是找医生产品的查询解析器，只负责把用户描述转换为结构化查询。",
      "不要诊断，不要给治疗建议。",
      "目前健康160科室编码只确定：神经内科=A05。其他科室 department_code 必须返回 null。",
      "city_slug 只能使用给定城市映射；如果无法识别，返回空字符串。",
      `城市映射：${JSON.stringify(CITY_SLUGS)}`,
    ].join("\n"),
    input: `城市提示：${cityHint || "无"}\n用户输入：${message}`,
    text: {
      format: {
        type: "json_schema",
        name: "doctor_search_intent",
        strict: true,
        schema: {
          type: "object",
          properties: {
            city: { type: "string" },
            city_slug: { type: "string" },
            department: { type: ["string", "null"] },
            department_code: { type: ["string", "null"] },
            symptoms: { type: "array", items: { type: "string" } },
            keywords: { type: "array", items: { type: "string" } }
          },
          required: ["city", "city_slug", "department", "department_code", "symptoms", "keywords"],
          additionalProperties: false
        }
      }
    }
  });

  return JSON.parse(response.output_text) as Intent;
}

export async function chatWithDoctorSearch(message: string, cityHint?: string) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const intent = await parseIntent(message, cityHint);

  if (!intent.city_slug && cityHint && CITY_SLUGS[cityHint]) {
    intent.city = cityHint;
    intent.city_slug = CITY_SLUGS[cityHint];
  }

  if (!intent.city_slug) {
    return {
      answer: "我还不能确定你所在的城市。请补充城市，例如“深圳”。",
      intent,
      doctors: []
    };
  }

  const candidates = (await searchDoctors(
    intent.city_slug,
    intent.department_code || undefined,
    1,
    1,
  )).slice(0, 8);

  const enriched = await Promise.all(
    candidates.slice(0, 5).map(async (doctor) => {
      const doctorId = String(doctor.doctor_id || "");
      if (!doctorId) return { ...doctor, review_stats: null };
      try {
        const reviews = await doctorReviews(doctorId, 1);
        return { ...doctor, review_stats: reviews.stats };
      } catch {
        return { ...doctor, review_stats: null };
      }
    }),
  );

  const response = await client.responses.create({
    model: MODEL,
    reasoning: { effort: "low" },
    max_output_tokens: 700,
    instructions: [
      "你是 BestDoctor 的医生搜索结果解释器。",
      "只能依据提供的真实候选数据回答，不得编造医生、医院、评分或评价。",
      "不要做确定性诊断，不要声称某医生一定最好。",
      "优先解释科室匹配、擅长方向、评价数量和疾病评价分布。",
      "如果数据不足，要明确说数据不足。",
      "回答用简洁中文，推荐不超过 5 位候选。",
      "如症状可能涉及急症，只做一般性的就医紧急性提醒，不给具体治疗方案。"
    ].join("\n"),
    input: [
      `用户问题：${message}`,
      `解析结果：${JSON.stringify(intent)}`,
      `健康160候选数据：${JSON.stringify(enriched)}`
    ].join("\n\n"),
  });

  return {
    answer: response.output_text,
    intent,
    doctors: enriched,
    model: MODEL,
  };
}
