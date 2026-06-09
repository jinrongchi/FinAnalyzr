# FinAnalyzr (React)

A股长期价值投资理念 + 股票价值评估工具。

## 功能概览

- React + TypeScript + Vite 架构
- 估值模型：DCF、ROE-PB、相对估值（PE/PB/PCF/PEG）、CAPE、FCF/EV、SOTP、Graham 公式
- 质量评分：ROIC、杠杆、现金流转化、治理、护城河
- 结果输出：内在价值区间、安全边际、模型分项、敏感性分析、风险提示、数据完整度
- 估值页交互：总览优先 + 分系统 Tab（DCF、ROE-PB、相对估值、CAPE/现金回报、SOTP、风险与验证）
- TuShare 适配层：代理访问、字段映射、缓存、日志
- 股票历史页：复用历史查询记录、名称/代码搜索、添加快照、按规则更新数据
- 历史复盘页：快照列表、版本对比、回测与归因分析（默认同股票对比，可选显示其他股票）
- 快照逻辑：支持同名覆盖确认，保存结果在对应页面提示
- 字段来源可解释性：按字段显示 TuShare/推导/默认/手工来源标签，并记录字段备注
- TuShare Token 来源优先级：UI 设置 > 服务器 `.env` (`TUSHARE_TOKEN`)

## 更新记录

详细更新历史请查看 [docs/CHANGELOG.md](docs/CHANGELOG.md)。

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
npm run lint
npm run preview
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

页面顶部提供 TuShare Token 管理区。保存后只显示 `Token Saved` 状态，不显示明文 Token；点击 `Change Token` 可修改。

当服务器 `.env` 已配置 `TUSHARE_TOKEN` 时，页面会显示 `the token is already set from server side`，并允许直接启用 TuShare 同步。用户仍可在 UI 中设置新 token 覆盖使用，优先级为：UI 设置 > `.env`。

## 本地存储说明

- 应用使用浏览器存储保存搜索历史、快照和 TuShare 缓存。
- 默认使用 `localStorage`，在浏览器普通模式下通常会长期保留。
- TuShare 缓存有 6 小时有效期，过期会在读取时自动删除。
- 搜索历史和快照没有按时间自动过期，仅保留数量上限（历史 120 条、快照 50 条）。

### 存储位置与可配置项

受浏览器安全模型限制，前端代码不能自定义磁盘路径（例如指定到 D 盘目录）。

你可以配置“存储位置类型”和“存储命名空间”：

```bash
# local (默认) 或 session
VITE_STORAGE_DRIVER=local

# 键名前缀，默认 finanalyzr
VITE_STORAGE_NAMESPACE=finanalyzr
```

- `VITE_STORAGE_DRIVER=local`：数据写入 `localStorage`（持久化，直到手动清理/浏览器策略清理）。
- `VITE_STORAGE_DRIVER=session`：数据写入 `sessionStorage`（标签页会话结束后清除）。
- `VITE_STORAGE_NAMESPACE`：用于隔离键前缀，避免与其他环境或应用冲突。

示例键名：

- `finanalyzr.search-history.v1`
- `finanalyzr.snapshots.v1`
- `finanalyzr.tushare.v1:600519.SH`
- `finanalyzr.tushare-token.v1`

## 免责声明

本工具仅用于学习研究，不构成投资建议。投资有风险，决策需独立判断。
