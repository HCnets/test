import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

function readText(p) {
  return fs.readFileSync(p, 'utf8')
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length)
  const header = splitCsvLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    const r = {}
    for (let j = 0; j < header.length; j++) r[header[j]] = cols[j] === undefined ? '' : cols[j]
    rows.push(r)
  }
  return rows
}

function splitCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          q = false
        }
      } else cur += c
    } else {
      if (c === ',') {
        out.push(cur)
        cur = ''
      } else if (c === '"') q = true
      else cur += c
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function toBool01(v) {
  return v === '1' || v.toLowerCase() === 'true'
}

function main() {
  const cfgDir = path.join(ROOT, 'config')
  const chapters = parseCsv(readText(path.join(cfgDir, 'chapters.csv')))
  const nodes = parseCsv(readText(path.join(cfgDir, 'nodes.csv')))
  const choices = parseCsv(readText(path.join(cfgDir, 'choices.csv')))
  const assets = parseCsv(readText(path.join(cfgDir, 'assets.csv')))

  const out = {
    schemaVersion: 1,
    generatedAt: Date.now(),
    chapters: chapters.map((c) => ({
      chapterId: c.chapterId,
      title: c.title,
      entryNodeId: c.entryNodeId,
      unlockCondition: c.unlockCondition || '',
      bundle: c.bundle || 'base',
    })),
    nodes: nodes.map((n) => ({
      nodeId: n.nodeId,
      chapterId: n.chapterId,
      type: n.type,
      speaker: n.speaker || '',
      text: n.text || '',
      bgKey: n.bgKey || '',
      charId: n.charId || '',
      bgmKey: n.bgmKey || '',
      sfxKey: n.sfxKey || '',
      next: n.next || '',
      rollbackable: toBool01(n.rollbackable),
      tags: (n.tags || '').split(',').map((x) => x.trim()).filter(Boolean),
      effectsOnEnter: n.effectsOnEnter || '',
    })),
    choices: choices.map((c) => ({
      choiceId: c.choiceId,
      nodeId: c.nodeId,
      text: c.text,
      condition: c.condition || '',
      effects: c.effects || '',
      jumpToNodeId: c.jumpToNodeId,
      hidden: toBool01(c.hidden),
    })),
    assets: assets.map((a) => ({
      assetId: a.assetId,
      type: a.type,
      path: a.path,
      bundle: a.bundle || 'base',
    })),
  }

  const outDir = path.join(cfgDir)
  fs.writeFileSync(path.join(outDir, 'story.json'), JSON.stringify(out, null, 2), 'utf8')
  console.log('Wrote', path.join(outDir, 'story.json'))
}

main()

