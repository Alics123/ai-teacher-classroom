# AI Teacher Classroom

一个适合编程新手的独立 AI 老师项目：

- 学生上传一张图片
- 后端调用本地 `9109` 端口的 AI
- AI 返回 `SVG 分镜 + 中文讲解稿`
- 前端把每一张 SVG 展示出来，并用浏览器语音朗读讲解内容

## 项目结构

```text
ai-teacher-classroom/
├── backend/        # FastAPI 后端
├── frontend/       # Vue 3 + Vite 前端
├── start-backend.sh
├── start-frontend.sh
└── docs/plans/
```

## 你需要准备什么

1. 本地 `9109` 端口已经启动了 OpenAI 兼容模型
2. 这台机器能运行：
   - Node.js
   - `/opt/ohpc/home/jie/.conda/envs/vllm16/bin/python`

如果你的 Python 路径不同，可以在启动后端时这样写：

```bash
PYTHON_BIN=/你的/python路径 ./start-backend.sh
```

后端默认配置放在 `backend/.env`。第一次使用先复制：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
cp backend/.env.example backend/.env
```

`start-backend.sh` 会自动读取 `backend/.env`。
`start-frontend.sh` 也会读取它，并在你没有显式设置 `VITE_API_BASE_URL` / `VITE_API_PORT` 时，自动让前端跟随后端的 `BACKEND_PORT`。

## 一键启动

最省事的方式是直接用总启动脚本：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
./start-app.sh
```

它会自动做这几件事：

- 如果 `8008` 已经是这个项目的后端，就直接复用
- 如果 `8008` 被别的服务占用，就自动找下一个空闲后端端口
- 如果 `5173` 被占用，就自动找下一个空闲前端端口
- 自动把前端 API 指到最终实际使用的后端端口
- 直接打印本机和局域网访问地址

例如当前机器上 `5173` 被占用时，它会自动改用 `5174`、`5175` 之类的空闲端口。

如果你想跑 preview 模式，也可以：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
FRONTEND_MODE=preview ./start-app.sh
```

下面这组命令仍然保留，适合你单独调试前后端：

### 分开启动

先启动后端：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
./start-backend.sh
```

再启动前端：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
./start-frontend.sh
```

启动后打开：

- 前端页面：`http://127.0.0.1:5173`
- 后端接口：`http://127.0.0.1:8008`

注意：如果你是分开启动，`start-frontend.sh` 仍然会使用固定端口策略；端口冲突时请手动传 `FRONTEND_PORT`。

如果你要看接近部署形态的静态预览，而不是 Vite 开发服务器：

```bash
cd /opt/ohpc/home/jie/workspace/it-project/ai-teacher-classroom
FRONTEND_MODE=preview ./start-frontend.sh
```

预览地址默认是：`http://127.0.0.1:4173`

## 端口与 LAN 行为

- 开发前端默认端口是 `5173`
- 预览前端默认端口是 `4173`
- 后端默认端口是 `8008`
- 这三个端口都配置成了 `strictPort`/固定端口策略：端口被占用时会直接报错退出，不会偷偷跳到别的端口
- 前端开发模式和预览模式都监听 `0.0.0.0`
- 前端请求后端时，默认会跟随当前页面访问时的主机名或 IP，只替换端口为后端端口

例如：

- 你在本机打开 `http://127.0.0.1:5173`，前端会请求 `http://127.0.0.1:8008`
- 你在局域网其他机器打开 `http://192.168.31.22:4173`，前端会请求 `http://192.168.31.22:8008`

如果要让局域网里的其他机器访问，请用这台机器的局域网 IP：

- 前端页面：`http://你的局域网IP:5173`
- 后端接口：`http://你的局域网IP:8008`

如果你跑的是 preview 模式，前端页面改成：

- `http://你的局域网IP:4173`

例如：

```text
http://192.168.31.22:5173
```

现在前端会自动跟随你访问页面时使用的主机名或 IP。
也就是说，如果你在另一台电脑上打开 `http://192.168.31.22:5173`，前端会自动去请求 `http://192.168.31.22:8008`，不再写死到 `127.0.0.1`。

## 局域网访问注意事项

1. 先确认这台运行项目的机器和访问机器在同一个局域网里
2. 启动脚本已经监听 `0.0.0.0`，代码层面已允许外部访问
3. 如果还是打不开，通常是系统防火墙没放行端口：
   - `5173`
   - `4173`
   - `8008`
4. 如果你以后把后端端口改掉了，优先直接改 `backend/.env` 里的 `BACKEND_PORT`，前端脚本会自动跟随
5. 如果你只想临时覆盖前端请求的后端端口，也可以在前端启动前设置：

```bash
VITE_API_PORT=9001 ./start-frontend.sh
```

6. 如果你想把前端固定请求到某个完整地址，也可以这样：

```bash
VITE_API_BASE_URL=http://192.168.31.22:8008 ./start-frontend.sh
```

7. 如果开发端口或预览端口冲突，可以显式改掉：

```bash
FRONTEND_PORT=5174 ./start-frontend.sh
FRONTEND_MODE=preview FRONTEND_PREVIEW_PORT=4174 ./start-frontend.sh
BACKEND_PORT=8010 ./start-backend.sh
```

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

如果你需要热重载，再显式加上：

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

## 启动脚本现在会做什么

- 后端脚本只会在 `.venv` 不存在时创建虚拟环境
- `backend/requirements.txt` 没变时，后端脚本会跳过 `pip install`
- `frontend/package-lock.json` 没变且 `node_modules` 存在时，前端脚本会跳过 `npm ci`
- 前端脚本支持 `FRONTEND_MODE=dev` 和 `FRONTEND_MODE=preview`

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

## 可以继续怎么改

- 如果你想让讲解更像“小学老师”或“大学老师”，改 `backend/app/ai_client.py` 里的系统提示词
- 如果你想接别的模型，改 `backend/.env` 里的 `AI_API_URL` 和 `AI_MODEL_NAME`
- 如果你想把语音换成真正的音频文件，可以再接入 TTS 服务

## 已完成的验证

- 后端 `pytest`
- 前端工具函数测试 `node --test`
- 本地 `9109` OpenAI 兼容接口探测通过
