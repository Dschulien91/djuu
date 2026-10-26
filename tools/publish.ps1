# Creates the public GitHub repository "djuu", pushes the code and switches on GitHub Pages.
# Run once: powershell -ExecutionPolicy Bypass -File C:\Users\julia\Desktop\Djuu\tools\publish.ps1
$gh = 'C:\Program Files\GitHub CLI\gh.exe'
Set-Location (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
& $gh repo create djuu --public --source . --push --description 'Djuu - Familienkarte Hamburg (Prototyp)'
& $gh api -X POST repos/Dschulien91/djuu/pages -f 'source[branch]=main' -f 'source[path]=/' | Out-Null
Write-Host ''
Write-Host 'Fertig. In 1-2 Minuten ist Djuu erreichbar unter:'
Write-Host 'https://dschulien91.github.io/djuu/'
