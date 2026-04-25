# AI Teacher Classroom Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a beginner-friendly AI teacher web app where a student uploads one image and receives AI-generated SVG teaching scenes, matching narration text, and browser-based voice playback.

**Architecture:** Use a standalone `frontend + backend` structure to avoid disturbing existing projects in `it-project`. The FastAPI backend accepts uploads, calls the local OpenAI-compatible model on `http://127.0.0.1:9109/v1/chat/completions`, forces structured JSON output, and returns normalized lesson scenes. The Vue 3 frontend handles upload, preview, result rendering, and speech synthesis playback for each generated narration segment.

**Tech Stack:** FastAPI, httpx, Pillow, pytest, Vue 3, Vite, native fetch, Web Speech API

---

### Task 1: Project Scaffold

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.js`
- Create: `frontend/src/main.js`
- Create: `frontend/src/App.vue`
- Create: `README.md`

**Step 1: Write the failing startup checks**

- Add a backend smoke test that imports the app and verifies `/api/health` or root metadata exists.
- Add a frontend utility smoke test that ensures lesson payload normalization can run in Node.

**Step 2: Run the tests to verify failure**

Run: `pytest backend/tests -q`
Expected: FAIL because app files do not exist yet

Run: `node --test frontend/src/**/*.test.js`
Expected: FAIL because frontend files do not exist yet

**Step 3: Write the minimal scaffold**

- Create the FastAPI app entry.
- Create the Vite Vue app entry.
- Create a short `README.md` with run commands.

**Step 4: Run the tests again**

Run: `pytest backend/tests -q`
Expected: PASS for smoke coverage

Run: `node --test frontend/src/**/*.test.js`
Expected: PASS for smoke coverage

### Task 2: AI Lesson Backend

**Files:**
- Create: `backend/app/config.py`
- Create: `backend/app/models.py`
- Create: `backend/app/ai_client.py`
- Create: `backend/app/services.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_ai_client.py`
- Test: `backend/tests/test_api.py`

**Step 1: Write failing tests**

- Test AI payload generation with `enable_thinking=false`.
- Test response parsing into a stable schema: `title`, `summary`, `scenes[]`, `fullNarration`.
- Test `/api/lesson/generate` with multipart image upload and mocked AI response.

**Step 2: Run test to verify failure**

Run: `pytest backend/tests/test_ai_client.py backend/tests/test_api.py -q`
Expected: FAIL because the client and endpoint do not exist

**Step 3: Write minimal implementation**

- Add config defaults for local AI URL and model name.
- Add prompt + parser helpers.
- Add upload endpoint that validates image type, base64-encodes it, calls the local AI endpoint, and returns normalized JSON.

**Step 4: Run the tests**

Run: `pytest backend/tests/test_ai_client.py backend/tests/test_api.py -q`
Expected: PASS

### Task 3: Frontend Lesson Experience

**Files:**
- Create: `frontend/src/components/UploadPanel.vue`
- Create: `frontend/src/components/LessonViewer.vue`
- Create: `frontend/src/components/VoiceControls.vue`
- Create: `frontend/src/services/api.js`
- Create: `frontend/src/utils/lesson.js`
- Create: `frontend/src/utils/lesson.test.js`
- Modify: `frontend/src/App.vue`

**Step 1: Write failing tests**

- Test normalization of backend lesson payload.
- Test narration flattening and scene fallback text generation.

**Step 2: Run test to verify failure**

Run: `node --test frontend/src/utils/lesson.test.js`
Expected: FAIL because helpers do not exist

**Step 3: Write minimal implementation**

- Build upload form with drag/drop.
- Render scene cards, inline SVG previews, and full narration.
- Add browser speech synthesis controls for play, pause, resume, and stop.

**Step 4: Run the tests**

Run: `node --test frontend/src/utils/lesson.test.js`
Expected: PASS

### Task 4: Integration and Beginner Docs

**Files:**
- Modify: `README.md`
- Create: `backend/.env.example`
- Create: `start-backend.sh`
- Create: `start-frontend.sh`

**Step 1: Write failing verification checklist**

- Verify backend imports cleanly.
- Verify frontend builds.
- Verify the app can hit the local AI server.

**Step 2: Run checks to see gaps**

Run: `pytest backend/tests -q`
Run: `npm run build --prefix frontend`

**Step 3: Write the missing pieces**

- Add `.env.example`.
- Add beginner startup scripts.
- Expand the README with "what to click" instructions.

**Step 4: Final verification**

Run: `pytest backend/tests -q`
Expected: PASS

Run: `npm run build --prefix frontend`
Expected: PASS
