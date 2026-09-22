from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode, urljoin, urlparse, parse_qs

import httpx
from bs4 import BeautifulSoup
from cachetools import TTLCache


BASE = "https://weixin.91160.com"
WEB_BASE = "https://www.91160.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 "
        "Mobile/15E148 Safari/604.1"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

_page_cache: TTLCache[str, str] = TTLCache(maxsize=512, ttl=600)


class Health160Error(RuntimeError):
    pass


async def _get_text(url: str) -> str:
    cached = _page_cache.get(url)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(
        headers=HEADERS,
        timeout=12.0,
        follow_redirects=True,
    ) as client:
        response = await client.get(url)

    if response.status_code != 200:
        raise Health160Error(f"health160 returned HTTP {response.status_code}")

    text = response.text
    if "安全验证" in text and "拖动下方拼图" in text:
        # The page can still contain useful server-rendered content.
        # We intentionally do not attempt to bypass the verification.
        pass

    _page_cache[url] = text
    return text


def _clean(text: str | None) -> str | None:
    if text is None:
        return None
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def _number(text: str | None) -> int | float | None:
    if not text:
        return None
    raw = text.strip().lower().replace(",", "")
    m = re.search(r"(\d+(?:\.\d+)?)\s*([kw万]?)", raw)
    if not m:
        return None
    value = float(m.group(1))
    suffix = m.group(2)
    if suffix in {"k"}:
        value *= 1_000
    elif suffix in {"w", "万"}:
        value *= 10_000
    return int(value) if value.is_integer() else value


def _query_id(url: str, *keys: str) -> str | None:
    qs = parse_qs(urlparse(url).query)
    for key in keys:
        values = qs.get(key)
        if values:
            return values[0]
    return None


async def doctor_detail(doc_id: str, unit_id: str, dep_id: str) -> dict[str, Any]:
    query = urlencode(
        {
            "unit_id": unit_id,
            "dep_id": dep_id,
            "doc_id": doc_id,
            "type": "guahao",
        }
    )
    url = f"{BASE}/h5/register/doctor/detail.html?{query}"
    html = await _get_text(url)
    soup = BeautifulSoup(html, "lxml")

    name = _clean(soup.select_one(".np-name").get_text(" ", strip=True)) if soup.select_one(".np-name") else None
    title = _clean(soup.select_one(".step-name").get_text(" ", strip=True)) if soup.select_one(".step-name") else None

    hospital = None
    hospital_el = soup.select_one(".ad-dep-txt")
    if hospital_el:
        hospital = _clean(hospital_el.get_text(" ", strip=True))
        if hospital and hospital.startswith("第一执业"):
            hospital = hospital.removeprefix("第一执业").strip()

    score = None
    score_el = soup.select_one(".part-score .score .s-num")
    if score_el:
        try:
            score = float(score_el.get_text(strip=True))
        except ValueError:
            pass

    followers = None
    services = None
    reply_speed = None
    for el in soup.select(".part-detail .dp-about"):
        text = _clean(el.get_text(" ", strip=True)) or ""
        if text.startswith("粉丝"):
            followers = _number(text.replace("粉丝", "", 1))
        elif text.startswith("服务"):
            services = _number(text.replace("服务", "", 1))
        elif text.startswith("回复速度"):
            reply_speed = text.replace("回复速度", "", 1).strip() or None

    specialties = [
        x for x in (_clean(el.get_text(" ", strip=True)) for el in soup.select(".part-good-at .gi-item")) if x
    ]

    avatar = None
    avatar_el = soup.select_one(".doc-img")
    if avatar_el and avatar_el.get("src"):
        avatar = urljoin(BASE, avatar_el["src"])

    return {
        "source": "health160",
        "source_url": str(url),
        "doctor_id": str(doc_id),
        "unit_id": str(unit_id),
        "dep_id": str(dep_id),
        "name": name,
        "title": title,
        "hospital": hospital,
        "score": score,
        "followers": followers,
        "service_count": services,
        "reply_speed": reply_speed,
        "specialties": specialties,
        "avatar_url": avatar,
    }


_STAT_LABELS = {
    "全部评价": "review_count",
    "好评": "positive_count",
    "中评": "neutral_count",
    "优质评价": "quality_count",
    "有图": "image_count",
    "医院就诊": "hospital_visit_count",
    "免费咨询": "free_consult_count",
    "图文咨询": "text_consult_count",
    "电话咨询": "phone_consult_count",
    "视频咨询": "video_consult_count",
    "极速咨询": "fast_consult_count",
    "报告解读": "report_count",
    "私人医生": "private_doctor_count",
}


def _parse_comment_stats(soup: BeautifulSoup) -> dict[str, Any]:
    text = soup.get_text("\n", strip=True)

    out: dict[str, Any] = {
        "score": None,
        "treatment_score": None,
        "attitude_score": None,
    }
    for label, key in [
        ("综合评分", "score"),
        ("治疗效果", "treatment_score"),
        ("医生态度", "attitude_score"),
    ]:
        m = re.search(rf"{label}\s*([0-9]+(?:\.[0-9]+)?)", text)
        if m:
            out[key] = float(m.group(1))

    disease_stats: list[dict[str, Any]] = []
    for a in soup.find_all("a", href=True):
        label = _clean(a.get_text(" ", strip=True)) or ""
        m = re.fullmatch(r"(.+?)\((\d+)\)", label)
        if not m:
            continue
        name, count_raw = m.groups()
        count = int(count_raw)

        if name in _STAT_LABELS:
            out[_STAT_LABELS[name]] = count
            continue

        href = urljoin(BASE, a["href"])
        if "search_key=ill_id" in href:
            disease_stats.append(
                {
                    "disease": name,
                    "disease_id": _query_id(href, "search_value"),
                    "review_count": count,
                }
            )

    out["diseases"] = disease_stats
    return out


