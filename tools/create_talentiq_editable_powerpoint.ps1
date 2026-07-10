param(
    [string]$OutputPath = "$PSScriptRoot\..\presentations\TalentIQ_Dashboard_Company_Showcase_EDITABLE.pptx"
)

$ErrorActionPreference = "Stop"

$msoTrue = -1
$msoFalse = 0
$ppLayoutBlank = 12
$msoTextOrientationHorizontal = 1
$msoShapeRectangle = 1
$msoShapeRoundedRectangle = 5

function RgbFromHex([string]$hex) {
    $clean = $hex.TrimStart("#")
    $r = [Convert]::ToInt32($clean.Substring(0, 2), 16)
    $g = [Convert]::ToInt32($clean.Substring(2, 2), 16)
    $b = [Convert]::ToInt32($clean.Substring(4, 2), 16)
    return $r + ($g * 256) + ($b * 65536)
}

$C = @{
    White = "FFFFFF"; Bg = "F8FAFC"; Slate900 = "0F172A"; Slate800 = "1E293B"
    Slate700 = "334155"; Slate600 = "475569"; Slate500 = "64748B"; Slate300 = "CBD5E1"
    Slate200 = "E2E8F0"; Slate100 = "F1F5F9"; Teal800 = "115E59"; Teal700 = "0F766E"
    Teal600 = "0D9488"; Teal400 = "2DD4BF"; Teal200 = "99F6E4"; Teal100 = "CCFBF1"
    Teal50 = "F0FDFA"; Amber = "D97706"; Amber100 = "FEF3C7"; Red = "DC2626"
    Red100 = "FEE2E2"; Green = "16A34A"; Green100 = "DCFCE7"; Blue = "2563EB"
    Blue100 = "DBEAFE"; Purple = "7C3AED"; Purple100 = "EDE9FE"
}

$Metrics = @{
    AsOf = "2026-06-23"; MsdMonth = "2026-05"; BenchWeek = "2026-W25"
    StoredReqs = 3595; StoredMsd = 15269; StoredBench = 180
    TotalActive = 101; Open = 81; Offered = 20; NewReqs = 11; AvgAging = "51.1d"
    OffOpen = 37; OnOpen = 44; OffOffered = 8; OnOffered = 12
    Positions = 81; BenchResources = 97
}
$ClientTop = @(
    @{ Name = "PNC Bank"; Value = 20 },
    @{ Name = "LPL"; Value = 13 },
    @{ Name = "Genentech"; Value = 12 }
)
$Aging = @(
    @{ Label = "Pre-appr."; Value = 2; Color = "5EEAD4" },
    @{ Label = "1-30 d"; Value = 47; Color = "0D9488" },
    @{ Label = "31-60 d"; Value = 23; Color = "64748B" },
    @{ Label = "61-90 d"; Value = 9; Color = "D97706" },
    @{ Label = "91+ d"; Value = 20; Color = "DC2626" }
)

function Add-ShapeBox($Slide, [double]$L, [double]$T, [double]$W, [double]$H, [string]$Fill, [string]$Line = "", [bool]$Round = $false) {
    $type = if ($Round) { $msoShapeRoundedRectangle } else { $msoShapeRectangle }
    $shape = $Slide.Shapes.AddShape($type, $L, $T, $W, $H)
    $shape.Fill.ForeColor.RGB = RgbFromHex $Fill
    $shape.Fill.Visible = $msoTrue
    if ([string]::IsNullOrWhiteSpace($Line)) {
        $shape.Line.Visible = $msoFalse
    } else {
        $shape.Line.Visible = $msoTrue
        $shape.Line.ForeColor.RGB = RgbFromHex $Line
        $shape.Line.Weight = 1
    }
    return $shape
}

