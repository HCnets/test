# 性能优化与稳定性报告（离线 WebGL 版）

## 1. 性能目标

- 目标平台：桌面 WebGL（Chrome/Edge/Safari）、iOS Safari、Android Chrome。
- 帧率目标：在主流移动设备上稳定 ≥45 FPS。
- 约束：禁止任何网络请求；所有资源均为程序化生成或内联。

## 2. 渲染策略

- 单个 WebGL 画布：角色、环境、粒子全部在同一上下文中渲染。
- 2.5D 表现：角色使用 billboard 精灵（程序化 sprite atlas 纹理），场景使用低多边形平面与网格线。
- 批处理：
  - 角色与环境使用同一纹理/同一 shader 管线，尽量减少 `bindTexture` 与 `useProgram` 次数。
  - 粒子使用单独的 points shader 与一次性批量上传（typed array）。
- 透明排序最小化：粒子采用 additive 或预乘 alpha，避免复杂排序。

## 3. CPU 与内存优化

- 预分配：
  - 粒子系统采用固定容量池（例如 2048），避免每帧 new。
  - 向量对象避免临时创建，关键路径使用结构体化数组（SoA）。
- 逻辑与渲染分离：
  - `GameCore` 可在无渲染/无音频模式下运行，用于测试与低端回退。
- 避免 GC 峰值：
  - UI 数值动画使用复用 tween 结构，不生成大量闭包。

## 4. WebAudio 与空间音效优化

- BGM 采用少量 oscillator + filter 合成，避免加载音频资源。
- 3D 空间音效：每次 SFX 使用短生命周期的 `PannerNode` + `GainNode`，并限制并发数。
- 动态切歌：使用双轨 `GainNode` 交叉淡入淡出，避免频繁 start/stop 导致点击声。

## 5. 输入与相机优化

- 统一输入系统把鼠标/键盘/触屏事件归一化为固定的 action 信号，避免在 gameplay 层做大量分支。
- 相机：
  - 跟随使用指数平滑（lerp），减少抖动。
  - 震动使用短周期噪声与衰减，避免复杂噪声函数。
  - 缩放用 clamp 限制范围，避免投影矩阵频繁重建。

## 6. 可靠性与离线合规

- 禁网：代码层面不包含 `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`/`sendBeacon` 与任何外链 URL。
- 资源：sprite atlas、UI 图标、粒子贴图均通过 `canvas` 程序化生成后上传为纹理。
- 降级策略：
  - WebGL 初始化失败时，提示用户并降级为逻辑模式（仍可操作 UI 与查看状态机）。
  - 音频未解锁（移动端用户手势前）时，UI 提示并延后启动。

## 7. 可观测性（本地）

- 内置 FPS 计数器（1 秒滑窗），并显示 draw calls 与粒子数量。
- 提供“性能模式”开关：限制粒子与后处理强度，确保低端机保持 ≥45 FPS。