def _parse_reviews(soup: BeautifulSoup) -> list[dict[str, Any]]:
    reviews: list[dict[str, Any]] = []

    # User avatars are a stable anchor in the current server-rendered review page.
    for img in soup.find_all("img", src=re.compile(r"avatar_user_\d+\.jpg")):
        container = img.parent
        for _ in range(4):
            if container is None:
                break
            text = _clean(container.get_text("\n", strip=True)) or ""
            if re.search(r"\d{4}-\d{2}-\d{2}", text) and ("举报" in text or "医生回复" in text):
                break
            container = container.parent

        if container is None:
            continue

        lines = [
            _clean(x) for x in container.get_text("\n", strip=True).split("\n")
        ]
        lines = [x for x in lines if x]

        date = None
        review_type = None
        user = None
        disease = None
        content_lines: list[str] = []
        doctor_reply = None
        likes = None

        for line in lines:
            if user is None and re.match(r"^.{1,4}\*{1,3}", line):
                user = line
                tail = re.sub(r"^.{1,4}\*{1,3}", "", line).strip()
                disease = tail or None
                continue

            m = re.search(
                r"(医院就诊|免费咨询|图文咨询|电话咨询|视频咨询|极速咨询|报告解读|私人医生)?\s*(\d{4}-\d{2}-\d{2})",
                line,
            )
            if m:
                review_type = m.group(1) or review_type
                date = m.group(2)
                continue

            if line.startswith("医生回复："):
                doctor_reply = line.removeprefix("医生回复：").strip() or None
                continue

            if "举报" in line:
                m_like = re.search(r"(\d+)\s*举报", line)
                if m_like:
                    likes = int(m_like.group(1))
                continue

            if (
                line not in {"评价", "展开"}
                and not line.startswith("综合评分")
                and not line.startswith("治疗效果")
                and not line.startswith("医生态度")
                and not re.fullmatch(r"[_\s]+", line)
            ):
                content_lines.append(line)

        content = " ".join(content_lines).strip() or None
        key = (user, date, content)
        if date and key not in {(r.get("masked_user"), r.get("date"), r.get("content")) for r in reviews}:
            reviews.append(
                {
                    "masked_user": user,
                    "disease": disease,
                    "type": review_type,
                    "date": date,
                    "content": content,
                    "doctor_reply": doctor_reply,
                    "like_count": likes,
                }
            )

    return reviews


async def doctor_reviews(doctor_id: str, page: int = 1) -> dict[str, Any]:
    url = f"{BASE}/doc/comments?{urlencode({'doctor_id': doctor_id, 'search_key': '', 'search_value': 0, 'page': page})}"
    html = await _get_text(url)
    soup = BeautifulSoup(html, "lxml")

    return {
        "source": "health160",
        "source_url": url,
        "doctor_id": doctor_id,
        "page": page,
        "stats": _parse_comment_stats(soup),
        "reviews": _parse_reviews(soup),
    }


async def search_doctors(
    city: str,
    department_code: str | None = None,
    page: int = 1,
    sort: int = 1,
) -> list[dict[str, Any]]:
    city = re.sub(r"[^a-z0-9-]", "", city.lower())
    if not city:
        raise ValueError("invalid city")

    path = "/search/doctor/"
    parts = [f"p-{page}"]
    if department_code:
        parts.append(f"cno-{department_code}")
    parts.extend([f"ysort-{sort}", "isopen-1", "disease_id-0"])
    url = f"https://{city}.91160.com{path}{'/'.join(parts)}.html"

    html = await _get_text(url)
    soup = BeautifulSoup(html, "lxml")

    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    for a in soup.find_all("a", href=True):
        href = urljoin(url, a["href"])
        if not (
            "/doctors/index/" in href
            or "/doctor/detail" in href
            or "doc_id=" in href
            or "docid-" in href
        ):
            continue

        doc_id = _query_id(href, "doc_id", "doctor_id")
        if not doc_id:
            m = re.search(r"docid-(\d+)", href)
            if m:
                doc_id = m.group(1)
        if not doc_id or doc_id in seen:
            continue

        seen.add(doc_id)
        container = a
        for _ in range(4):
            parent = container.parent
            if parent is None:
                break
            parent_text = _clean(parent.get_text(" ", strip=True)) or ""
            if len(parent_text) >= 20:
                container = parent
                break
            container = parent

        text = _clean(container.get_text(" ", strip=True)) or ""
        title_match = re.search(r"［([^］]+)］", text)
        score_match = re.search(r"([0-9]+(?:\.[0-9]+)?)分", text)
        review_match = re.search(r"(\d+)人点评", text)
        appt_match = re.search(r"已预约人次\s*(\d+)", text)

        results.append(
            {
                "doctor_id": doc_id,
                "unit_id": _query_id(href, "unit_id"),
                "dep_id": _query_id(href, "dep_id"),
                "name": _clean(a.get_text(" ", strip=True)),
                "title": title_match.group(1) if title_match else None,
                "score": float(score_match.group(1)) if score_match else None,
                "review_count": int(review_match.group(1)) if review_match else None,
                "appointment_count": int(appt_match.group(1)) if appt_match else None,
                "summary": text,
                "source_url": href,
            }
        )

    return results
