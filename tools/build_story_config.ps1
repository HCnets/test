param(
  [string]$ConfigDir = "./config",
  [string]$OutPath = "./config/story.json"
)

$chapters = Import-Csv (Join-Path $ConfigDir "chapters.csv")
$nodes = Import-Csv (Join-Path $ConfigDir "nodes.csv")
$choices = Import-Csv (Join-Path $ConfigDir "choices.csv")
$assets = Import-Csv (Join-Path $ConfigDir "assets.csv")

function ToBool([string]$v) {
  if ($null -eq $v) { return $false }
  $s = $v.Trim().ToLowerInvariant()
  return ($s -eq "1" -or $s -eq "true")
}

$out = [ordered]@{
  schemaVersion = 1
  generatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  chapters = @(
    $chapters | ForEach-Object {
      [ordered]@{
        chapterId = $_.chapterId
        title = $_.title
        entryNodeId = $_.entryNodeId
        unlockCondition = $_.unlockCondition
        bundle = $_.bundle
      }
    }
  )
  nodes = @(
    $nodes | ForEach-Object {
      [ordered]@{
        nodeId = $_.nodeId
        chapterId = $_.chapterId
        type = $_.type
        speaker = $_.speaker
        text = $_.text
        bgKey = $_.bgKey
        charId = $_.charId
        bgmKey = $_.bgmKey
        sfxKey = $_.sfxKey
        next = $_.next
        rollbackable = (ToBool $_.rollbackable)
        tags = @(
          ($_.tags -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
        )
        effectsOnEnter = $_.effectsOnEnter
      }
    }
  )
  choices = @(
    $choices | ForEach-Object {
      [ordered]@{
        choiceId = $_.choiceId
        nodeId = $_.nodeId
        text = $_.text
        condition = $_.condition
        effects = $_.effects
        jumpToNodeId = $_.jumpToNodeId
        hidden = (ToBool $_.hidden)
      }
    }
  )
  assets = @(
    $assets | ForEach-Object {
      [ordered]@{
        assetId = $_.assetId
        type = $_.type
        path = $_.path
        bundle = $_.bundle
      }
    }
  )
}

$json = $out | ConvertTo-Json -Depth 20
Set-Content -Path $OutPath -Value $json -Encoding UTF8
Write-Host "Wrote $OutPath"

