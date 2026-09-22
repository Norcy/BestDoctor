import * as cheerio from "cheerio";

const BASE = "https://weixin.91160.com";

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
};

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: string }>();

export class Health160Error extends Error {}

async function getText(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const response = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Health160Error(`health160 returned HTTP ${response.status}`);
  }

  const text = await response.text();

  // We do not bypass login, captcha, or access controls.
  cache.set(url, { expiresAt: Date.now() + TTL_MS, value: text });
  return text;
}

function clean(value?: string | null): string | null {
  if (!value) return null;
  const result = value.replace(/\s+/g, " ").trim();
  return result || null;
}

function parseNumber(value?: string | null): number | null {
  if (!value) return null;
  const match = value.toLowerCase().replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([kw万]?)/);
  if (!match) return null;

  let n = Number(match[1]);
  if (match[2] === "k") n *= 1_000;
  if (match[2] === "w" || match[2] === "万") n *= 10_000;
  return n;
}

function queryId(url: string, ...keys: string[]): string | null {
  try {
    const parsed = new URL(url);
    for (const key of keys) {
      const value = parsed.searchParams.get(key);
      if (value) return value;
    }
  } catch {}
  return null;
}



export type Health160City = {
  name: string;
  slug: string;
  href: string;
};

export type Health160Department = {
  name: string;
  code: string;
  href: string;
};

function normalizeLabel(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/(普通)?门诊$/g, "")
    .replace(/专科$/g, "")
    .replace(/市$/g, "")
    .trim();
}

export async function discoverCities(): Promise<Health160City[]> {
  // Health160 exposes its city directory in normal public navigation.
  // Parse it dynamically instead of maintaining city -> subdomain mappings.
  const seeds = [
    "https://www.91160.com/",
    "https://sz.91160.com/search/doctor/cno-A/ysort-1/disease_id-0.html",
  ];

  const found = new Map<string, Health160City>();

  for (const seed of seeds) {
    try {
      const $ = cheerio.load(await getText(seed));
      $("a[href]").each((_, el) => {
        const name = clean($(el).text());
        const hrefRaw = $(el).attr("href");
        if (!name || !hrefRaw) return;

        let href: URL;
        try {
          href = new URL(hrefRaw, seed);
        } catch {
          return;
        }

        const match = href.hostname.match(/^([a-z0-9-]+)\.91160\.com$/i);
        if (!match) return;

        const slug = match[1].toLowerCase();
        if (["www", "user", "so", "news", "disease", "weixin", "wxis"].includes(slug)) return;
        if (!/^[\u4e00-\u9fffA-Za-z·\-]{2,20}$/.test(name)) return;

        const key = normalizeLabel(name);
        if (!key || found.has(key)) return;
        found.set(key, { name, slug, href: `https://${href.hostname}/` });
      });

      if (found.size >= 10) break;
    } catch {
      // Try the next public seed page.
    }
  }

  return [...found.values()];
}

export async function resolveCitySlug(cityName: string): Promise<string | null> {
  const target = normalizeLabel(cityName);
  if (!target) return null;

  const cities = await discoverCities();
  const exact = cities.find((city) => normalizeLabel(city.name) === target);
  if (exact) return exact.slug;

  const fuzzy = cities.find((city) => {
    const name = normalizeLabel(city.name);
    return name.includes(target) || target.includes(name);
  });
  return fuzzy?.slug || null;
}

