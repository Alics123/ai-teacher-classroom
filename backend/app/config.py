from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    ai_api_url: str = os.getenv(
        "AI_API_URL",
        "http://127.0.0.1:9109/v1/chat/completions",
    )
    ai_model_name: str = os.getenv("AI_MODEL_NAME", "Qwen/Qwen3.6-27B")
    ai_api_key: str = os.getenv("AI_API_KEY", "")
    ai_timeout_seconds: float = float(os.getenv("AI_TIMEOUT_SECONDS", "180"))
    max_upload_megabytes: int = int(os.getenv("MAX_UPLOAD_MEGABYTES", "8"))


settings = Settings()
