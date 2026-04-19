# 深度性能优化与架构改进报告（v0.1）

## 1) 本轮优化目标
- 降低帧内冗余计算（UI每帧重复统计/遍历）
- 降低高频 I/O（localStorage 写入频率）
- 引入缓存与失效策略（遥测汇总、技能汇总、装备属性）
- 维持对外接口兼容（函数名/存储结构仍可读取旧数据）

## 2) 关键瓶颈与改动

### 2.1 遥测统计 telemetrySummary 的 O(N) 重复计算
- **问题**：任务抽屉/数据看板会频繁调用 `telemetrySummary()`，原实现每次都遍历 events/sessions 生成统计。
- **优化**：增加版本号 `_v` 与缓存 `_cache`，仅在新增事件/新增session日时失效并重算。
- **影响**：把“每帧 O(N events)”降为“每事件 O(1) + 按需 O(N)”，明显降低抽屉打开时的 CPU 峰值。

### 2.2 技能统计 skillStat 的 O(技能数) 重复遍历
- **问题**：战斗每帧/每次攻击会多次调用 `skillStat()`，原实现每次都遍历全部技能定义。
- **优化**：增加 `_v` 与 `_cache.totals`，在解锁/重置时失效，平时 O(1) 取值。
- **影响**：战斗帧内函数调用更轻，减少 GC 与循环开销。

### 2.3 装备属性 equipStats 的 O(装备+词条) 重复计算 & 查找线性扫描
- **问题**：战斗每帧调用 `equipStats()`，原实现会线性扫描背包查 uid 并累加词条。
- **优化**：
  - 为背包增加 `_v`、`_idx`（uid→item 索引）与 `_cache`（基于装备 uid key 缓存结果）。
  - 只有“掉落新增/装备切换”才失效。
- **影响**：战斗每帧 equipStats 基本变为 O(1)。

### 2.4 高频 localStorage 写入
- **问题**：滚动/拖拽等高频交互会触发多次 `saveState()`，localStorage 写入属于昂贵 I/O。
- **优化**：`saveState()` 增加 250ms 写入节流 + `flushSaveState()`，在每帧与页面切后台时尝试落盘。
- **影响**：显著减少写入次数（尤其是滚动时），降低卡顿与电量消耗。

## 3) 基准测试与量化指标（可复现）
> 离线环境无法做真实机型矩阵压测；本版本提供可执行基准入口用于对比。

- `window.__debug.perfBench()` 返回：
  - `telemetrySummary_ms`：连续 2000 次调用耗时
  - `skillStat_ms`：连续 20000 次调用耗时
  - `equipStats_ms`：连续 2000 次调用耗时

预期趋势（相对优化前）：
- telemetrySummary：同版本重复调用接近 O(1)，在 UI 打开时显著下降
- skillStat：从多次遍历变为缓存读取，下降明显
- equipStats：战斗帧内多次读取不再遍历背包与词条，下降明显

## 4) 测试与正确性
- 扩展了 `smokeGameplay()` 覆盖：
  - telemetrySummary 缓存命中
  - skillStat 缓存与失效
  - equipStats 缓存与失效
- 入口：`tests_vn.html` 运行测试

说明：
- 当前项目为单文件画布游戏，缺少覆盖率统计工具链；已通过 smoke tests 增强回归保障，但“覆盖率≥90%”需要引入外部测试/打包工具（例如 Vitest/Playwright + instrumentation）才可量化。

## 5) 改动清单（核心）
- `saveState()`：节流 + `flushSaveState()`；切后台强制 flush
- telemetry：`_v + _cache` 缓存统计
- skills：`_v + _cache.totals` 缓存聚合
- inv：`_v + _idx + _cache` 加速 uid 查找与装备统计
- smoke tests：新增性能相关断言

## 6) 回滚方案
- 若出现存档/统计异常：
  - 回滚 `saveState()` 节流：恢复为每次立即写入
  - 回滚 telemetry/skills/inv 缓存：删除 `_v/_cache/_idx` 逻辑，保留原遍历实现
  - 以上变更均为“附加字段”策略，不影响旧存档读取

