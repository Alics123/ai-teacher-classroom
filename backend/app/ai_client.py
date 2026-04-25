import ast
import base64
import json
import re
from typing import Any
from xml.etree import ElementTree as ET

import httpx

from .config import settings
from .models import LessonResult, LessonScene


LESSON_SYSTEM_PROMPT = """
你是一名耐心的小学到大学通用数学老师。
请读取学生上传的图片内容，生成一份适合网页展示的讲解 JSON。

必须满足：
1. 只输出 JSON，不要输出 markdown、解释、代码块。
2. JSON 顶层字段固定为 title、summary、scenes。
3. scenes 必须是数组，包含 2 到 4 个元素。
4. 每个 scene 必须有 title、svg、narration。
5. svg 必须是完整、可直接渲染的单个 <svg>...</svg> 字符串，使用 viewBox，禁止脚本。
6. narration 是老师口吻的中文讲解，和当前 svg 一一对应。
7. 内容要围绕图片里的数学知识点，解释清晰、简洁、适合语音朗读。
""".strip()
LESSON_COMPACT_SYSTEM_PROMPT = """
你是一名耐心的数学老师，但这次必须极度简洁。
请读取学生上传的图片内容，并严格输出一个可解析的 JSON。

必须满足：
1. 只输出 JSON。
2. 顶层字段固定为 title、summary、scenes。
3. scenes 最多 2 个。
4. 每个 scene 只允许包含 title、svg、narration。
5. svg 必须非常简洁，只保留最基础图形和文字，不要复杂细节。
6. narration 每段控制在 2 句以内。
7. 不要逐字抄录整张试卷，只概括最核心的知识点或题目切入点。
""".strip()
_SVG_NS = "http://www.w3.org/2000/svg"
_XLINK_NS = "http://www.w3.org/1999/xlink"
_TRAILING_COMMA_RE = re.compile(r",(\s*[}\]])")
_UNSAFE_TAG_RE = re.compile(
    r"<\s*(script|style|foreignObject|iframe|object|embed|audio|video|canvas)\b[^>]*(?:/>|>.*?<\s*/\s*\1\s*>)",
    re.IGNORECASE | re.DOTALL,
)
_EVENT_ATTR_RE = re.compile(r"\s+on[a-zA-Z-]+\s*=\s*(['\"]).*?\1", re.IGNORECASE | re.DOTALL)
_EXTERNAL_HREF_RE = re.compile(r"\s+(href|xlink:href)\s*=\s*(['\"])\s*(?!#).*?\2", re.IGNORECASE | re.DOTALL)
_UNSAFE_SVG_TAGS = {"script", "style", "foreignobject", "iframe", "object", "embed", "audio", "video", "canvas"}

ET.register_namespace("", _SVG_NS)
ET.register_namespace("xlink", _XLINK_NS)


def build_lesson_messages(
    *,
    image_bytes: bytes,
    mime_type: str,
    model_name: str,
    compact_mode: bool = False,
) -> dict[str, Any]:
    encoded_image = base64.b64encode(image_bytes).decode("ascii")
    if compact_mode:
        prompt = (
            "上一轮没有稳定输出 JSON。"
            "这一次请只保留最核心的 1 到 2 个讲解步骤，"
            "返回最短、最稳定的 JSON 结果。"
        )
        system_prompt = LESSON_COMPACT_SYSTEM_PROMPT
        temperature = 0
        max_tokens = 1200
    else:
        prompt = (
            "请根据这张图片生成教学内容。"
            "如果图里是数学题，就分步骤解释题目与解法；"
            "如果图里是图形或公式，就解释关键概念与计算过程。"
        )
        system_prompt = LESSON_SYSTEM_PROMPT
        temperature = 0.2
        max_tokens = 2200
    return {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{encoded_image}",
                        },
                    },
                ],
            },
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "chat_template_kwargs": {"enable_thinking": False},
    }


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _collect_text_parts(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, dict):
        if "scenes" in value and ("title" in value or "summary" in value):
            return [json.dumps(value, ensure_ascii=False)]
        parts: list[str] = []
        for key in ("text", "value", "content", "json", "output_text", "reasoning"):
            parts.extend(_collect_text_parts(value.get(key)))
        return parts
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            parts.extend(_collect_text_parts(item))
        return parts
    return []


def _extract_message_text(raw_response: dict[str, Any]) -> tuple[str, str]:
    choices = raw_response.get("choices") or []
    if not choices:
        raise ValueError("AI 返回为空")
    choice = choices[0] or {}
    message = choice.get("message") or {}
    finish_reason = _normalize_text(choice.get("finish_reason"))
    text_parts: list[str] = []
    for candidate in (
        message.get("content"),
        choice.get("text"),
        message.get("reasoning"),
        message.get("reasoning_content"),
    ):
        text_parts.extend(_collect_text_parts(candidate))
    text = "\n".join(part for part in text_parts if part).strip()
    if text:
        return text, finish_reason
    if finish_reason:
        raise ValueError(f"AI 没有返回可解析内容，finish_reason={finish_reason}")
    raise ValueError("AI 没有返回可解析内容")


