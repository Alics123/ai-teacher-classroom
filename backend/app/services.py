import httpx
from fastapi import UploadFile

from .ai_client import request_lesson_from_ai
from .config import settings


class LessonGenerationError(Exception):
    def __init__(self, *, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _extract_upstream_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except Exception:
        return (response.text or "").strip()

    detail = payload.get("detail")
    if isinstance(detail, str) and detail.strip():
        return detail.strip()

    message = payload.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()

    error = payload.get("error")
    if isinstance(error, dict):
        nested_message = error.get("message")
        if isinstance(nested_message, str) and nested_message.strip():
            return nested_message.strip()

    return ""


async def generate_lesson_from_upload(file: UploadFile) -> dict:
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise LessonGenerationError(
            status_code=400,
            code="invalid_upload_type",
            message="请上传图片文件",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise LessonGenerationError(
            status_code=400,
            code="empty_upload",
            message="上传的图片为空",
        )

    max_bytes = settings.max_upload_megabytes * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise LessonGenerationError(
            status_code=400,
            code="image_too_large",
            message=f"图片不能超过 {settings.max_upload_megabytes}MB",
        )

    try:
        lesson = await request_lesson_from_ai(
            image_bytes=image_bytes,
            mime_type=content_type,
        )
    except httpx.RequestError as exc:
        raise LessonGenerationError(
            status_code=503,
            code="ai_service_unreachable",
            message="AI 服务暂时不可用，请稍后重试。",
        ) from exc
    except httpx.HTTPStatusError as exc:
        upstream_status = exc.response.status_code
        upstream_message = _extract_upstream_error_message(exc.response).lower()
        if (
            upstream_status == 400
            and "cannot identify image file" in upstream_message
        ):
            message = "AI 当前无法识别这张图片，请换成清晰的 PNG/JPG 截图后重试。"
        else:
            message = f"AI 服务上游响应异常（{upstream_status}），请稍后重试。"
        raise LessonGenerationError(
            status_code=502,
            code="ai_upstream_http_error",
            message=message,
        ) from exc
    except ValueError as exc:
        error_text = str(exc)
        if "finish_reason=length" in error_text or "json 无法解析" in error_text.lower():
            message = "AI 返回内容解析失败，当前图片信息量较大。建议裁剪单道题目或局部区域后重试。"
        else:
            message = "AI 返回内容解析失败，请稍后重试。"
        raise LessonGenerationError(
            status_code=502,
            code="ai_response_parse_error",
            message=message,
        ) from exc
    return lesson.model_dump(by_alias=True)
