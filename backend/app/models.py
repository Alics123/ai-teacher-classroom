from pydantic import BaseModel, ConfigDict, Field


class VisualElement(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    type: str
    content: str = ""
    target: str = ""
    position: dict[str, float] = Field(default_factory=dict)
    style: str = ""


class SceneLayout(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    top_left: str = Field(default="", serialization_alias="topLeft")
    top_right: str = Field(default="", serialization_alias="topRight")
    center: str = ""
    left_panel: str = Field(default="", serialization_alias="leftPanel")
    right_panel: str = Field(default="", serialization_alias="rightPanel")
    bottom: str = ""
    footer: str = ""


class VoiceSegment(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    text: str
    tone: str = "guiding"
    pause_after: bool = Field(default=False, serialization_alias="pauseAfter")
    duration_ms: int | None = Field(default=None, serialization_alias="durationMs")


class SceneVoiceScript(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    scene_id: int = Field(serialization_alias="sceneId")
    voice_script_segments: list[VoiceSegment] = Field(
        default_factory=list,
        serialization_alias="voiceScriptSegments",
    )


class LessonScene(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    id: str
    title: str
    purpose: str = ""
    visual_goal: str = Field(default="", serialization_alias="visualGoal")
    layout_type: str = Field(default="", serialization_alias="layoutType")
    layout: SceneLayout = Field(default_factory=SceneLayout)
    visual_elements: list[VisualElement] = Field(
        default_factory=list,
        serialization_alias="visualElements",
    )
    animation_order: list[str] = Field(default_factory=list, serialization_alias="animationOrder")
    svg: str
    narration: str


class ProblemAnalysis(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    subject: str = "other"
    topic: str = ""
    difficulty: str = "medium"
    problem_type: str = Field(default="", serialization_alias="problemType")
    raw_text: str = Field(default="", serialization_alias="rawText")
    key_elements: list[str] = Field(default_factory=list, serialization_alias="keyElements")
    hidden_assumptions: list[str] = Field(
        default_factory=list,
        serialization_alias="hiddenAssumptions",
    )
    common_confusions: list[str] = Field(
        default_factory=list,
        serialization_alias="commonConfusions",
    )


class StudentDiagnosis(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    student_level: str = Field(default="beginner", serialization_alias="studentLevel")
    likely_blockers: list[str] = Field(default_factory=list, serialization_alias="likelyBlockers")
    teaching_strategy: str = Field(default="step_by_step", serialization_alias="teachingStrategy")
    recommended_depth: str = Field(default="medium", serialization_alias="recommendedDepth")
    must_explain_before_solving: list[str] = Field(
        default_factory=list,
        serialization_alias="mustExplainBeforeSolving",
    )
    should_avoid: list[str] = Field(default_factory=list, serialization_alias="shouldAvoid")


class KnowledgePack(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    concept_definitions: list[str] = Field(default_factory=list, serialization_alias="conceptDefinitions")
    formulas: list[str] = Field(default_factory=list)
    rules: list[str] = Field(default_factory=list)
    common_templates: list[str] = Field(default_factory=list, serialization_alias="commonTemplates")
    easy_mistakes: list[str] = Field(default_factory=list, serialization_alias="easyMistakes")
    extension_directions: list[str] = Field(default_factory=list, serialization_alias="extensionDirections")


class LessonPlan(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    lesson_goal: str = Field(default="", serialization_alias="lessonGoal")
    teaching_style: str = Field(default="teacher_like", serialization_alias="teachingStyle")
    scene_count: int = Field(default=0, serialization_alias="sceneCount")
    scene_flow: list[str] = Field(default_factory=list, serialization_alias="sceneFlow")
    pacing: str = "normal"
    summary_takeaway: str = Field(default="", serialization_alias="summaryTakeaway")


class QualityCheckResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    pass_: bool = Field(default=False, serialization_alias="pass")
    issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    severity: str = "low"
    rewrite_needed: bool = Field(default=False, serialization_alias="rewriteNeeded")


class LessonResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    title: str
    summary: str
    stage: str = "completed"
    progress: float = 1.0
    detail: str = "课堂讲解已生成完成。"
    lesson_overview: dict[str, str] = Field(default_factory=dict, serialization_alias="lessonOverview")
    problem_analysis: ProblemAnalysis = Field(default_factory=ProblemAnalysis, serialization_alias="problemAnalysis")
    student_diagnosis: StudentDiagnosis = Field(default_factory=StudentDiagnosis, serialization_alias="studentDiagnosis")
    knowledge_pack: KnowledgePack | None = Field(default=None, serialization_alias="knowledgePack")
    teaching_plan: LessonPlan = Field(default_factory=LessonPlan, serialization_alias="teachingPlan")
    scenes: list[LessonScene] = Field(default_factory=list)
    scene_scripts: list[SceneVoiceScript] = Field(default_factory=list, serialization_alias="sceneScripts")
    quality_check: QualityCheckResult = Field(default_factory=QualityCheckResult, serialization_alias="qualityCheck")
    final_summary: dict[str, object] = Field(default_factory=dict, serialization_alias="finalSummary")
    full_narration: str = Field(default="", serialization_alias="fullNarration")
