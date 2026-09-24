from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.utc_datetimes import append_utc_suffix


def install_middleware(app):
    @app.middleware("http")
    async def normalize_utc_datetimes_middleware(request, call_next):
        from starlette.responses import Response

        response = await call_next(request)
        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type.lower():
            return response
        body_parts = []
        if hasattr(response, "body"):
            body_parts.append(response.body())
        elif hasattr(response, "body_iterator"):
            async for chunk in response.body_iterator:
                body_parts.append(chunk)
        if not body_parts:
            return response
        original_body = b"".join(body_parts)
        normalized = append_utc_suffix(original_body)
        if normalized is None:
            normalized = original_body
        headers = dict(response.headers)
        headers.pop("content-length", None)
        return Response(
            status_code=response.status_code,
            headers=headers,
            media_type=response.media_type,
            content=normalized,
        )

    return app


def test_naive_utc_dt_gets_z_suffix():
    raw = b'{"created_at": "2026-09-24T10:30:00", "flag": "active"}'
    out = append_utc_suffix(raw)
    assert out is not None
    assert out == b'{"created_at":"2026-09-24T10:30:00Z","flag":"active"}'


def test_fractional_naive_dt_gets_z_suffix():
    raw = b'{"ts": "2026-09-24T10:30:00.123456"}'
    out = append_utc_suffix(raw)
    assert out == b'{"ts":"2026-09-24T10:30:00.123456Z"}'


def test_aware_datetimes_and_plain_strings_untouched():
    raw = b'{"a": "2026-09-24T10:30:00Z", "b": "2026-09-24T10:30:00+05:30", "c": "Registered 2026-09-24T10:30:00 now", "d": "2026-09-24", "e": 5}'
    assert append_utc_suffix(raw) is None


def test_noop_when_no_timestamp_in_body():
    assert append_utc_suffix(b'{"status": "ok"}') is None


def test_middleware_appends_z_to_real_api_response():
    app = FastAPI()
    install_middleware(app)

    @app.get("/org")
    def org():
        return {"created_at": datetime(2026, 9, 24, 10, 30, 0), "name": "Acme"}

    client = TestClient(app)
    res = client.get("/org")
    assert res.status_code == 200
    assert res.json()["created_at"] == "2026-09-24T10:30:00Z"
    assert res.json()["name"] == "Acme"


def test_middleware_leaves_non_json_responses_alone():
    app = FastAPI()
    install_middleware(app)

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    client = TestClient(app)
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.text == '{"status":"ok"}'