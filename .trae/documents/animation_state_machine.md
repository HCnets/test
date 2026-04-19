# 动画状态机配置文档（离线 WebGL 版）

## 1. 目标

- 提供一个可配置、可测试的动画状态机，用于驱动角色 8+ 基础动作。
- 状态机与渲染解耦：状态机只输出 `action`、`frameIndex`、`events`。

## 2. 数据结构（JSON）

```json
{
  "version": 1,
  "actions": {
    "idle":   { "fps": 8,  "loop": true,  "frames": 8,  "events": [] },
    "walk":   { "fps": 12, "loop": true,  "frames": 8,  "events": [] },
    "run":    { "fps": 16, "loop": true,  "frames": 8,  "events": [] },
    "jump":   { "fps": 12, "loop": false, "frames": 8,  "events": [{"at":0.15,"type":"sfx","name":"jump"}] },
    "dash":   { "fps": 18, "loop": false, "frames": 6,  "events": [{"at":0.05,"type":"sfx","name":"dash"}] },
    "attack1":{ "fps": 14, "loop": false, "frames": 10, "events": [{"at":0.35,"type":"hitbox","name":"slash"}] },
    "attack2":{ "fps": 14, "loop": false, "frames": 10, "events": [{"at":0.38,"type":"hitbox","name":"slash"}] },
    "skill":  { "fps": 12, "loop": false, "frames": 12, "events": [{"at":0.25,"type":"fx","name":"skillBurst"}] },
    "hurt":   { "fps": 12, "loop": false, "frames": 6,  "events": [{"at":0.05,"type":"sfx","name":"hit"}] },
    "die":    { "fps": 10, "loop": false, "frames": 12, "events": [{"at":0.10,"type":"sfx","name":"die"}] }
  },
  "machine": {
    "initial": "idle",
    "states": {
      "idle": {
        "action": "idle",
        "transitions": [
          {"to":"walk","when":"moveMagnitude>0.2 && !runModifier"},
          {"to":"run","when":"moveMagnitude>0.2 && runModifier"},
          {"to":"attack1","when":"attackPressed"},
          {"to":"skill","when":"skillPressed"},
          {"to":"dash","when":"dashPressed"}
        ]
      },
      "walk": {
        "action": "walk",
        "transitions": [
          {"to":"idle","when":"moveMagnitude<=0.2"},
          {"to":"run","when":"runModifier"},
          {"to":"attack1","when":"attackPressed"},
          {"to":"skill","when":"skillPressed"},
          {"to":"dash","when":"dashPressed"}
        ]
      },
      "run": {
        "action": "run",
        "transitions": [
          {"to":"idle","when":"moveMagnitude<=0.2"},
          {"to":"walk","when":"!runModifier"},
          {"to":"attack1","when":"attackPressed"},
          {"to":"skill","when":"skillPressed"},
          {"to":"dash","when":"dashPressed"}
        ]
      },
      "jump": {
        "action": "jump",
        "lock": true,
        "transitions": [{"to":"idle","when":"animFinished"}]
      },
      "dash": {
        "action": "dash",
        "lock": true,
        "transitions": [{"to":"idle","when":"animFinished"}]
      },
      "attack1": {
        "action": "attack1",
        "lock": true,
        "transitions": [
          {"to":"attack2","when":"attackBuffered && animTime>0.55"},
          {"to":"idle","when":"animFinished"}
        ]
      },
      "attack2": {
        "action": "attack2",
        "lock": true,
        "transitions": [{"to":"idle","when":"animFinished"}]
      },
      "skill": {
        "action": "skill",
        "lock": true,
        "transitions": [{"to":"idle","when":"animFinished"}]
      },
      "hurt": {
        "action": "hurt",
        "lock": true,
        "transitions": [{"to":"idle","when":"animFinished"}]
      },
      "die": {
        "action": "die",
        "lock": true,
        "transitions": []
      }
    }
  }
}
```

## 3. 条件变量定义

- `moveMagnitude`：0..1，由统一输入系统归一化输出。
- `runModifier`：布尔值（Shift 或双击摇杆）。
- `attackPressed`：本帧攻击键按下（键盘 J / UI 攻击 / 触屏双击）。
- `attackBuffered`：攻击缓冲（在动作锁定期间按下将被缓存）。
- `skillPressed`：本帧技能键按下（键盘 K / UI 技能 / 触屏长按）。
- `dashPressed`：本帧冲刺键按下（Space / UI 冲刺 / 触屏滑动）。
- `animTime`：当前动作播放进度（0..1）。
- `animFinished`：非循环动作播放完成。

## 4. 事件（Events）

- `sfx`：音效触发点（通过 3D 空间音效播放）。
- `hitbox`：攻击判定触发点（生成一次命中检测）。
- `fx`：粒子/屏幕特效触发点（战斗、环境、UI 三类）。

## 5. 与实现的对应关系

- 动画系统：`AnimationSystem` 负责 clip 采样、事件发射、`animFinished`。
- 状态机：`StateMachine` 负责条件求值、锁定逻辑、缓冲逻辑。
- 角色控制：`CharacterController` 负责把输入映射为条件变量，并消费事件结果（命中/受击）。

