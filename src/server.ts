import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { doctorDetail, doctorReviews, Health160Error, searchDoctors } from "./health160.js";

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true }));

app.get("/health160/doctor", async (c) => {
  const docId = c.req.query("doc_id");
  const unitId = c.req.query("unit_id");
  const depId = c.req.query("dep_id");

  if (!docId || !unitId || !depId) {
    return c.json({ error: "doc_id, unit_id and dep_id are required" }, 400);
  }

  try {
    return c.json(await doctorDetail(docId, unitId, depId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return c.json({ error: message }, error instanceof Health160Error ? 502 : 500);
  }
});

app.get("/health160/reviews", async (c) => {
  const doctorId = c.req.query("doctor_id");
  const page = Number(c.req.query("page") || "1");

  if (!doctorId) return c.json({ error: "doctor_id is required" }, 400);
  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    return c.json({ error: "invalid page" }, 400);
  }

  try {
    return c.json(await doctorReviews(doctorId, page));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return c.json({ error: message }, error instanceof Health160Error ? 502 : 500);
  }
});

app.get("/health160/search", async (c) => {
  const city = c.req.query("city");
  const departmentCode = c.req.query("department_code") || undefined;
  const page = Number(c.req.query("page") || "1");
  const sort = Number(c.req.query("sort") || "1");

  if (!city) return c.json({ error: "city is required" }, 400);

  try {
    return c.json({
      city,
      department_code: departmentCode || null,
      page,
      results: await searchDoctors(city, departmentCode, page, sort),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return c.json({ error: message }, 502);
  }
});

const port = Number(process.env.PORT || 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`BestDoctor listening on http://localhost:${info.port}`);
});
