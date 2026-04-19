param(
  [string]$StoryPath = "./config/story.json",
  [string]$ReportJson = "./config/report.json",
  [string]$ReportMd = "./config/report.md"
)

$cfg = Get-Content -Raw -Path $StoryPath | ConvertFrom-Json

$byNode = @{}
foreach ($n in $cfg.nodes) { $byNode[$n.nodeId] = $n }

$choicesByNode = @{}
foreach ($c in $cfg.choices) {
  if (-not $choicesByNode.ContainsKey($c.nodeId)) { $choicesByNode[$c.nodeId] = @() }
  $choicesByNode[$c.nodeId] += $c
}

$errors = @()
$warnings = @()

foreach ($ch in $cfg.chapters) {
  if (-not $byNode.ContainsKey($ch.entryNodeId)) {
    $errors += @{ type = "missing_entry"; chapterId = $ch.chapterId; entryNodeId = $ch.entryNodeId }
  }
}

foreach ($n in $cfg.nodes) {
  if ($n.type -eq "choice") {
    $list = @()
    if ($choicesByNode.ContainsKey($n.nodeId)) { $list = $choicesByNode[$n.nodeId] }
    if ($list.Count -eq 0) { $errors += @{ type = "choice_node_no_choices"; nodeId = $n.nodeId } }
  } elseif ($n.type -ne "ending") {
    $hasNext = -not [string]::IsNullOrWhiteSpace($n.next)
    $hasChoices = $choicesByNode.ContainsKey($n.nodeId) -and $choicesByNode[$n.nodeId].Count -gt 0
    if (-not $hasNext -and -not $hasChoices) { $errors += @{ type = "dead_end"; nodeId = $n.nodeId } }
  }
}

foreach ($c in $cfg.choices) {
  if (-not $byNode.ContainsKey($c.nodeId)) { $errors += @{ type = "choice_missing_node"; choiceId = $c.choiceId; nodeId = $c.nodeId } }
  if (-not $byNode.ContainsKey($c.jumpToNodeId)) { $errors += @{ type = "choice_bad_jump"; choiceId = $c.choiceId; jumpToNodeId = $c.jumpToNodeId } }
}

foreach ($ch in $cfg.chapters) {
  $reachable = @{}
  $queue = New-Object System.Collections.Generic.Queue[string]
  $queue.Enqueue($ch.entryNodeId)
  $endingCount = 0
  while ($queue.Count -gt 0) {
    $id = $queue.Dequeue()
    if ($reachable.ContainsKey($id)) { continue }
    $reachable[$id] = $true
    if (-not $byNode.ContainsKey($id)) { continue }
    $n = $byNode[$id]
    if ($n.type -eq "ending") { $endingCount++ }
    if ($choicesByNode.ContainsKey($id)) {
      foreach ($c in $choicesByNode[$id]) { $queue.Enqueue($c.jumpToNodeId) }
    }
    if (-not [string]::IsNullOrWhiteSpace($n.next)) { $queue.Enqueue($n.next) }
  }
  if ($endingCount -lt 5) { $warnings += @{ type = "too_few_endings"; chapterId = $ch.chapterId; count = $endingCount } }
}

$report = [ordered]@{
  ok = ($errors.Count -eq 0)
  errors = $errors
  warnings = $warnings
}

($report | ConvertTo-Json -Depth 20) | Set-Content -Path $ReportJson -Encoding UTF8

$md = @()
$md += "# Story Config Report"
$md += "- ok: $($report.ok)"
$md += "- errors: $($errors.Count)"
$md += "- warnings: $($warnings.Count)"
$md += ""
$md += "## Errors"
foreach ($e in $errors) { $md += "- $($e.type) $($e | ConvertTo-Json -Compress)" }
$md += ""
$md += "## Warnings"
foreach ($w in $warnings) { $md += "- $($w.type) $($w | ConvertTo-Json -Compress)" }
$md += ""

$md -join "`n" | Set-Content -Path $ReportMd -Encoding UTF8

Write-Host ($md -join "`n")
if (-not $report.ok) { exit 1 }