function Add-Text($Slide, [double]$L, [double]$T, [double]$W, [double]$H, [string]$Text, [int]$Size = 14, [string]$Color = "1E293B", [bool]$Bold = $false, [string]$Align = "left") {
    $shape = $Slide.Shapes.AddTextbox($msoTextOrientationHorizontal, $L, $T, $W, $H)
    $shape.TextFrame2.TextRange.Text = $Text
    $shape.TextFrame2.TextRange.Font.Name = "Aptos"
    $shape.TextFrame2.TextRange.Font.Size = $Size
    $shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RgbFromHex $Color
    $shape.TextFrame2.TextRange.Font.Bold = if ($Bold) { $msoTrue } else { $msoFalse }
    $shape.TextFrame2.WordWrap = $msoTrue
    $shape.TextFrame2.MarginLeft = 2
    $shape.TextFrame2.MarginRight = 2
    $shape.TextFrame2.MarginTop = 2
    $shape.TextFrame2.MarginBottom = 2
    if ($Align -eq "center") { $shape.TextFrame2.TextRange.ParagraphFormat.Alignment = 2 }
    elseif ($Align -eq "right") { $shape.TextFrame2.TextRange.ParagraphFormat.Alignment = 3 }
    else { $shape.TextFrame2.TextRange.ParagraphFormat.Alignment = 1 }
    return $shape
}

function Add-BoxText($Slide, [double]$L, [double]$T, [double]$W, [double]$H, [string]$Text, [int]$Size = 12, [string]$Color = "1E293B", [bool]$Bold = $false, [string]$Fill = "FFFFFF", [string]$Line = "E2E8F0", [bool]$Round = $true, [string]$Align = "left") {
    $shape = Add-ShapeBox $Slide $L $T $W $H $Fill $Line $Round
    $shape.TextFrame2.TextRange.Text = $Text
    $shape.TextFrame2.TextRange.Font.Name = "Aptos"
    $shape.TextFrame2.TextRange.Font.Size = $Size
    $shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RgbFromHex $Color
    $shape.TextFrame2.TextRange.Font.Bold = if ($Bold) { $msoTrue } else { $msoFalse }
    $shape.TextFrame2.WordWrap = $msoTrue
    $shape.TextFrame2.MarginLeft = 10
    $shape.TextFrame2.MarginRight = 10
    $shape.TextFrame2.MarginTop = 8
    $shape.TextFrame2.MarginBottom = 8
    if ($Align -eq "center") { $shape.TextFrame2.TextRange.ParagraphFormat.Alignment = 2 }
    elseif ($Align -eq "right") { $shape.TextFrame2.TextRange.ParagraphFormat.Alignment = 3 }
    else { $shape.TextFrame2.TextRange.ParagraphFormat.Alignment = 1 }
    return $shape
}

function Add-Header($Slide, [string]$Eyebrow, [string]$Title, [string]$Subtitle = "") {
    Add-Text $Slide 42 24 240 18 $Eyebrow.ToUpper() 8 $C.Teal700 $true | Out-Null
    Add-Text $Slide 42 45 650 38 $Title 24 $C.Slate900 $true | Out-Null
    if ($Subtitle) { Add-Text $Slide 44 82 650 26 $Subtitle 10 $C.Slate500 $false | Out-Null }
    Add-Text $Slide 790 34 125 28 "TalentIQ" 16 $C.Teal700 $true "right" | Out-Null
}

function Add-Footer($Slide, [int]$Num) {
    Add-ShapeBox $Slide 42 506 875 1 $C.Slate200 | Out-Null
    Add-Text $Slide 42 510 230 16 "TalentIQ dashboard showcase" 7 $C.Slate500 | Out-Null
    Add-Text $Slide 860 510 55 16 "$Num" 7 $C.Slate500 $false "right" | Out-Null
}

