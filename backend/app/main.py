from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .services import LessonGenerationError, generate_lesson_from_upload


app = FastAPI(title="AI Teacher Classroom")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(LessonGenerationError)
async def handle_lesson_generation_error(_request, exc: LessonGenerationError):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
            }
        },
    )


@app.get("/")
async def root():
    return {
        "app": "AI Teacher Classroom",
        "message": "Upload one image and get SVG teaching scenes with narration.",
    }


@app.post("/api/lesson/generate")
async def generate_lesson(file: UploadFile = File(...)):
    return await generate_lesson_from_upload(file)
