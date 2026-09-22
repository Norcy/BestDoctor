from fastapi import FastAPI, HTTPException, Query

from .health160 import Health160Error, doctor_detail, doctor_reviews, search_doctors


app = FastAPI(
    title="BestDoctor PoC",
    version="0.1.0",
    description="Lightweight real-time doctor data adapter. No persistent database.",
)


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.get("/health160/doctor")
async def get_doctor(
    doc_id: str,
    unit_id: str,
    dep_id: str,
):
    try:
        return await doctor_detail(doc_id, unit_id, dep_id)
    except Health160Error as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/health160/reviews")
async def get_reviews(
    doctor_id: str,
    page: int = Query(default=1, ge=1, le=1000),
):
    try:
        return await doctor_reviews(doctor_id, page)
    except Health160Error as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/health160/search")
async def search(
    city: str = Query(description="91160 city subdomain, e.g. sz, gz, bj"),
    department_code: str | None = Query(default=None, description="91160 cno code, e.g. A05"),
    page: int = Query(default=1, ge=1, le=500),
    sort: int = Query(default=1, ge=0, le=3),
):
    try:
        return {
            "city": city,
            "department_code": department_code,
            "page": page,
            "results": await search_doctors(city, department_code, page, sort),
        }
    except (Health160Error, ValueError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
