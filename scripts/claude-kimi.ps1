# Launch Claude Code against Moonshot's Anthropic-compatible endpoint (Kimi).
#
# Requires MOONSHOT_KEY in your user environment:
#   [Environment]::SetEnvironmentVariable("MOONSHOT_KEY", "sk-...", "User")
# then open a new terminal.
#
# Usage:  .\scripts\claude-kimi.ps1  [any extra claude args]

# Terminals opened before the variable was saved won't have it in their
# process environment, so fall back to reading the User environment directly.
if (-not $env:MOONSHOT_KEY) {
    $env:MOONSHOT_KEY = [Environment]::GetEnvironmentVariable("MOONSHOT_KEY", "User")
}

if (-not $env:MOONSHOT_KEY) {
    Write-Error "MOONSHOT_KEY is not set. See the header of this script."
    exit 1
}

# $env: writes land in the process environment, not a script scope, so the
# terminal would keep pointing at Moonshot after the session ends. Snapshot
# what we touch and put it back on the way out.
$names = 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL',
         'CLAUDE_CODE_SUBAGENT_MODEL', 'ANTHROPIC_API_KEY'
$saved = @{}
foreach ($n in $names) { $saved[$n] = [Environment]::GetEnvironmentVariable($n) }

try {
    $env:ANTHROPIC_BASE_URL         = "https://api.moonshot.ai/anthropic"
    $env:ANTHROPIC_AUTH_TOKEN       = $env:MOONSHOT_KEY
    $env:ANTHROPIC_MODEL            = "kimi-k2.7-code"
    $env:CLAUDE_CODE_SUBAGENT_MODEL = "kimi-k2.7-code"

    # ANTHROPIC_API_KEY would take precedence and send the wrong auth header.
    Remove-Item Env:\ANTHROPIC_API_KEY -ErrorAction SilentlyContinue

    Write-Host "-> $env:ANTHROPIC_BASE_URL  ($env:ANTHROPIC_MODEL)" -ForegroundColor DarkGray
    claude @args
}
finally {
    foreach ($n in $names) {
        if ($null -eq $saved[$n]) { Remove-Item "Env:\$n" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($n, $saved[$n]) }
    }
}
