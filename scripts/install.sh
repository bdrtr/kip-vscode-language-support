#!/usr/bin/env bash
set -euo pipefail

# Cross-platform Kip Language Installation Script
# Based on official kip-lang installation instructions
# Supports: Linux, macOS, Windows (via Git Bash/WSL)

say() {
  printf "%s\n" "$*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

detect_os() {
  if [[ "$OSTYPE" == darwin* ]]; then
    echo "darwin"
  elif [[ "$OSTYPE" == linux-gnu* ]] || [[ "$OSTYPE" == linux-musl* ]]; then
    echo "linux"
  elif [[ "$OSTYPE" == msys ]] || [[ "$OSTYPE" == cygwin ]]; then
    echo "windows"
  else
    echo "unknown"
  fi
}

install_foma() {
  if need_cmd foma; then
    say "✅ Foma is already installed."
    return
  fi
  
  local os=$(detect_os)
  say "📦 Installing Foma..."
  
  if [[ "$os" == "darwin" ]]; then
    if ! need_cmd brew; then
      say "❌ Homebrew not found. Please install Homebrew: https://brew.sh"
      exit 1
    fi
    brew install foma
  elif [[ "$os" == "linux" ]]; then
    if need_cmd apt-get; then
      say "🔄 Updating package lists..."
      sudo apt-get update || true
      say "📦 Installing Foma..."
      sudo apt-get install -y foma libfoma-dev || {
        say "❌ Failed to install Foma. Please install manually:"
        say "   sudo apt-get install -y foma libfoma-dev"
        exit 1
      }
    elif need_cmd dnf; then
      sudo dnf install -y foma foma-devel
    elif need_cmd yum; then
      sudo yum install -y foma foma-devel
    elif need_cmd pacman; then
      sudo pacman -Sy --noconfirm foma
    else
      say "❌ No supported package manager found. Please install Foma manually."
      say "💡 See: https://fomafst.github.io/"
      exit 1
    fi
  elif [[ "$os" == "windows" ]]; then
    say "⚠️ Foma installation on Windows requires manual setup."
    say "💡 Please install Foma manually or use WSL."
    say "   See: https://github.com/mhulden/foma"
    exit 1
  fi
  
  if need_cmd foma; then
    say "✅ Foma installed successfully."
  else
    say "❌ Foma installation failed."
    exit 1
  fi
}

install_stack() {
  if need_cmd stack; then
    say "✅ Stack is already installed."
    return
  fi
  
  local os=$(detect_os)
  say "📦 Installing Stack..."
  
  if [[ "$os" == "darwin" ]]; then
    if ! need_cmd brew; then
      say "❌ Homebrew not found. Please install Homebrew: https://brew.sh"
      exit 1
    fi
    brew install haskell-stack
  elif [[ "$os" == "linux" ]]; then
    # Try apt-get first (if available)
    if need_cmd apt-get; then
      say "🔄 Trying to install Stack via apt-get..."
      say "🔄 Updating package lists (errors may be ignored)..."
      sudo apt-get update || true
      
      if sudo apt-get install -y haskell-stack 2>/dev/null; then
        if need_cmd stack; then
          say "✅ Stack installed successfully via apt-get."
          return
        fi
      fi
      say "⚠️ apt-get installation failed or Stack not found, trying official installer..."
    fi
    
    # Fallback to official installer
    say "📥 Using official Stack installer from haskellstack.org..."
    if need_cmd curl; then
      curl -sSL https://get.haskellstack.org/ | sh || {
        say "❌ Stack installation failed."
        say "💡 Please install Stack manually:"
        say "   See: https://docs.haskellstack.org/en/stable/install_and_upgrade/"
        exit 1
      }
    elif need_cmd wget; then
      wget -qO- https://get.haskellstack.org/ | sh || {
        say "❌ Stack installation failed."
        say "💡 Please install Stack manually:"
        say "   See: https://docs.haskellstack.org/en/stable/install_and_upgrade/"
        exit 1
      }
    else
      say "❌ curl or wget required for Stack installation."
      say "💡 Please install curl or wget, or install Stack manually:"
      say "   See: https://docs.haskellstack.org/en/stable/install_and_upgrade/"
      exit 1
    fi
  elif [[ "$os" == "windows" ]]; then
    say "📥 Using official Stack installer from haskellstack.org..."
    if need_cmd curl; then
      curl -sSL https://get.haskellstack.org/ | sh || {
        say "❌ Stack installation failed."
        say "💡 Please install Stack manually:"
        say "   See: https://docs.haskellstack.org/en/stable/install_and_upgrade/"
        exit 1
      }
    elif need_cmd wget; then
      wget -qO- https://get.haskellstack.org/ | sh || {
        say "❌ Stack installation failed."
        say "💡 Please install Stack manually:"
        say "   See: https://docs.haskellstack.org/en/stable/install_and_upgrade/"
        exit 1
      }
    else
      say "❌ curl or wget required for Stack installation."
      say "💡 Please install curl or wget, or install Stack manually:"
      say "   See: https://docs.haskellstack.org/en/stable/install_and_upgrade/"
      exit 1
    fi
  else
    say "❌ Unsupported operating system: $os"
    exit 1
  fi
  
  if need_cmd stack; then
    say "✅ Stack installed successfully."
  else
    say "❌ Stack installation failed. Please install it manually."
    say "💡 See: https://docs.haskellstack.org/en/stable/install_and_upgrade/"
    exit 1
  fi
}

