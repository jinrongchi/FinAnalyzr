# DeepValue – A股价值投资估值系统

## 快速启动（开发模式）

### 前置条件
- Python 3.12 (推荐，避免 3.14 下 SciPy 源码编译问题)
- Node.js 20+
- Docker Desktop（用于 PostgreSQL + Redis）
- **Tushare Pro Token**（需具备权限获取财务数据）

### 1. 启动数据库与缓存
```powershell
docker compose up db redis -d
```

### 2. 配置后端
```powershell
cd backend
Copy-Item .env.example .env
# 编辑 .env，填入你的 TUSHARE_TOKEN
notepad .env
```

**示例 .env：**
```
DATABASE_URL=postgresql+asyncpg://astock:astock@localhost/astock
TUSHARE_TOKEN=your_token_here
```

### 3. 安装后端依赖 & 初始化数据库
```powershell
pip install -r requirements.txt
alembic upgrade head

py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m alembic upgrade head
```

**常见问题：**
- 如果看到 `Preparing metadata (pyproject.toml) ... error`（SciPy）  
   → 通常是使用了 Python 3.14。请改用 `py -3.12` 创建虚拟环境
- 如果遇到 `sqlalchemy.exc.NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:psycopg`  
  → 确保 `psycopg[binary]` 已安装：`pip install psycopg[binary]`
- 如果提示 `alembic` / `uvicorn` 不是命令  
   → 使用模块方式：`.\.venv\Scripts\python -m alembic ...` 和 `.\.venv\Scripts\python -m uvicorn ...`
- 如果 alembic 连接超时  
  → 检查 Docker 中 PostgreSQL 是否运行：`docker compose ps`

### 4. 启动后端
```powershell
uvicorn ap.main:app --reload --port8000

.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```
API 文档: http://localhost:8000/docs

### 5. 安装前端依赖 & 启动
```powershell
cd ..\frontend
npm install
npm run dev
```
前端: http://localhost:5173

---

## 首次使用流程

> ⚠️ **重要**：Docker 启动后，数据库表已自动创建，但没有任何数据。需要先同步数据。

### 步骤 0 – 验证系统状态
```
GET http://localhost:8000/health
```
返回 `{"status":"ok"}` 即可继续。

### 步骤 1 – 同步股票基础数据
通过 API 同步（推荐）：
```
POST http://localhost:8000/api/v1/sync/stock-basic
```
或通过前端：打开 http://localhost:5173 → 点击「同步」按钮 → 「股票基础数据」

**预计耗时**：5-10分钟（≈5500只股票）

### 步骤 2 – 同步宏观数据
```
POST http://localhost:8000/api/v1/sync/macro
```
同步中国10年期国债收益率、CPI、沪深300指数数据。

**预计耗时**：1-2分钟

### 步骤 3 – 同步个股数据（按需）
选择一只股票后，在前端点击「估值分析」会自动同步该股票的财务数据。

或通过 API：
```
POST http://localhost:8000/api/v1/sync/stock/600519.SH
```

**预计耗时**：2-3分钟/股票

### 步骤 4 – 开始估值
在前端搜索股票代码（例：600519），点击「估值分析」。

---

## Docker 一键部署

### 方法一：Docker Compose（推荐）
```powershell
# 第1步：配置环境变量
cd backend
Copy-Item .env.example .env
# 编辑 .env，填入 TUSHARE_TOKEN，DATABASE_URL（Docker时改为 @db:5432）
notepad .env
# 关键: DATABASE_URL=postgresql+asyncpg://astock:astock@db:5432/astock

# 第2步：启动所有服务（会自动进行数据库迁移）
cd ..
docker compose up --build

# 查看日志
docker compose logs -f backend
```

**服务地址：**
- 前端: http://localhost:5173
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs

**启动过程说明：**
1. 首次启动时，后端会自动生成数据库迁移脚本（如果不存在）
2. 自动执行 `alembic upgrade head` 创建所有表
3. 约 30-40 秒后，所有服务会进入"就绪"状态
4. 可以检查状态：`docker compose ps`（所有容器应为 `Up`）

**启动完成后立即进行数据同步**（见下面"首次使用流程"）

**Docker 常见问题排查：**

1. **SQLAlchemy 驱动错误**（`sqlalchemy.exc.NoSuchModuleError`）  
   解决：确保 `requirements.txt` 包含 `psycopg[binary]==3.2.3`，不要使用 `psycopg2-binary`
   
2. **连接被拒绝**（`connection refused` on port 5432）  
   解决：检查 `.env` 中 DATABASE_URL 是否为 `postgresql+asyncpg://astock:astock@db:5432/astock`（Docker中用 `db`，不用 `localhost`）

3. **Alembic 迁移失败**  
   解决：确保 PostgreSQL 容器已启动并健康：`docker compose ps` 查看 db 状态

```powershell
# 重新清理和构建（如果有问题）
docker compose down -v
docker compose up --build
```

### 方法二：分离启动（用于开发调试）
```powershell
# 启动数据库和缓存
docker compose up db redis -d

# 在另一个终端启动后端
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 再在另一个终端启动前端
cd frontend
npm run dev
```

---

## 数据来源标签说明

| 标签 | 含义 |
|------|------|
| `AUTO` | 直接从 Tushare 获取 |
| `CALC` | 由 Tushare 字段计算得出 |
| `手工` | 用户通过 `/api/v1/manual/{ts_code}` 手工录入 |
| `DEFAULT` | 系统内置默认值（最低优先级，如 WACC=9%） |
| `N/A` | 数据无法获取 |

---

## 可手工录入的字段

当 Tushare 无法可靠提供时，以下字段支持手工录入：

| 字段 | 说明 |
|------|------|
| `cn10y_yield` | 10年期国债收益率 |
| `beta` | 个股Beta值 |
| `wacc` | WACC折现率 |
| `effective_tax_rate` | 有效税率 |
| `div_per_share` | 近3年平均每股分红 |

```
PUT /api/v1/manual/{ts_code}
{ "field_name": "cn10y_yield", "value": 0.028, "note": "2026-06-11手工录入" }
```

---

## 项目结构

```
├── backend/
│   ├── app/
│   │   ├── api/v1/          # FastAPI 路由
│   │   ├── core/            # 枚举、行业映射、配置
│   │   ├── db/              # SQLAlchemy 异步会话
│   │   ├── models/          # ORM 模型
│   │   ├── services/
│   │   │   ├── tushare_fetcher.py  # Tushare 采集器
│   │   │   ├── ttm.py              # TTM 构造引擎
│   │   │   └── valuation/
│   │   │       ├── engine.py       # 所有估值模型
│   │   │       └── orchestrator.py # 单股估值流水线
│   │   └── tasks/sync.py    # 数据同步任务
│   ├── alembic/             # 数据库迁移
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/             # Axios API 封装
│   │   ├── components/      # 通用组件（ScoreRing, RedFlagPanel等）
│   │   ├── stores/          # Pinia 状态管理
│   │   ├── views/           # 三大页面
│   │   └── assets/main.css  # 设计系统
│   └── vite.config.js
│
├── docker-compose.yml
└── skill.md                 # 估值规范文档（需求基准）
```