def _extract_json_slice(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return ""
    return text[start : end + 1]


def _repair_json_text(text: str) -> str:
    repaired = (
        text.replace("\ufeff", "")
        .replace("“", '"')
        .replace("”", '"')
        .replace("‘", "'")
        .replace("’", "'")
    )
    while True:
        updated = _TRAILING_COMMA_RE.sub(r"\1", repaired)
        if updated == repaired:
            return updated.strip()
        repaired = updated


def _extract_json_block(text: str, *, finish_reason: str = "") -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
    candidates: list[str] = []
    for candidate in (cleaned, _extract_json_slice(cleaned)):
        if candidate and candidate not in candidates:
            candidates.append(candidate)
        repaired = _repair_json_text(candidate)
        if repaired and repaired not in candidates:
            candidates.append(repaired)

    last_error: Exception | None = None
    for candidate in candidates:
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError as exc:
            last_error = exc
        else:
            if isinstance(payload, dict):
                return payload
        try:
            payload = ast.literal_eval(candidate)
        except (SyntaxError, ValueError) as exc:
            last_error = exc
        else:
            if isinstance(payload, dict):
                return payload

    detail = f"，finish_reason={finish_reason}" if finish_reason else ""
    raise ValueError(f"AI 返回的 JSON 无法解析{detail}") from last_error


def _fallback_svg(scene_title: str, index: int) -> str:
    safe_title = (scene_title or f"步骤 {index}").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        "<svg viewBox='0 0 320 180' xmlns='http://www.w3.org/2000/svg'>"
        "<rect x='0' y='0' width='320' height='180' rx='18' fill='#f5f5f7'/>"
        "<rect x='18' y='18' width='284' height='144' rx='14' fill='white' stroke='#0071e3' stroke-width='3'/>"
        f"<text x='160' y='92' text-anchor='middle' font-size='20' fill='#1d1d1f'>{safe_title}</text>"
        "</svg>"
    )


def _svg_local_name(name: str) -> str:
    if "}" in name:
        return name.rsplit("}", maxsplit=1)[-1].lower()
    return name.lower()


def _sanitize_svg_attributes(element: ET.Element) -> None:
    for attr_name in list(element.attrib):
        local_name = _svg_local_name(attr_name)
        attr_value = _normalize_text(element.attrib.get(attr_name))
        if local_name.startswith("on"):
            del element.attrib[attr_name]
            continue
        if local_name in {"href", "src"} and attr_value and not attr_value.startswith("#"):
            del element.attrib[attr_name]


def _sanitize_svg_tree(element: ET.Element) -> None:
    _sanitize_svg_attributes(element)
    for child in list(element):
        if _svg_local_name(child.tag) in _UNSAFE_SVG_TAGS:
            element.remove(child)
            continue
        _sanitize_svg_tree(child)


def _sanitize_svg(svg: str, scene_title: str, index: int) -> str:
    cleaned = (svg or "").strip()
    if not cleaned.startswith("<svg"):
        return _fallback_svg(scene_title, index)
    cleaned = _UNSAFE_TAG_RE.sub("", cleaned)
    cleaned = _EVENT_ATTR_RE.sub("", cleaned)
    cleaned = _EXTERNAL_HREF_RE.sub("", cleaned)
    try:
        root = ET.fromstring(cleaned)
    except ET.ParseError:
        return _fallback_svg(scene_title, index)
    if _svg_local_name(root.tag) != "svg":
        return _fallback_svg(scene_title, index)
    _sanitize_svg_tree(root)
    sanitized = ET.tostring(root, encoding="unicode")
    if "<svg" not in sanitized.lower() or "</svg>" not in sanitized.lower():
        return _fallback_svg(scene_title, index)
    return sanitized


def parse_lesson_response(raw_response: dict[str, Any]) -> LessonResult:
    message_text, finish_reason = _extract_message_text(raw_response)
    payload = _extract_json_block(message_text, finish_reason=finish_reason)
    raw_scenes = payload.get("scenes") or []
    scenes: list[LessonScene] = []
    for index, raw_scene in enumerate(raw_scenes[:4], start=1):
        if not isinstance(raw_scene, dict):
            continue
        title = str(raw_scene.get("title") or f"步骤 {index}").strip()
        narration = str(raw_scene.get("narration") or "").strip()
        svg = str(raw_scene.get("svg") or "").strip()
        scenes.append(
            LessonScene(
                id=f"scene-{index}",
                title=title,
                narration=narration or f"这是第 {index} 步，请结合图示继续理解。",
                svg=_sanitize_svg(svg, title, index),
            )
        )

    if not scenes:
        raise ValueError("AI 没有生成可用的讲解场景")

    full_narration = str(payload.get("fullNarration") or payload.get("full_narration") or "").strip()
    if not full_narration:
        full_narration = "\n".join(scene.narration for scene in scenes if scene.narration)

    return LessonResult(
        title=str(payload.get("title") or "AI 数学讲解").strip(),
        summary=str(payload.get("summary") or "根据图片生成的讲解内容").strip(),
        scenes=scenes,
        full_narration=full_narration,
    )


async def request_lesson_from_ai(*, image_bytes: bytes, mime_type: str) -> LessonResult:
    headers = {"Content-Type": "application/json"}
    if settings.ai_api_key:
        headers["Authorization"] = f"Bearer {settings.ai_api_key}"

    async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
        for compact_mode in (False, True):
            payload = build_lesson_messages(
                image_bytes=image_bytes,
                mime_type=mime_type,
                model_name=settings.ai_model_name,
                compact_mode=compact_mode,
            )
            response = await client.post(
                settings.ai_api_url,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            try:
                return parse_lesson_response(response.json())
            except ValueError:
                if compact_mode:
                    raise
                continue

    raise ValueError("AI 返回内容解析失败，请稍后重试。")
