$ErrorActionPreference = 'Stop';
$toolsDir   = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$packageDir = "$(Split-Path -parent $toolsDir)"
$installDir = "$(Join-Path $Env:ProgramFiles 'bpm4b')"

$packageArgs = @{
  packageName   = 'bpm4b'
  unzipLocation = $installDir
  fileType      = 'EXE'
  # Note: Initially we assume the binaries are in the tools folder or downloaded
  # For a real Choco package, you'd download from GH Releases
}

# Ensure install directory exists
if (!(Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force
}

# Copy files from tools to install directory
# In a local test, we expect bpm4b.exe and DLLs to be in 'tools'
Copy-Item "$toolsDir\*" $installDir -Recurse -Force

# Create shim for the executable
Install-BinFile -Name 'bpm4b' -Path "$installDir\bpm4b.exe"

Write-Host "bpm4b has been installed to $installDir"
Write-Host "You can now run 'bpm4b' from any terminal."
