$packageName = 'bpm4b'
$installDir = "$(Join-Path $Env:ProgramFiles 'bpm4b')"

Uninstall-BinFile -Name 'bpm4b'

if (Test-Path $installDir) {
    Remove-Item $installDir -Recurse -Force
}

Write-Host "bpm4b has been uninstalled."