function extractDepartmentLinks(
  html: string,
  baseUrl: string,
): Health160Department[] {
  const $ = cheerio.load(html);
  const found = new Map<string, Health160Department>();

  $("a[href]").each((_, el) => {
    const name = clean($(el).text());
    const hrefRaw = $(el).attr("href");
    if (!name || !hrefRaw) return;

    let href: string;
    try {
      href = new URL(hrefRaw, baseUrl).toString();
    } catch {
      return;
    }

    const code = href.match(/(?:^|\/)cno-([^/?#.]+)/i)?.[1] || null;
    if (!code) return;

    // Filter navigation/noise while retaining real department labels.
    const normalized = normalizeLabel(name);
    if (!normalized || normalized.length < 2 || normalized.length > 20) return;
    if (/医生|医院|预约|点评|热门|挂号|更多|收起|职称|服务/.test(normalized)) return;

    const key = `${normalized}|${code.toUpperCase()}`;
    if (!found.has(key)) {
      found.set(key, { name, code: code.toUpperCase(), href });
    }
  });

  return [...found.values()];
}

export async function discoverDepartments(
  citySlug: string,
): Promise<Health160Department[]> {
  const slug = citySlug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!slug) throw new Error("invalid city");

  const origin = `https://${slug}.91160.com`;
  const rootUrls = [
    `${origin}/search/doctor/ysort-1/disease_id-0.html`,
    `${origin}/search/doctor/cno-A/ysort-1/disease_id-0.html`,
  ];

  const found = new Map<string, Health160Department>();
  const parentCodes = new Set<string>();

  for (const url of rootUrls) {
    try {
      const html = await getText(url);
      for (const dep of extractDepartmentLinks(html, url)) {
        const key = `${normalizeLabel(dep.name)}|${dep.code}`;
        found.set(key, dep);
        if (/^[A-Z]$/.test(dep.code)) parentCodes.add(dep.code);
      }
    } catch {
      // Continue with the next public page.
    }
  }

  // Parent department pages expose their child departments.
  // The parent codes themselves are discovered from Health160; no local mapping.
  for (const code of parentCodes) {
    const url = `${origin}/search/doctor/cno-${code}/ysort-1/disease_id-0.html`;
    try {
      const html = await getText(url);
      for (const dep of extractDepartmentLinks(html, url)) {
        const key = `${normalizeLabel(dep.name)}|${dep.code}`;
        found.set(key, dep);
      }
    } catch {
      // A single category page failure should not discard the rest.
    }
  }

  return [...found.values()];
}

export async function resolveDepartmentCode(
  citySlug: string,
  departmentName: string,
): Promise<string | null> {
  const target = normalizeLabel(departmentName);
  if (!target) return null;

  const departments = await discoverDepartments(citySlug);

  const exact = departments.find((dep) => normalizeLabel(dep.name) === target);
  if (exact) return exact.code;

  const fuzzy = departments
    .filter((dep) => {
      const name = normalizeLabel(dep.name);
      return name.includes(target) || target.includes(name);
    })
    .sort(
      (a, b) =>
        Math.abs(normalizeLabel(a.name).length - target.length) -
        Math.abs(normalizeLabel(b.name).length - target.length),
    );

  return fuzzy[0]?.code || null;
}

export async function crawlDepartmentDoctors(
  citySlug: string,
  departmentCode: string,
  options: { maxPages?: number; sort?: number } = {},
) {
  const maxPages = Math.max(1, Math.min(options.maxPages || 500, 500));
  const sort = options.sort ?? 1;
  const doctors = new Map<string, Record<string, unknown>>();
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page++) {
    const results = await searchDoctors(citySlug, departmentCode, page, sort);
    pagesFetched = page;

    let newCount = 0;
    for (const doctor of results) {
      const doctorId = String(doctor.doctor_id || "");
      const unitId = String(doctor.unit_id || "");
      const depId = String(doctor.dep_id || "");
      const key = [doctorId, unitId, depId].join(":");
      if (!doctorId || doctors.has(key)) continue;
      doctors.set(key, doctor);
      newCount++;
    }

    // Health160 currently paginates doctor lists. Stop when a page is empty
    // or when pagination no longer yields any new doctor relationship.
    if (results.length === 0 || newCount === 0) break;
  }

  return {
    source: "health160",
    city: citySlug,
    department_code: departmentCode,
    pages_fetched: pagesFetched,
    doctor_count: doctors.size,
    doctors: [...doctors.values()],
  };
}

export async function doctorDetail(docId: string, unitId: string, depId: string) {
  const url = new URL("/h5/register/doctor/detail.html", BASE);
  url.searchParams.set("unit_id", unitId);
  url.searchParams.set("dep_id", depId);
  url.searchParams.set("doc_id", docId);
  url.searchParams.set("type", "guahao");

  const $ = cheerio.load(await getText(url.toString()));

  const hospitalRaw = clean($(".ad-dep-txt").first().text());
  const hospital = hospitalRaw?.replace(/^第一执业/, "").trim() || null;

  const detailItems = $(".part-detail .dp-about")
    .map((_, el) => clean($(el).text()))
    .get()
    .filter(Boolean) as string[];

  const followers = parseNumber(
    detailItems.find((x) => x.startsWith("粉丝"))?.replace(/^粉丝/, ""),
  );
  const serviceCount = parseNumber(
    detailItems.find((x) => x.startsWith("服务"))?.replace(/^服务/, ""),
  );
  const replySpeed =
    detailItems.find((x) => x.startsWith("回复速度"))?.replace(/^回复速度/, "").trim() || null;

  const scoreText = clean($(".part-score .score .s-num").first().text());
  const score = scoreText ? Number(scoreText) : null;

  const avatar = $(".doc-img").first().attr("src") || null;

  return {
    source: "health160",
    source_url: url.toString(),
    doctor_id: docId,
    unit_id: unitId,
    dep_id: depId,
    name: clean($(".np-name").first().text()),
    title: clean($(".step-name").first().text()),
    hospital,
    score: Number.isFinite(score) ? score : null,
    followers,
    service_count: serviceCount,
    reply_speed: replySpeed,
    specialties: $(".part-good-at .gi-item")
      .map((_, el) => clean($(el).text()))
      .get()
      .filter(Boolean),
    avatar_url: avatar ? new URL(avatar, BASE).toString() : null,
  };
}

const STAT_LABELS: Record<string, string> = {
  全部评价: "review_count",
  好评: "positive_count",
  中评: "neutral_count",
  优质评价: "quality_count",
  有图: "image_count",
  医院就诊: "hospital_visit_count",
  免费咨询: "free_consult_count",
  图文咨询: "text_consult_count",
  电话咨询: "phone_consult_count",
  视频咨询: "video_consult_count",
  极速咨询: "fast_consult_count",
  报告解读: "report_count",
  私人医生: "private_doctor_count",
};

function parseStats($: cheerio.CheerioAPI) {
  const text = $.root().text();

  const scoreFor = (label: string): number | null => {
    const match = text.match(new RegExp(`${label}\\s*([0-9]+(?:\\.[0-9]+)?)`));
    return match ? Number(match[1]) : null;
  };

  const stats: Record<string, unknown> = {
    score: scoreFor("综合评分"),
    treatment_score: scoreFor("治疗效果"),
    attitude_score: scoreFor("医生态度"),
  };

  const diseases: Array<{ disease: string; disease_id: string | null; review_count: number }> = [];

  $("a[href]").each((_, el) => {
    const label = clean($(el).text()) || "";
    const match = label.match(/^(.+?)\((\d+)\)$/);
    if (!match) return;

    const [, name, countRaw] = match;
    const count = Number(countRaw);
    const href = new URL($(el).attr("href")!, BASE).toString();

    if (STAT_LABELS[name]) {
      stats[STAT_LABELS[name]] = count;
      return;
    }

    if (href.includes("search_key=ill_id")) {
      diseases.push({
        disease: name,
        disease_id: queryId(href, "search_value"),
        review_count: count,
      });
    }
  });

  stats.diseases = diseases;
  return stats;
}

function parseReviews($: cheerio.CheerioAPI) {
  const results: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  $('img[src*="avatar_user_"]').each((_, img) => {
    let node = $(img).parent();
    for (let i = 0; i < 5; i++) {
      const text = clean(node.text()) || "";
      if (/\d{4}-\d{2}-\d{2}/.test(text) && (text.includes("举报") || text.includes("医生回复"))) break;
      const parent = node.parent();
      if (!parent.length) break;
      node = parent;
    }

    const lines = node
      .text()
      .split(/\n+/)
      .map((x) => clean(x))
      .filter(Boolean) as string[];

    let maskedUser: string | null = null;
    let disease: string | null = null;
    let type: string | null = null;
    let date: string | null = null;
    let doctorReply: string | null = null;
    let likeCount: number | null = null;
    const content: string[] = [];

    for (const line of lines) {
      if (!maskedUser && /^.{1,4}\*{1,3}/.test(line)) {
        maskedUser = line.match(/^.{1,4}\*{1,3}/)?.[0] || line;
        disease = line.slice(maskedUser.length).trim() || null;
        continue;
      }

      const visit = line.match(
        /(医院就诊|免费咨询|图文咨询|电话咨询|视频咨询|极速咨询|报告解读|私人医生)?\s*(\d{4}-\d{2}-\d{2})/,
      );
      if (visit) {
        type = visit[1] || type;
        date = visit[2];
        continue;
      }

      if (line.startsWith("医生回复：")) {
        doctorReply = line.replace(/^医生回复：/, "").trim() || null;
        continue;
      }

      if (line.includes("举报")) {
        const like = line.match(/(\d+)\s*举报/);
        if (like) likeCount = Number(like[1]);
        continue;
      }

      if (
        !["评价", "展开"].includes(line) &&
        !line.startsWith("综合评分") &&
        !line.startsWith("治疗效果") &&
        !line.startsWith("医生态度") &&
        !/^[_\s]+$/.test(line)
      ) {
        content.push(line);
      }
    }

    if (!date) return;
    const body = content.join(" ").trim() || null;
    const key = `${maskedUser}|${date}|${body}`;
    if (seen.has(key)) return;
    seen.add(key);

    results.push({
      masked_user: maskedUser,
      disease,
      type,
      date,
      content: body,
      doctor_reply: doctorReply,
      like_count: likeCount,
    });
  });

  return results;
}

export async function doctorReviews(doctorId: string, page = 1) {
  const url = new URL("/doc/comments", BASE);
  url.searchParams.set("doctor_id", doctorId);
  url.searchParams.set("search_key", "");
  url.searchParams.set("search_value", "0");
  url.searchParams.set("page", String(page));

  const $ = cheerio.load(await getText(url.toString()));

  return {
    source: "health160",
    source_url: url.toString(),
    doctor_id: doctorId,
    page,
    stats: parseStats($),
    reviews: parseReviews($),
  };
}

export async function searchDoctors(
  city: string,
  departmentCode?: string,
  page = 1,
  sort = 1,
) {
  const citySlug = city.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!citySlug) throw new Error("invalid city");

  const parts = [`p-${page}`];
  if (departmentCode) parts.push(`cno-${departmentCode}`);
  parts.push(`ysort-${sort}`, "isopen-1", "disease_id-0");

  const url = `https://${citySlug}.91160.com/search/doctor/${parts.join("/")}.html`;
  const $ = cheerio.load(await getText(url));

  const seen = new Set<string>();
  const results: Array<Record<string, unknown>> = [];

  $("a[href]").each((_, el) => {
    const href = new URL($(el).attr("href")!, url).toString();
    if (
      !href.includes("/doctors/index/") &&
      !href.includes("/doctor/detail") &&
      !href.includes("doc_id=") &&
      !href.includes("docid-")
    ) return;

    const docId =
      queryId(href, "doc_id", "doctor_id") ||
      href.match(/docid-(\d+)/)?.[1] ||
      null;

    if (!docId || seen.has(docId)) return;
    seen.add(docId);

    let container = $(el);
    for (let i = 0; i < 4; i++) {
      const parent = container.parent();
      if (!parent.length) break;
      if ((clean(parent.text()) || "").length >= 20) {
        container = parent;
        break;
      }
      container = parent;
    }

    const summary = clean(container.text()) || "";
    const title = summary.match(/［([^］]+)］/)?.[1] || null;
    const score = summary.match(/([0-9]+(?:\.[0-9]+)?)分/)?.[1];
    const reviewCount = summary.match(/(\d+)人点评/)?.[1];
    const appointmentCount = summary.match(/已预约人次\s*(\d+)/)?.[1];

    results.push({
      doctor_id: docId,
      unit_id: queryId(href, "unit_id"),
      dep_id: queryId(href, "dep_id"),
      name: clean($(el).text()),
      title,
      score: score ? Number(score) : null,
      review_count: reviewCount ? Number(reviewCount) : null,
      appointment_count: appointmentCount ? Number(appointmentCount) : null,
      summary,
      source_url: href,
    });
  });

  return results;
}
