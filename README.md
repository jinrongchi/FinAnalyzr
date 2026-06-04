# FinAnalyzr MVP (React)

A股长期价值投资理念 + 价值评估工具（MVP）。

## 当前实现

- React + TypeScript + Vite 架构
- 估值模型：DCF、相对估值（PE/PB/EV-EBITDA）、DDM
- 质量评分：ROIC、杠杆、现金流转化、治理、护城河
- 输出结果：内在价值、安全边际、模型分项、敏感性分析、风险提示
- 方法论内容：长期价值投资理念与使用边界
- TuShare 适配层：请求封装、字段映射、本地 TTL 缓存
- TuShare 调用日志：控制台输出调用触发、请求参数摘要与响应行数
- 股票历史页：展示搜索过的股票与对应数据日期，可一键进入估值页复用数据
- 历史复盘页面：快照存储、版本选择、关键参数对比
- 数据过期刷新：若股票数据日期距今天超过 1 天，显示“刷新到最新数据”按钮
- 快照命名规则：股票名 + 股票数据日期；可选择同步后自动保存
- 纯手工模式：隐藏 TuShare 同步区块，仅保留手工输入
- 缺失数值：部分字段在未获取时以 N/A 形式显示，而不是 0
- 单元测试：估值引擎 Vitest 覆盖核心场景

## 目录结构

- `src/App.tsx`：估值页、股票历史页与历史复盘页
- `src/types.ts`：核心类型定义
- `src/data/defaults.ts`：默认参数
- `src/lib/valuation.ts`：估值引擎（已模块化）
- `src/lib/tushare.ts`：TuShare 适配 + 缓存 + 字段映射
- `src/lib/searchHistoryStore.ts`：股票搜索历史存储与复用
- `src/lib/snapshotStore.ts`：快照存储与删除
- `src/lib/valuation.test.ts`：估值引擎测试
- `src/index.css`：视觉样式与响应式布局
- `docs/investing-philosophy.md`：长期价值投资理念与方法边界
- `.env.example`：TuShare 代理配置样例

## 本地运行

```powershell
npm install
npm run dev:proxy
```

在另一个终端执行：

```powershell
npm run dev
```

浏览器访问：

- http://localhost:5173

生产构建：

```powershell
npm run build
```

运行测试：

```powershell
npm run test
```

## TuShare 配置

1. 推荐通过 Node 代理访问 TuShare，避免浏览器 CORS 与敏感 token 暴露。
2. 在项目根目录创建 `.env`，并配置：

```bash
TUSHARE_TOKEN=你的_tushare_token
TUSHARE_PROXY_PORT=8787
```

3. 默认前端会请求 `/api/tushare/proxy`，由 Vite 转发到本地代理服务。
4. 如需改成远端代理，可配置 `VITE_TUSHARE_PROXY_URL`。
5. 当切换到“仅手工”模式时，页面会自动隐藏 TuShare 同步区块。

## 后续可扩展

1. 为代理增加 token 白名单与 API 级别访问控制。
2. 增加快照标签体系（行业、策略、情景）和检索。

## 免责声明

本工具仅用于学习研究，不构成投资建议。投资有风险，决策需独立判断。