function Add-Kpi($Slide, [double]$L, [double]$T, [double]$W, [string]$Label, [string]$Value, [string]$Sub, [string]$Accent = "0D9488") {
    Add-ShapeBox $Slide $L $T $W 78 $C.White $C.Slate200 $true | Out-Null
    Add-ShapeBox $Slide $L $T $W 3 $Accent | Out-Null
    Add-Text $Slide ($L + 10) ($T + 10) ($W - 20) 16 $Label.ToUpper() 7 $C.Slate500 $true | Out-Null
    Add-Text $Slide ($L + 10) ($T + 30) ($W - 20) 30 $Value 23 $C.Slate900 $true | Out-Null
    Add-Text $Slide ($L + 10) ($T + 59) ($W - 20) 14 $Sub 8 $C.Slate500 | Out-Null
}

function Add-Bullets($Slide, [double]$L, [double]$T, [double]$W, [double]$H, [string]$Title, [string[]]$Items, [string]$Fill = "FFFFFF") {
    Add-ShapeBox $Slide $L $T $W $H $Fill $C.Slate200 $true | Out-Null
    Add-Text $Slide ($L + 14) ($T + 12) ($W - 28) 24 $Title 14 $C.Slate900 $true | Out-Null
    $body = ($Items | ForEach-Object { "- $_" }) -join "`r"
    Add-Text $Slide ($L + 14) ($T + 45) ($W - 28) ($H - 55) $body 10 $C.Slate600 | Out-Null
}

function Add-BarChart($Slide, [double]$L, [double]$T, [double]$W, [double]$H, [array]$Rows) {
    $max = ($Rows | ForEach-Object { $_.Value } | Measure-Object -Maximum).Maximum
    $i = 0
    foreach ($row in $Rows) {
        $y = $T + ($i * 34)
        Add-Text $Slide $L $y 95 22 $row.Name 9 $C.Slate700 $true | Out-Null
        Add-ShapeBox $Slide ($L + 105) ($y + 5) ($W - 150) 12 $C.Slate100 "" $true | Out-Null
        $barW = [Math]::Max(8, ($W - 150) * ($row.Value / $max))
        Add-ShapeBox $Slide ($L + 105) ($y + 5) $barW 12 $C.Teal600 "" $true | Out-Null
        Add-Text $Slide ($L + $W - 36) $y 35 20 "$($row.Value)" 9 $C.Slate700 $true "right" | Out-Null
        $i++
    }
}

function Add-Pipeline($Slide, [double]$L, [double]$T, [double]$W, [array]$Rows) {
    $total = ($Rows | ForEach-Object { $_.Value } | Measure-Object -Sum).Sum
    $x = $L
    foreach ($row in $Rows) {
        $segW = [Math]::Max(24, $W * ($row.Value / $total))
        Add-ShapeBox $Slide $x $T $segW 26 $row.Color | Out-Null
        Add-Text $Slide $x ($T + 33) ([Math]::Max($segW, 62)) 32 "$($row.Label)`r$($row.Value)" 7 $C.Slate600 $false "center" | Out-Null
        $x += $segW
    }
}

function Add-Slide {
    param($Presentation)
    $slide = $Presentation.Slides.Add($Presentation.Slides.Count + 1, $ppLayoutBlank)
    Add-ShapeBox $slide 0 0 960 540 $C.Bg | Out-Null
    return $slide
}

$outDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$pp = $null
$pres = $null
try {
    $pp = New-Object -ComObject PowerPoint.Application
    $pres = $pp.Presentations.Add($msoTrue)
    $pres.PageSetup.SlideWidth = 960
    $pres.PageSetup.SlideHeight = 540

    $s = Add-Slide $pres
    Add-ShapeBox $s 0 0 960 540 $C.Slate900 | Out-Null
    Add-ShapeBox $s 0 0 310 540 $C.Teal800 | Out-Null
    Add-ShapeBox $s 310 0 6 540 $C.Teal400 | Out-Null
    Add-Text $s 55 62 230 18 "INTERNAL PRODUCT SHOWCASE" 8 $C.Teal100 $true | Out-Null
    Add-Text $s 55 104 380 58 "TalentIQ" 42 $C.White $true | Out-Null
    Add-Text $s 58 170 345 48 "Recruitment intelligence and bench-to-demand matching for delivery teams" 17 $C.Teal100 $true | Out-Null
    Add-Text $s 370 80 500 70 "One dashboard for staffing demand, bench supply, skill fit, and operational follow-through." 25 $C.White $true | Out-Null
    Add-Text $s 372 167 430 42 "Built for company leaders, Talent Acquisition, Delivery, Resource Management, and account teams." 13 $C.Slate300 | Out-Null
    Add-Kpi $s 370 320 126 "Open" "$($Metrics.Open)" "positions" $C.Teal400
    Add-Kpi $s 515 320 126 "Bench" "$($Metrics.BenchResources)" "matched resources" $C.Green
    Add-Kpi $s 660 320 126 "Active" "$($Metrics.TotalActive)" "requisitions" $C.Amber
    Add-Text $s 370 438 450 22 "Latest TA snapshot: $($Metrics.AsOf) | MSD: $($Metrics.MsdMonth) | Bench: $($Metrics.BenchWeek)" 9 $C.Slate300 | Out-Null

    $s = Add-Slide $pres
    Add-Header $s "Why TalentIQ exists" "The company problem: demand and supply move faster than spreadsheets" "TalentIQ turns weekly operational data into a shared staffing cockpit."
    Add-Bullets $s 55 135 255 170 "Fragmented inputs" @("TA requisitions, MSD allocations, and bench IDs live in separate files.", "Leaders spend time reconciling rather than deciding.")
    Add-Bullets $s 352 135 255 170 "Hidden demand risk" @("Aging openings, shore split, and client concentration are hard to read quickly.", "Leakage and delayed starts need earlier visibility.")
    Add-Bullets $s 649 135 255 170 "Slow resource matching" @("Skill, grade, shore, tenure, and project history are matched manually.", "Good internal candidates can be missed while new hiring continues.")
    Add-BoxText $s 88 372 785 55 "TalentIQ provides the operating layer between recruiting demand and available delivery capacity." 20 $C.Teal700 $true $C.Teal50 $C.Teal200 $true "center" | Out-Null
    Add-Footer $s 2

    $s = Add-Slide $pres
    Add-Header $s "Dashboard" "Executive view of recruiting health" "Latest snapshots become KPIs, aging signals, client demand, and shore split."
    Add-Kpi $s 46 112 153 "Active" "$($Metrics.TotalActive)" "reqs" $C.Teal600
    Add-Kpi $s 217 112 153 "Open" "$($Metrics.Open)" "positions" $C.Teal600
    Add-Kpi $s 388 112 153 "Offered" "$($Metrics.Offered)" "in offer" $C.Green
    Add-Kpi $s 559 112 153 "New" "$($Metrics.NewReqs)" "<= 10 days" $C.Blue
    Add-Kpi $s 730 112 153 "Avg age" "$($Metrics.AvgAging)" "active reqs" $C.Amber
    Add-Text $s 56 235 300 26 "Top client demand" 14 $C.Slate900 $true | Out-Null
    Add-BarChart $s 56 270 360 110 $ClientTop
    Add-Text $s 454 235 350 26 "Aging pipeline" 14 $C.Slate900 $true | Out-Null
    Add-Pipeline $s 454 278 420 $Aging
    Add-BoxText $s 454 388 420 48 "Open split: Offshore $($Metrics.OffOpen) / Onshore $($Metrics.OnOpen) | Offered split: Offshore $($Metrics.OffOffered) / Onshore $($Metrics.OnOffered)" 11 $C.Slate700 $true $C.White $C.Slate200 $true "center" | Out-Null
    Add-Footer $s 3

    $s = Add-Slide $pres
    Add-Header $s "Data governance" "Controlled weekly intake keeps the dashboard credible" "Uploads are period-tagged; history is preserved while the UI reads the latest snapshot."
    Add-BoxText $s 62 132 155 62 "TA data`rexact date" 12 $C.Slate800 $true $C.Blue100 $C.Slate200 $true "center" | Out-Null
    Add-BoxText $s 250 132 155 62 "MSD allocation`rmonth" 12 $C.Slate800 $true $C.Teal100 $C.Slate200 $true "center" | Out-Null
    Add-BoxText $s 438 132 155 62 "Bench IDs`rISO week" 12 $C.Slate800 $true $C.Green100 $C.Slate200 $true "center" | Out-Null
    Add-BoxText $s 626 132 155 62 "PostgreSQL`rsnapshots" 12 $C.Slate800 $true $C.Amber100 $C.Slate200 $true "center" | Out-Null
    Add-Bullets $s 66 248 380 145 "Guardrails" @("Duplicate-period checks prevent accidental overwrite.", "Replace flow is explicit when a period already exists.", "Upload modal shows already-loaded periods before submission.")
    Add-Bullets $s 500 248 360 145 "Current local data" @("Stored requisition rows: $($Metrics.StoredReqs)", "Stored MSD allocation rows: $($Metrics.StoredMsd)", "Stored bench ID rows: $($Metrics.StoredBench)", "Installer creates tables and dependencies.")
    Add-Footer $s 4

    $s = Add-Slide $pres
    Add-Header $s "Recruitment analytics" "What the dashboard solves for Talent Acquisition and leadership" "The dashboard converts requisition records into operational signals for follow-up."
    Add-Bullets $s 58 125 380 95 "Open and Offered tracking" @("Measures active demand and offer-stage conversion by latest TA snapshot.")
    Add-Bullets $s 520 125 380 95 "Aging management" @("Buckets requisitions into pre-approved, 1-30, 31-60, 61-90, and 91+ day risk bands.")
    Add-Bullets $s 58 248 380 95 "Client concentration" @("Shows which client accounts are driving demand and require staffing focus.")
    Add-Bullets $s 520 248 380 95 "Onshore/offshore split" @("Separates demand by location model so matching uses the right delivery pool.")
    Add-Bullets $s 58 371 380 95 "Leakage visibility" @("Estimates revenue exposure from delayed fulfillment.")
    Add-Bullets $s 520 371 380 95 "Grade distribution" @("Surfaces level mix for open positions to align hiring and bench redeployment.")
    Add-Footer $s 5

    $s = Add-Slide $pres
    Add-Header $s "Skill demand" "Open positions become match-ready demand records" "TalentIQ extracts role, client, priority, grade, skills, age, location, and LOB/vertical from TA data."
    Add-Kpi $s 68 122 150 "Match-ready" "$($Metrics.Positions)" "open positions" $C.Teal600
    Add-Kpi $s 250 122 150 "Skills" "Parsed" "Primary + L3" $C.Blue
    Add-Kpi $s 432 122 150 "Priority" "Aging" "risk signal" $C.Amber
    Add-Kpi $s 614 122 150 "Grade" "+/- 2" "compatibility" $C.Green
    Add-Bullets $s 75 270 360 130 "Position intelligence" @("Only Open requisitions enter skill mapping.", "Skills are normalized from primary and L3 fields.", "Country becomes onshore/offshore context.")
    Add-Bullets $s 500 270 360 130 "Company context" @("Demand is no longer just a row in a workbook.", "Each position can be matched, filtered, exported, and explained.") $C.Teal50
    Add-Footer $s 6

    $s = Add-Slide $pres
    Add-Header $s "Bench resources" "A governed inventory of internal supply" "Combines bench employee IDs with latest MSD allocation data and manual corrections."
    Add-Kpi $s 60 122 150 "Matched" "$($Metrics.BenchResources)" "bench resources" $C.Green
    Add-Kpi $s 242 122 150 "Sources" "Upload + manual" "tracked" $C.Teal600
    Add-Kpi $s 424 122 150 "Snapshot" "Effective date" "controlled updates" $C.Blue
    Add-Kpi $s 606 122 150 "Export" "Excel" "handoff" $C.Amber
    Add-Bullets $s 72 272 380 145 "Manual and file sources" @("Manual ID entry supports incomplete source files.", "Inventory marks source as Manual or File Upload.", "Columns, filters, search, delete, and export support daily use.")
    Add-BoxText $s 525 285 335 90 "Upload redirect`rThe upload flow includes a button that opens Skill Mapping > Bench Resources and focuses the manual employee ID section." 13 $C.Teal700 $true $C.Teal50 $C.Teal200 $true "center" | Out-Null
    Add-Footer $s 7

    $s = Add-Slide $pres
    Add-Header $s "Skill mapping" "How TalentIQ ranks internal candidates for open positions" "The match engine combines skill fit, shore alignment, grade compatibility, and bench context."
    Add-BoxText $s 60 130 145 60 "Position`rrequirements" 11 $C.Slate800 $true $C.Blue100 $C.Slate200 $true "center" | Out-Null
    Add-BoxText $s 230 130 145 60 "Same-shore`rpool" 11 $C.Slate800 $true $C.Teal100 $C.Slate200 $true "center" | Out-Null
    Add-BoxText $s 400 130 145 60 "Skill + grade`rscoring" 11 $C.Slate800 $true $C.Green100 $C.Slate200 $true "center" | Out-Null
    Add-BoxText $s 570 130 145 60 "Ranked`rcandidates" 11 $C.Slate800 $true $C.Amber100 $C.Slate200 $true "center" | Out-Null
    Add-BoxText $s 740 130 145 60 "Excel / AI`rfollow-up" 11 $C.Slate800 $true $C.Purple100 $C.Slate200 $true "center" | Out-Null
    Add-Bullets $s 75 270 370 145 "Scoring logic" @("Fuzzy skill comparison handles exact and partial matches.", "Confidence bands: High >= 80, Medium 60-79, Low 40-59.", "Grade compatibility allows nearby levels.")
    Add-Bullets $s 515 270 360 145 "Company value" @("Redeploy bench resources sooner.", "Reduce spreadsheet matching.", "Focus teams on highest-confidence staffing options.") $C.Teal50
    Add-Footer $s 8

    $s = Add-Slide $pres
    Add-Header $s "AI assistance" "LLM matching adds reasoning on top of structured scoring" "TalentIQ can call OpenAI for explainable recommendations when an API key is configured."
    Add-Bullets $s 70 132 240 210 "Structured AI output" @("Summary", "Recommendation", "Top matches", "Resource-level rationale")
    Add-Bullets $s 360 132 240 210 "Governed calls" @("Candidate caps", "No-skill positions skipped", "Cost estimate before run", "Structured JSON response")
    Add-Bullets $s 650 132 240 210 "Cached results" @("Cache key by position/resources", "Avoids repeated spend", "Supports rematch when inputs change")
    Add-BoxText $s 145 408 670 45 "Use deterministic scoring for scale, then AI for nuanced shortlists and decision support." 16 $C.Teal700 $true $C.Teal50 $C.Teal200 $true "center" | Out-Null
    Add-Footer $s 9

    $s = Add-Slide $pres
    Add-Header $s "Resource search and history" "A faster way to answer staffing follow-up questions" "Search resources and inspect employee project history across uploaded MSD months."
    Add-Bullets $s 75 135 370 185 "Search capabilities" @("Search all MSD resources by employee, skill, designation, client, or project.", "Inspect current allocation details, grade, LOB, vertical, and location.", "Reconstruct project history across uploaded months.")
    Add-Bullets $s 515 135 370 185 "Operating questions answered" @("Does this resource have relevant client experience?", "What has the employee worked on recently?", "Can the resource be shortlisted for an open demand?") $C.Teal50
    Add-BoxText $s 120 390 720 45 "Practical workflow: search, inspect history, shortlist, match, export." 17 $C.Slate900 $true $C.White $C.Slate200 $true "center" | Out-Null
    Add-Footer $s 10

    $s = Add-Slide $pres
    Add-Header $s "Architecture and portability" "Designed as a local company application with a reliable setup path" "The start and setup scripts make the project transferable to another Windows machine."
    Add-BoxText $s 90 132 170 62 "React UI`rlocalhost:5173" 11 $C.Slate800 $true $C.Blue100 $C.Slate200 $true "center" | Out-Null
    Add-BoxText $s 310 132 170 62 "FastAPI`rlocalhost:8000" 11 $C.Slate800 $true $C.Teal100 $C.Slate200 $true "center" | Out-Null
    Add-BoxText $s 530 132 170 62 "PostgreSQL`rtalentiq DB" 11 $C.Slate800 $true $C.Green100 $C.Slate200 $true "center" | Out-Null
    Add-Bullets $s 75 270 370 150 "Portable installer" @("setup.bat configures DATABASE_URL and initializes tables.", "start.bat creates venv, installs dependencies, installs npm packages, and launches services.")
    Add-Bullets $s 515 270 370 150 "Database tables" @("requisitions", "msd_allocations", "bench_employee_ids", "ai_match_cache") $C.Teal50
    Add-Footer $s 11

    $s = Add-Slide $pres
    Add-Header $s "Business impact" "What TalentIQ changes for the company" "A shared operating rhythm for demand, supply, matching, and follow-through."
    Add-Bullets $s 75 128 370 105 "Leadership" @("Portfolio visibility into open demand, aging, client concentration, and staffing risk.")
    Add-Bullets $s 515 128 370 105 "Talent Acquisition" @("Cleaner upload governance, faster pipeline review, and LOB-filtered requisition intake.")
    Add-Bullets $s 75 268 370 105 "Delivery" @("Better internal candidate discovery before escalating external hiring.")
    Add-Bullets $s 515 268 370 105 "Resource Management" @("Managed bench inventory, manual corrections, exports, and effective-date controls.")
    Add-BoxText $s 100 430 760 45 "Recommended demo storyline: Upload data -> review dashboard -> inspect bench resources -> run skill mapping -> use AI shortlist -> export actions." 14 $C.Slate900 $true $C.Teal50 $C.Teal200 $true "center" | Out-Null
    Add-Footer $s 12

    $s = Add-Slide $pres
    Add-ShapeBox $s 0 0 960 540 $C.Slate900 | Out-Null
    Add-Text $s 60 62 220 18 "CLOSING MESSAGE" 8 $C.Teal200 $true | Out-Null
    Add-Text $s 60 105 700 60 "TalentIQ is a staffing decision system, not just a dashboard." 28 $C.White $true | Out-Null
    Add-Text $s 64 195 600 58 "It connects company demand, available internal supply, skill evidence, and governed operations into one repeatable workflow." 16 $C.Slate300 | Out-Null
    Add-Bullets $s 75 302 360 130 "Core promise" @("Reduce manual reconciliation.", "Prioritize aging and high-value demand.", "Redeploy internal talent faster.", "Create a defensible weekly staffing rhythm.") "0F172A"
    Add-BoxText $s 575 322 230 86 "Next step:`rDemo with live data and confirm rollout owners." 16 $C.Teal100 $true "123D3A" $C.Teal400 $true "center" | Out-Null

    if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }
    $pres.SaveAs((Resolve-Path -LiteralPath $outDir).Path + "\" + (Split-Path -Leaf $OutputPath))
    Write-Host "Created editable PowerPoint: $OutputPath"
}
finally {
    if ($pres) { $pres.Close() | Out-Null }
    if ($pp) { $pp.Quit() | Out-Null }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
