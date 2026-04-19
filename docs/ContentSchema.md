# 配置驱动内容（JSON）Schema 草案 v0.1

> 离线版：可走“导入 JSON”模拟运营；后端版：接运营后台下发。

## 1) ContentPack
```json
{
  "version": 1,
  "items": [],
  "maps": [],
  "skills": [],
  "achievements": [],
  "story": { "vn2": { "chapters": [], "nodes": [], "choices": [] } }
}
```

## 2) ItemDef
```json
{ "id": "w1", "name": "退格短刃", "slot": "weapon", "base": 6, "tags": ["连击"] }
```

## 3) MapDef
```json
{ "id": "map_corridor", "name": "镜面走廊", "baseBg": "corridor", "hiddenCond": "flag(\"time_night\") && philo>=3" }
```

## 4) SkillDef
```json
{ "id": "mind_1", "tree": "mind", "name": "不内耗", "cost": 1, "req": [], "eff": { "comboWin": 0.15 } }
```

## 5) VN2 Node / Choice
沿用现有 VN2 schema：chapters / nodes / choices。

