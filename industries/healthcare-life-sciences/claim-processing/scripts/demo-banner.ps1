<#
.SYNOPSIS
    Big colorful demo banner for the Fidelis x Copilot presentation.

.DESCRIPTION
    Clears the terminal (hiding any prep notes / scenario prompts above) and
    prints a large, colorful "FIDELIS x COPILOT" splash in a bold block font.
    Run this right before the live-build finale so the audience only ever sees
    a clean, branded screen.

.EXAMPLE
    ./scripts/demo-banner.ps1
#>

# Make sure the block-drawing characters render correctly.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# Clear the screen so nothing above the banner is visible.
# Fall back to blank lines when there's no real console handle (e.g. piped shells).
try { Clear-Host } catch { 1..50 | ForEach-Object { Write-Host "" } }

# Breathing room at the top.
1..2 | ForEach-Object { Write-Host "" }

$fidelis = @(
    ' ███████╗ ██╗ ██████╗  ███████╗ ██╗      ██╗ ███████╗',
    ' ██╔════╝ ██║ ██╔══██╗ ██╔════╝ ██║      ██║ ██╔════╝',
    ' █████╗   ██║ ██║  ██║ █████╗   ██║      ██║ ███████╗',
    ' ██╔══╝   ██║ ██║  ██║ ██╔══╝   ██║      ██║ ╚════██║',
    ' ██║      ██║ ██████╔╝ ███████╗ ███████╗ ██║ ███████║',
    ' ╚═╝      ╚═╝ ╚═════╝  ╚══════╝ ╚══════╝ ╚═╝ ╚══════╝'
)

$copilot = @(
    '  ██████╗  ██████╗  ██████╗  ██╗ ██╗       ██████╗  ████████╗',
    ' ██╔════╝ ██╔═══██╗ ██╔══██╗ ██║ ██║      ██╔═══██╗ ╚══██╔══╝',
    ' ██║      ██║   ██║ ██████╔╝ ██║ ██║      ██║   ██║    ██║   ',
    ' ██║      ██║   ██║ ██╔═══╝  ██║ ██║      ██║   ██║    ██║   ',
    ' ╚██████╗ ╚██████╔╝ ██║      ██║ ███████╗ ╚██████╔╝    ██║   ',
    '  ╚═════╝  ╚═════╝  ╚═╝      ╚═╝ ╚══════╝  ╚═════╝     ╚═╝   '
)

# FIDELIS - cool corporate blues/cyans.
$fidelisColors = @('Blue', 'Blue', 'Cyan', 'Cyan', 'Cyan', 'DarkCyan')
for ($i = 0; $i -lt $fidelis.Count; $i++) {
    Write-Host $fidelis[$i] -ForegroundColor $fidelisColors[$i]
}

Write-Host ""
$heart = [char]0x2764
Write-Host "                          x   $heart" -ForegroundColor Red
Write-Host ""

# COPILOT - warm rainbow gradient.
$copilotColors = @('Magenta', 'Magenta', 'Red', 'Yellow', 'Green', 'Cyan')
for ($i = 0; $i -lt $copilot.Count; $i++) {
    Write-Host $copilot[$i] -ForegroundColor $copilotColors[$i]
}

Write-Host ""
Write-Host "            Intelligent Claim Processing   -   powered by Azure AI Foundry" -ForegroundColor DarkGray
Write-Host ""

# Breathing room at the bottom so the banner sits clean on screen.
1..3 | ForEach-Object { Write-Host "" }