clone_and_build() {
  say "📥 Cloning kip-lang repository..."
  local temp_dir=$(mktemp -d 2>/dev/null || mktemp -d -t 'kip-install')
  cd "$temp_dir"
  
  if ! git clone --depth 1 https://github.com/kip-dili/kip.git kip-lang; then
    say "❌ Failed to clone repository."
    say "💡 Make sure git is installed and you have internet connection."
    exit 1
  fi
  
  cd kip-lang
  say "✅ Repository cloned successfully."
  
  say "🔨 Building kip-lang with Stack..."
  if ! stack build; then
    say "❌ Build failed."
    say "💡 Make sure all dependencies are installed correctly."
    exit 1
  fi
  
  say "✅ Build completed successfully."
  
  say "📦 Installing kip binary to ~/.local/bin..."
  if ! stack install; then
    say "❌ Installation failed."
    exit 1
  fi
  
  local install_path="$HOME/.local/bin"
  say "✅ Installation completed successfully!"
  say "📝 Binary installed to: $install_path"
  
  if [[ "$(detect_os)" != "windows" ]]; then
    if [[ ":$PATH:" != *":$install_path:"* ]]; then
      say ""
      say "⚠️  $install_path is not in your PATH"
      say "💡 Add this to your ~/.bashrc, ~/.zshrc, or ~/.profile:"
      say "   export PATH=\"\$HOME/.local/bin:\$PATH\""
      say ""
      say "   Then run: source ~/.bashrc  (or ~/.zshrc)"
    else
      say "✅ $install_path is already in your PATH"
    fi
  fi
}

main() {
  say "🚀 Starting Kip Language Installation..."
  say ""
  say "This script will:"
  say "  1. Install Foma (finite-state morphology toolkit)"
  say "  2. Install Stack (Haskell build tool)"
  say "  3. Clone kip-lang repository"
  say "  4. Build and install kip binary"
  say ""
  
  install_foma
  install_stack
  clone_and_build
  
  say ""
  say "✅ All done! You can now use 'kip' and 'kip-lsp' commands."
  say ""
  say "💡 To verify installation, run:"
  say "   kip --version"
  say "   kip-lsp --version"
  say ""
  say "💡 If commands are not found, restart your terminal or run:"
  say "   export PATH=\"\$HOME/.local/bin:\$PATH\""
}

main "$@"
