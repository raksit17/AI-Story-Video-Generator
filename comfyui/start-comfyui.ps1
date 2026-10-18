param(
  [string]$ComfyDir = "D:\AI\ComfyUI_windows_portable",
  [switch]$LowVram
)
$ErrorActionPreference = "Stop"
$workerPython = Join-Path $ComfyDir "python_embeded\python.exe"
$workerMain = Join-Path $ComfyDir "ComfyUI\main.py"
if (!(Test-Path $workerPython) -or !(Test-Path $workerMain)) {
  throw "ComfyUI Portable not found. Set -ComfyDir to the extracted folder."
}
$workerArgs = @("-s", $workerMain, "--windows-standalone-build", "--listen", "127.0.0.1", "--port", "8188")
if ($LowVram) { $workerArgs += "--lowvram" }
Push-Location $ComfyDir
try { & $workerPython @workerArgs; exit $LASTEXITCODE }
finally { Pop-Location }
