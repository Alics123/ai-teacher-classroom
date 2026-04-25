import base64
import asyncio
import json

import pytest

from app.ai_client import build_lesson_messages, parse_lesson_response, request_lesson_from_ai


TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2pZ1kAAAAASUVORK5CYII="
)


def test_build_lesson_messages_includes_data_url_and_disable_thinking():
    request = build_lesson_messages(
        image_bytes=TINY_PNG,
        mime_type="image/png",
        model_name="Qwen/Qwen3.6-27B",
    )

    assert request["model"] == "Qwen/Qwen3.6-27B"
    assert request["chat_template_kwargs"] == {"enable_thinking": False}
    assert request["response_format"] == {"type": "json_object"}

    content = request["messages"][1]["content"]
    assert content[0]["type"] == "text"
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_parse_lesson_response_merges_scene_narration_into_full_script():
    raw_response = {
        "choices": [
            {
                "message": {
                    "content": """
                    {
                      "title": "分数加法",
                      "summary": "理解同分母分数相加",
                      "scenes": [
                        {
                          "title": "观察题目",
                          "svg": "<svg viewBox='0 0 200 80'></svg>",
                          "narration": "先看清题目里有两个分数。"
                        },
                        {
                          "title": "统一解释",
                          "svg": "<svg viewBox='0 0 200 80'></svg>",
                          "narration": "因为分母相同，所以只需要相加分子。"
                        }
                      ]
                    }
                    """
                }
            }
        ]
    }

    lesson = parse_lesson_response(raw_response)

    assert lesson.title == "分数加法"
    assert lesson.summary == "理解同分母分数相加"
    assert len(lesson.scenes) == 2
    assert lesson.scenes[0].id == "scene-1"
    assert lesson.scenes[1].id == "scene-2"
    assert "先看清题目里有两个分数。" in lesson.full_narration
    assert "因为分母相同，所以只需要相加分子。" in lesson.full_narration


def test_parse_lesson_response_sanitizes_dangerous_svg_markup():
    raw_response = {
        "choices": [
            {
                "message": {
                    "content": """
                    {
                      "title": "安全测试",
                      "summary": "测试 SVG 清洗",
                      "scenes": [
                        {
                          "title": "危险图",
                          "svg": "<svg onload='alert(1)'><script>alert(1)</script><circle cx='20' cy='20' r='10' /></svg>",
                          "narration": "这是一个圆。"
                        }
                      ]
                    }
                    """
                }
            }
        ]
    }

    lesson = parse_lesson_response(raw_response)

    assert "<script" not in lesson.scenes[0].svg.lower()
    assert "onload=" not in lesson.scenes[0].svg.lower()


def test_parse_lesson_response_accepts_nonstandard_message_content_dict():
    raw_response = {
        "choices": [
            {
                "message": {
                    "content": {
                        "type": "output_text",
                        "text": """
                        {
                          "title": "坐标系",
                          "summary": "先看横轴和纵轴",
                          "scenes": [
                            {
                              "title": "认识坐标轴",
                              "svg": "<svg viewBox='0 0 200 80'></svg>",
                              "narration": "先区分横轴和纵轴。"
                            }
                          ]
                        }
                        """,
                    }
                }
            }
        ]
    }

    lesson = parse_lesson_response(raw_response)

    assert lesson.title == "坐标系"
    assert lesson.scenes[0].title == "认识坐标轴"


def test_parse_lesson_response_repairs_common_bad_json():
    raw_response = {
        "choices": [
            {
                "message": {
                    "content": """
                    {
                      "title": "一次函数",
                      "summary": "观察斜率和截距",
                      "scenes": [
                        {
                          "title": "看图像",
                          "svg": "<svg viewBox='0 0 200 80'></svg>",
                          "narration": "先看图像和坐标轴。",
                        },
                      ],
                    }
                    """
                }
            }
        ]
    }

    lesson = parse_lesson_response(raw_response)

    assert lesson.title == "一次函数"
    assert lesson.scenes[0].narration == "先看图像和坐标轴。"


def test_parse_lesson_response_includes_finish_reason_for_truncated_json():
    raw_response = {
        "choices": [
            {
                "finish_reason": "length",
                "message": {
                    "content": """
                    {
                      "title": "截断响应",
                      "summary": "输出被截断",
                      "scenes": [
                    """
                },
            }
        ]
    }

    with pytest.raises(ValueError, match=r"finish_reason=length"):
        parse_lesson_response(raw_response)


def test_parse_lesson_response_strips_external_href_and_unsafe_svg_tags():
    raw_response = {
        "choices": [
            {
                "message": {
                    "content": """
                    {
                      "title": "SVG 安全",
                      "summary": "去掉不安全和不稳定内容",
                      "scenes": [
                        {
                          "title": "保留内部引用",
                          "svg": "<svg viewBox='0 0 200 80' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'><defs><g id='dot'><circle cx='12' cy='12' r='8' /></g></defs><use href='#dot' /><use href='https://evil.example/dot.svg#dot' /><image xlink:href='http://evil.example/pic.png' width='10' height='10' /><foreignObject><div>bad</div></foreignObject><iframe src='https://evil.example/embed'></iframe></svg>",
                          "narration": "只保留稳定 SVG。"
                        }
                      ]
                    }
                    """
                }
            }
        ]
    }

    lesson = parse_lesson_response(raw_response)
    svg = lesson.scenes[0].svg.lower()

    assert "foreignobject" not in svg
    assert "<iframe" not in svg
    assert "evil.example" not in svg
    assert "href=\"#dot\"" in lesson.scenes[0].svg or "href='#dot'" in lesson.scenes[0].svg


def test_request_lesson_from_ai_retries_with_compact_payload_when_first_parse_fails(monkeypatch):
    requests = []

    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, headers=None, json=None):
            requests.append({
                "url": url,
                "headers": headers,
                "json": json,
            })
            if len(requests) == 1:
                return FakeResponse(
                    {
                        "choices": [
                            {
                                "finish_reason": "stop",
                                "message": {
                                    "content": "这不是 JSON，只是一段普通讲解。",
                                },
                            }
                        ]
                    }
                )
            return FakeResponse(
                {
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {
                                "content": json_module_dumps(
                                    {
                                        "title": "补救成功",
                                        "summary": "第二次请求拿到了结构化结果",
                                        "scenes": [
                                            {
                                                "title": "第一步",
                                                "svg": "<svg viewBox='0 0 200 80'></svg>",
                                                "narration": "先看题目。",
                                            }
                                        ],
                                    }
                                ),
                            },
                        }
                    ]
                }
            )

    def json_module_dumps(payload):
        return json.dumps(payload, ensure_ascii=False)

    monkeypatch.setattr("app.ai_client.httpx.AsyncClient", FakeAsyncClient)

    lesson = asyncio.run(
        request_lesson_from_ai(
            image_bytes=TINY_PNG,
            mime_type="image/png",
        )
    )

    assert lesson.title == "补救成功"
    assert len(requests) == 2
    assert requests[1]["json"]["max_tokens"] < requests[0]["json"]["max_tokens"]
    assert requests[1]["json"]["temperature"] <= requests[0]["json"]["temperature"]
