# A/B 测试与灰度发布（v0.1）

## 1) 分组
- A：基础微恐（当前默认强度）
- B：增强微恐（更强暗角/噪点/耳语）+ 更严格 QTE（窗口下限更低）但奖励更高

## 2) 分流策略
- 以 installId 的 hash 进行本地分组（离线版）
- 后端版：使用用户 id 分桶，并支持灰度比例调整

## 3) 指标
- 次日留存（D1）：+8%
- 7日留存（D7）：+5%
- ARPU：+12%（后端版接入支付后）
- 解谜通关率、QTE成功率、提示点击率、任务领取率

## 4) 事件埋点（已在代码里提供本地统计）
- session_start / scene_enter
- puzzle_start / puzzle_hint / puzzle_clear
- vn_choice / vn_qte_ok / vn_qte_fail

## 5) 验证方法
- 设置 → 数据看板：导出诊断报告（JSON）
- QA 统一跑 30min 场景脚本，合并报告对比

