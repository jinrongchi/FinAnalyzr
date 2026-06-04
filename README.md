# FinAnalyzr (React)

A股长期价值投资理念 + 股票价值评估工具。

## 功能概览

- React + TypeScript + Vite 架构
- 估值模型：DCF、相对估值（PE/PB/EV-EBITDA）、DDM
- 质量评分：ROIC、杠杆、现金流转化、治理、护城河
- 结果输出：内在价值、安全边际、模型分项、敏感性分析、风险提示
- TuShare 适配层：代理访问、字段映射、缓存、日志
- 股票历史页：复用历史查询记录、添加快照、按规则更新数据
- 历史复盘页：快照列表、版本对比、回测与归因分析
- 快照逻辑：支持同名覆盖确认，保存结果在对应页面提示
- 手工模式：不展示 TuShare 同步能力

## 更新数据规则

- 历史页“更新数据”按钮是否可用，取决于交易日与当前日期规则。
- 若当天为周一、周六、周日，且数据交易日为上一个周五，则视为最新，不可更新。
- 其他情况下，当当前日期与数据交易日差值大于 1 天时可更新。

## 目录结构

- `src/App.tsx`：估值页、股票历史页、历史复盘页
- `src/types.ts`：类型定义
- `src/data/defaults.ts`：默认参数
- `src/lib/valuation.ts`：估值引擎
- `src/lib/tushare.ts`：TuShare 适配层
- `src/lib/searchHistoryStore.ts`：股票历史存储
- `src/lib/snapshotStore.ts`：快照存储
- `src/lib/backtest.ts`：回测与归因
- `src/lib/*.test.ts`：Vitest 单测
- `src/index.css`：样式
- `server/tushare-proxy.mjs`：本地代理服务
- `docs/investing-philosophy.md`：投资理念说明

## 本地运行

```powershell
npm install
npm run dev:proxy
```

另开一个终端：

```powershell
npm run dev
```

访问：`http://localhost:5173`

## 构建与测试

```powershell
npm run build
npm run test
```

## TuShare 配置

在项目根目录创建 `.env`：

```bash
TUSHARE_TOKEN=your_tushare_token
TUSHARE_PROXY_PORT=8787
```

可选：

```bash
VITE_TUSHARE_PROXY_URL=your_proxy_url
```

## 免责声明

本工具仅用于学习研究，不构成投资建议。投资有风险，决策需独立判断。
