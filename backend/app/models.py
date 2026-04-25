from pydantic import BaseModel, ConfigDict, Field


class LessonScene(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str
    title: str
    svg: str
    narration: str


class LessonResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    title: str
    summary: str
    scenes: list[LessonScene] = Field(default_factory=list)
    full_narration: str = Field(
        default="",
        serialization_alias="fullNarration",
    )
