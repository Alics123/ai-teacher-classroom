# AI Teacher Classroom

一个上传图片后自动生成 `SVG 分镜` 和中文讲解稿的 AI 教学应用，主要面向编程学习者。

## 项目做什么

- 学生上传一张图片
- 后端把图片发给本地 `9109` 端口上的 OpenAI 兼容模型
- 模型返回 `SVG 分镜 + 中文讲解稿`
- 前端展示每一张 SVG，并用浏览器语音朗读讲解内容

## 项目结构

```text
ai-teacher-classroom/
├── backend/        # FastAPI 后端
├── frontend/       # Vue 3 + Vite 前端
├── start-app.sh
├── start-backend.sh
├── start-frontend.sh
└── docs/plans/
```

## 运行前准备

1. 本地 `9109` 端口已经启动了 OpenAI 兼容模型
2. 这台机器能运行：
   - Node.js
   - `/opt/ohpc/home/jie/.conda/envs/vllm16/bin/python`
3. 后端配置文件已准备好：`backend/.env`

如果你还没有 `backend/.env`，先复制一份：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
cp backend/.env.example backend/.env
```

如果你的 Python 路径不同，可以在启动后端时显式指定：

```bash
PYTHON_BIN=/你的/python路径 ./start-backend.sh
```

## 最推荐的启动方式

直接用总启动脚本：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
./start-app.sh
```

这个脚本会：

- 启动后端和前端
- 自动把前端 API 指到实际使用的后端端口
- 打印本机和局域网访问地址

如果你想跑预览模式：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
FRONTEND_MODE=preview ./start-app.sh
```

## 分开启动

如果你想单独调试前后端，可以分开启动。

### 后端

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
./start-backend.sh
```

### 前端

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
./start-frontend.sh
```

启动后：

- 前端页面：`http://127.0.0.1:5173`
- 后端接口：`http://127.0.0.1:8008`

如果你要看接近部署形态的静态预览：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
FRONTEND_MODE=preview ./start-frontend.sh
```

预览地址默认是：`http://127.0.0.1:4173`

## 端口说明

- 后端默认端口：`8008`
- 前端开发端口：`5173`
- 前端预览端口：`4173`

说明：

- 前端开发模式和预览模式都监听 `0.0.0.0`
- 前端请求后端时，会跟随你访问页面时使用的主机名或 IP，只替换端口为后端端口
- 如果端口被占用，请显式改环境变量，而不是猜测脚本行为

例如：

```bash
FRONTEND_PORT=5174 ./start-frontend.sh
FRONTEND_MODE=preview FRONTEND_PREVIEW_PORT=4174 ./start-frontend.sh
BACKEND_PORT=8010 ./start-backend.sh
```

如果你要临时覆盖前端请求的后端端口：

```bash
VITE_API_PORT=9001 ./start-frontend.sh
```

如果你想把前端固定请求到某个完整地址：

```bash
VITE_API_BASE_URL=http://192.168.31.22:8008 ./start-frontend.sh
```

## 局域网访问

如果这台机器和访问机器在同一个局域网里，可以直接用这台机器的局域网 IP 打开：

- 前端开发页面：`http://你的局域网IP:5173`
- 前端预览页面：`http://你的局域网IP:4173`
- 后端接口：`http://你的局域网IP:8008`

例如：

```text
http://192.168.31.22:5173
```

如果还是打不开，通常是防火墙没有放行这些端口：

- `5173`
- `4173`
- `8008`

## 手动启动

### 后端

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
cp backend/.env.example backend/.env
/opt/ohpc/home/jie/.conda/envs/vllm16/bin/python -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements.txt
set -a
. backend/.env
set +a
python -m uvicorn app.main:app --app-dir backend --host "${BACKEND_HOST:-0.0.0.0}" --port "${BACKEND_PORT:-8008}"
```

如果你需要热重载：

```bash
BACKEND_RELOAD=1 ./start-backend.sh
```

### 前端

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
npm ci --prefix frontend
npm run dev --prefix frontend -- --host 0.0.0.0 --port 5173 --strictPort
```

如果你要跑 preview：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
npm run build --prefix frontend
npm run preview --prefix frontend -- --host 0.0.0.0 --port 4173 --strictPort
```

## 使用流程

1. 打开前端页面
2. 上传一张数学题图片、草稿图、几何图或教材截图
   也可以直接在页面里按 `Ctrl+V` / `Cmd+V` 粘贴剪贴板图片
3. 点击“生成讲解”
4. 页面会显示：
   - 讲解标题和摘要
   - 2 到 4 张 SVG 分镜
   - 每张图对应的老师讲解文案
   - 语音朗读按钮

## 还能继续怎么改

- 想让讲解更像“小学老师”或“大学老师”，改 `backend/app/ai_client.py` 里的系统提示词
- 想接别的模型，改 `backend/.env` 里的 `AI_API_URL` 和 `AI_MODEL_NAME`
- 想把语音换成真正的音频文件，可以再接入 TTS 服务

## 已完成的验证

- 后端 `pytest`
- 前端工具函数测试 `node --test`
- 本地 `9109` OpenAI 兼容接口探测通过
