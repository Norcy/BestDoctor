import assert from "node:assert/strict";
import test from "node:test";
import {
  crawlDepartmentDoctors,
  discoverCities,
  discoverDepartments,
  resolveCitySlug,
  resolveDepartmentCode,
  searchDoctors,
} from "../src/health160.js";

type Route = { match: (url: string) => boolean; body: string; status?: number };

const cityHtml = `
<html><body>
  <a href="https://sz.91160.com/">深圳</a>
  <a href="https://gz.91160.com/">广州</a>
  <a href="https://bj.91160.com/">北京</a>
  <a href="https://sh.91160.com/">上海</a>
  <a href="https://cd.91160.com/">成都</a>
  <a href="https://wh.91160.com/">武汉</a>
  <a href="https://hz.91160.com/">杭州</a>
  <a href="https://nj.91160.com/">南京</a>
  <a href="https://xa.91160.com/">西安</a>
  <a href="https://su.91160.com/">苏州</a>
  <a href="https://user.91160.com/">登录</a>
</body></html>`;

const departmentHtml = `
<html><body>
  <a href="/search/doctor/cno-A/ysort-1/disease_id-0.html">内科</a>
  <a href="/search/doctor/cno-A05/ysort-1/disease_id-0.html">神经内科</a>
  <a href="/search/doctor/cno-A03/ysort-1/disease_id-0.html">消化内科</a>
  <a href="/search/doctor/cno-A02/ysort-1/disease_id-0.html">心血管内科</a>
  <a href="/search/doctor/cno-A05/ysort-1/disease_id-0.html">神经内科</a>
  <a href="/search/doctor/cno-A/ysort-1/disease_id-0.html">更多</a>
</body></html>`;

function doctorPage(doctors: Array<{
  id: string;
  unit: string;
  dep: string;
  name: string;
  title?: string;
  score?: string;
  reviews?: string;
  appointments?: string;
}>) {
  return `<html><body>${doctors.map((d) => `
    <div class="doctor-card">
      <a href="https://weixin.91160.com/h5/register/doctor/detail.html?unit_id=${d.unit}&dep_id=${d.dep}&doc_id=${d.id}&type=guahao">${d.name}</a>
      <span>［${d.title || "主任医师"}］</span>
      <span>${d.score || "9.8"}分</span>
      <span>${d.reviews || "12"}人点评</span>
      <span>已预约人次 ${d.appointments || "100"}</span>
    </div>`).join("")}</body></html>`;
}

const routes: Route[] = [
  { match: (u) => u === "https://www.91160.com/", body: cityHtml },
  { match: (u) => u.includes("sz.91160.com/search/doctor/ysort-1/disease_id-0.html"), body: departmentHtml },
  { match: (u) => u.includes("sz.91160.com/search/doctor/cno-A/ysort-1/disease_id-0.html"), body: departmentHtml },
  {
    match: (u) => u.includes("sz.91160.com/search/doctor/p-1/cno-A05/"),
    body: doctorPage([
      { id: "101", unit: "11", dep: "501", name: "张医生", reviews: "20" },
      { id: "102", unit: "12", dep: "502", name: "李医生", reviews: "30" },
    ]),
  },
  {
    match: (u) => u.includes("sz.91160.com/search/doctor/p-2/cno-A05/"),
    body: doctorPage([
      { id: "102", unit: "12", dep: "502", name: "李医生", reviews: "30" },
      { id: "103", unit: "13", dep: "503", name: "王医生", reviews: "40" },
    ]),
  },
  {
    match: (u) => u.includes("sz.91160.com/search/doctor/p-3/cno-A05/"),
    body: doctorPage([
      { id: "103", unit: "13", dep: "503", name: "王医生", reviews: "40" },
    ]),
  },
  {
    match: (u) => u.includes("sz.91160.com/search/doctor/p-4/cno-A05/"),
    body: "<html><body></body></html>",
  },
];

const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const route = routes.find((r) => r.match(url));
  if (!route) {
    return new Response("not found: " + url, { status: 404 });
  }
  return new Response(route.body, {
    status: route.status || 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}) as typeof fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("discoverCities dynamically parses Health160 city navigation", async () => {
  const cities = await discoverCities();
  assert.ok(cities.length >= 10);
  assert.deepEqual(
    cities.find((x) => x.name === "深圳"),
    { name: "深圳", slug: "sz", href: "https://sz.91160.com/" },
  );
  assert.equal(cities.some((x) => x.slug === "user"), false);
});

test("resolveCitySlug does not need a static city map", async () => {
  assert.equal(await resolveCitySlug("深圳"), "sz");
  assert.equal(await resolveCitySlug("深圳市"), "sz");
});

test("discoverDepartments dynamically parses cno codes and deduplicates", async () => {
  const deps = await discoverDepartments("sz");
  assert.ok(deps.some((x) => x.name === "神经内科" && x.code === "A05"));
  assert.ok(deps.some((x) => x.name === "消化内科" && x.code === "A03"));
  assert.equal(
    deps.filter((x) => x.name === "神经内科" && x.code === "A05").length,
    1,
  );
  assert.equal(deps.some((x) => x.name === "更多"), false);
});

test("resolveDepartmentCode resolves exact and normalized names", async () => {
  assert.equal(await resolveDepartmentCode("sz", "神经内科"), "A05");
  assert.equal(await resolveDepartmentCode("sz", "神经内科门诊"), "A05");
});

test("searchDoctors parses IDs and public list statistics", async () => {
  const doctors = await searchDoctors("sz", "A05", 1, 1);
  assert.equal(doctors.length, 2);
  assert.deepEqual(
    {
      doctor_id: doctors[0].doctor_id,
      unit_id: doctors[0].unit_id,
      dep_id: doctors[0].dep_id,
      name: doctors[0].name,
      review_count: doctors[0].review_count,
      appointment_count: doctors[0].appointment_count,
    },
    {
      doctor_id: "101",
      unit_id: "11",
      dep_id: "501",
      name: "张医生",
      review_count: 20,
      appointment_count: 100,
    },
  );
});

test("crawlDepartmentDoctors walks pages and deduplicates doctor relationships", async () => {
  const result = await crawlDepartmentDoctors("sz", "A05", { maxPages: 10 });

  assert.equal(result.pages_fetched, 3);
  assert.equal(result.doctor_count, 3);
  assert.deepEqual(
    result.doctors.map((x) => x.doctor_id),
    ["101", "102", "103"],
  );
});

test("crawlDepartmentDoctors respects maxPages", async () => {
  const result = await crawlDepartmentDoctors("sz", "A05", { maxPages: 1 });
  assert.equal(result.pages_fetched, 1);
  assert.equal(result.doctor_count, 2);
});
