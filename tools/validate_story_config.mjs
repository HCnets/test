import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const cfgPath = path.join(ROOT, 'config', 'story.json')

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function main() {
  const cfg = readJson(cfgPath)
  const byNode = new Map(cfg.nodes.map((n) => [n.nodeId, n]))
  const choicesByNode = new Map()
  for (const c of cfg.choices) {
    if (!choicesByNode.has(c.nodeId)) choicesByNode.set(c.nodeId, [])
    choicesByNode.get(c.nodeId).push(c)
  }

  const errors = []
  const warnings = []

  for (const ch of cfg.chapters) {
    if (!byNode.has(ch.entryNodeId)) errors.push({ type: 'missing_entry', chapterId: ch.chapterId, entryNodeId: ch.entryNodeId })
  }

  for (const n of cfg.nodes) {
    if (n.type === 'choice') {
      const list = choicesByNode.get(n.nodeId) || []
      if (!list.length) errors.push({ type: 'choice_node_no_choices', nodeId: n.nodeId })
    } else if (n.type !== 'ending') {
      const hasNext = !!n.next
      const hasChoices = (choicesByNode.get(n.nodeId) || []).length > 0
      if (!hasNext && !hasChoices) errors.push({ type: 'dead_end', nodeId: n.nodeId })
    }
  }

  for (const c of cfg.choices) {
    if (!byNode.has(c.nodeId)) errors.push({ type: 'choice_missing_node', choiceId: c.choiceId, nodeId: c.nodeId })
    if (!byNode.has(c.jumpToNodeId)) errors.push({ type: 'choice_bad_jump', choiceId: c.choiceId, jumpToNodeId: c.jumpToNodeId })
  }

  const chapterNodes = new Map()
  for (const n of cfg.nodes) {
    if (!chapterNodes.has(n.chapterId)) chapterNodes.set(n.chapterId, [])
    chapterNodes.get(n.chapterId).push(n)
  }

  for (const ch of cfg.chapters) {
    const reachable = new Set()
    const q = [ch.entryNodeId]
    while (q.length) {
      const id = q.shift()
      if (reachable.has(id)) continue
      reachable.add(id)
      const n = byNode.get(id)
      if (!n) continue
      const cl = choicesByNode.get(id) || []
      for (const c of cl) q.push(c.jumpToNodeId)
      if (n.next) q.push(n.next)
    }
    const all = (chapterNodes.get(ch.chapterId) || []).map((n) => n.nodeId)
    for (const id of all) {
      if (!reachable.has(id)) warnings.push({ type: 'unreachable_node', chapterId: ch.chapterId, nodeId: id })
    }
    const endings = (chapterNodes.get(ch.chapterId) || []).filter((n) => n.type === 'ending')
    if (endings.length < 5) warnings.push({ type: 'too_few_endings', chapterId: ch.chapterId, count: endings.length })
  }

  const report = { ok: errors.length === 0, errors, warnings }
  fs.writeFileSync(path.join(ROOT, 'config', 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  const md = [
    `# Story Config Report`,
    `- ok: ${report.ok}`,
    `- errors: ${errors.length}`,
    `- warnings: ${warnings.length}`,
    '',
    '## Errors',
    ...errors.map((e) => `- ${e.type} ${JSON.stringify(e)}`),
    '',
    '## Warnings',
    ...warnings.map((w) => `- ${w.type} ${JSON.stringify(w)}`),
    '',
  ].join('\n')
  fs.writeFileSync(path.join(ROOT, 'config', 'report.md'), md, 'utf8')
  console.log(md)
  process.exit(report.ok ? 0 : 1)
}

main()

