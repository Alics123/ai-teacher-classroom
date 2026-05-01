import base64
from types import SimpleNamespace

import httpx
from fastapi.testclient import TestClient

from app.main import app


TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2pZ1kAAAAASUVORK5CYII="
)


def test_root_route_exposes_app_metadata():
    client = TestClient(app)

    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["app"] == "AI Teacher Classroom"


def test_generate_lesson_endpoint_returns_structured_payload(monkeypatch):
    client = TestClient(app)

    fake_result = {
        "title": "三角形面积",
        "summary": "用底乘高除以二",
        "lessonOverview": {"subject": "math", "topic": "triangle_area"},
        "problemAnalysis": {"subject": "math", "topic": "triangle_area"},
        "studentDiagnosis": {"studentLevel": "beginner"},
        "teachingPlan": {"lessonGoal": "learn triangle area"},
        "qualityCheck": {"pass": True},
        "finalSummary": {"memoryTip": "底乘高除以二"},
        "fullNarration": "第一步先找到底和高。",
        "scenes": [
            {
                "id": "scene-1",
                "title": "识别图形",
                "purpose": "introduce the problem",
                "visualGoal": "focus on triangle",
                "layout": {"center": "question"},
                "visualElements": [],
                "animationOrder": ["show_question"],
                "svg": "<svg viewBox='0 0 320 180'></svg>",
                "narration": "第一步先找到底和高。",
            }
        ],
        "sceneScripts": [
            {
                "sceneId": 1,
                "voiceScriptSegments": [
                    {"text": "第一步先找到底和高。", "tone": "guiding", "pauseAfter": True}
                ],
            }
        ],
    }

    async def fake_generate_lesson(*_args, **_kwargs):
        return fake_result

    monkeypatch.setattr("app.main.generate_lesson_from_upload", fake_generate_lesson)

    response = client.post(
        "/api/lesson/generate",
        files={"file": ("triangle.png", TINY_PNG, "image/png")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "三角形面积"
    assert data["stage"] == "completed"
    assert data["progress"] == 1
    assert data["detail"]
    assert data["scenes"][0]["id"] == "scene-1"
    assert data["fullNarration"] == "第一步先找到底和高。"


def test_generate_lesson_endpoint_rejects_non_image_upload():
    client = TestClient(app)

    response = client.post(
        "/api/lesson/generate",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "invalid_upload_type"
    assert "图片" in data["error"]["message"]


def test_generate_lesson_endpoint_returns_readable_json_when_ai_unreachable(monkeypatch):
    client = TestClient(app)

    async def fake_request_lesson_from_ai(*_args, **_kwargs):
        request = httpx.Request("POST", "http://127.0.0.1:9109/v1/chat/completions")
        raise httpx.ConnectError("connection refused", request=request)

    monkeypatch.setattr("app.services.request_lesson_from_ai", fake_request_lesson_from_ai)

    response = client.post(
        "/api/lesson/generate",
        files={"file": ("triangle.png", TINY_PNG, "image/png")},
    )

    assert response.status_code == 503
    data = response.json()
    assert data["error"]["code"] == "ai_service_unreachable"
    assert "AI" in data["error"]["message"]


def test_generate_lesson_endpoint_returns_readable_json_for_upstream_http_error(monkeypatch):
    client = TestClient(app)

    async def fake_request_lesson_from_ai(*_args, **_kwargs):
        request = httpx.Request("POST", "http://127.0.0.1:9109/v1/chat/completions")
        response = httpx.Response(502, request=request, json={"error": "bad gateway"})
        raise httpx.HTTPStatusError("bad gateway", request=request, response=response)

    monkeypatch.setattr("app.services.request_lesson_from_ai", fake_request_lesson_from_ai)

    response = client.post(
        "/api/lesson/generate",
        files={"file": ("triangle.png", TINY_PNG, "image/png")},
    )

    assert response.status_code == 502
    data = response.json()
    assert data["error"]["code"] == "ai_upstream_http_error"
    assert "上游" in data["error"]["message"]


def test_generate_lesson_endpoint_returns_specific_message_for_invalid_image_payload(monkeypatch):
    client = TestClient(app)

    async def fake_request_lesson_from_ai(*_args, **_kwargs):
        request = httpx.Request("POST", "http://127.0.0.1:9109/v1/chat/completions")
        response = httpx.Response(
            400,
            request=request,
            text='{"error":{"message":"cannot identify image file <_io.BytesIO object>"}}',
        )
        raise httpx.HTTPStatusError("bad request", request=request, response=response)

    monkeypatch.setattr("app.services.request_lesson_from_ai", fake_request_lesson_from_ai)

    response = client.post(
        "/api/lesson/generate",
        files={"file": ("triangle.png", TINY_PNG, "image/png")},
    )

    assert response.status_code == 502
    data = response.json()
    assert data["error"]["code"] == "ai_upstream_http_error"
    assert "无法识别" in data["error"]["message"]


def test_generate_lesson_endpoint_returns_readable_json_for_ai_parse_error(monkeypatch):
    client = TestClient(app)

    async def fake_request_lesson_from_ai(*_args, **_kwargs):
        raise ValueError("AI 返回的课程结构无法解析")

    monkeypatch.setattr("app.services.request_lesson_from_ai", fake_request_lesson_from_ai)

    response = client.post(
        "/api/lesson/generate",
        files={"file": ("triangle.png", TINY_PNG, "image/png")},
    )

    assert response.status_code == 502
    data = response.json()
    assert data["error"]["code"] == "ai_response_parse_error"
    assert "解析" in data["error"]["message"]


def test_generate_lesson_endpoint_rejects_empty_image_upload():
    client = TestClient(app)

    response = client.post(
        "/api/lesson/generate",
        files={"file": ("empty.png", b"", "image/png")},
    )

    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "empty_upload"
    assert "为空" in data["error"]["message"]


def test_generate_lesson_endpoint_rejects_oversized_image_upload(monkeypatch):
    client = TestClient(app)
    monkeypatch.setattr("app.services.settings", SimpleNamespace(max_upload_megabytes=0))

    response = client.post(
        "/api/lesson/generate",
        files={"file": ("huge.png", TINY_PNG, "image/png")},
    )

    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "image_too_large"
    assert "不能超过" in data["error"]["message"]
