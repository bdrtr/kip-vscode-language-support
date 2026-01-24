# Kip Language Installation Script for Windows PowerShell
# Cross-platform installation script

$ErrorActionPreference = "Stop"

function Say {
    param([string]$Message)
    Write-Host $Message
}

function Need-Cmd {
    param([string]$Cmd)
    $null = Get-Command $Cmd -ErrorAction SilentlyContinue
    return $?
}

Say "🚀 Starting Kip Language Installation..."
Say ""

# Check Stack
if (Need-Cmd "stack") {
    Say "✅ Stack is already installed."
} else {
    Say "📦 Installing Stack..."
    
    # Try Chocolatey first
    if (Need-Cmd "choco") {
        Say "🔄 Trying to install Stack via Chocolatey..."
        try {
            choco install haskell-stack -y
            if (Need-Cmd "stack") {
                Say "✅ Stack installed successfully via Chocolatey."
            } else {
                throw "Stack not found after installation"
            }
        } catch {
            Say "⚠️ Chocolatey installation failed, trying official installer..."
        }
    }
    
    # Fallback to official installer
    if (-not (Need-Cmd "stack")) {
        Say "📥 Using official Stack installer from haskellstack.org..."
        if (Need-Cmd "curl") {
            curl -sSL https://get.haskellstack.org/ | sh
        } elseif (Need-Cmd "wget") {
            wget -qO- https://get.haskellstack.org/ | sh
        } else {
            Say "❌ curl or wget required for Stack installation."
            Say "💡 Please install Stack manually:"
            Say "   See: https://docs.haskellstack.org/en/stable/install_and_upgrade/"
            exit 1
        }
    }
    
    if (-not (Need-Cmd "stack")) {
        Say "❌ Stack installation failed."
        exit 1
    }
}

# Note: Foma on Windows
Say "⚠️ Foma installation on Windows requires manual setup."
Say "💡 Please install Foma manually or use WSL."
Say "   See: https://github.com/mhulden/foma"

# Clone and build
Say "📥 Cloning kip-lang repository..."
$tempDir = Join-Path $env:TEMP "kip-install"
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null
Set-Location $tempDir

try {
    git clone --depth 1 https://github.com/kip-dili/kip.git kip-lang
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to clone repository"
    }
    Say "✅ Repository cloned successfully."
} catch {
    Say "❌ Failed to clone repository: $_"
    exit 1
}

Set-Location kip-lang

Say "🔨 Building kip-lang with Stack..."
try {
    stack build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed"
    }
    Say "✅ Build completed successfully."
} catch {
    Say "❌ Build failed: $_"
    exit 1
}

Say "📦 Installing kip binary..."
try {
    stack install
    if ($LASTEXITCODE -ne 0) {
        throw "Installation failed"
    }
    Say "✅ Installation completed successfully!"
    
    $binPath = Join-Path $env:USERPROFILE ".local\bin"
    Say "📝 Binary installed to: $binPath"
    Say "💡 Make sure this directory is in your PATH."
} catch {
    Say "❌ Installation failed: $_"
    exit 1
}

Say ""
Say "✅ All done! You can now use 'kip' and 'kip-lsp' commands."
