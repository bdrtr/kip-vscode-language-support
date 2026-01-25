# Kip - Turkish Programming Language Support for VS Code

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/algorynth/kip-vscode-language-support/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> ⚠️ **Community-Maintained Extension** - This extension is **not official** and is maintained by the community. For official Kip language resources, please visit the [official Kip repository](https://github.com/kip-dili/kip).

VS Code extension for the **Kip programming language** - a Turkish grammar-based functional programming language. This extension provides syntax highlighting, code completion, and language server features for Kip.

## 📥 Installation

### For End Users

#### Option 1: Install from GitHub Releases (Recommended)

1. Go to [GitHub Releases](https://github.com/algorynth/kip-vscode-language-support/releases/latest)
2. Download the latest `.vsix` file from the **Assets** section
3. Open VS Code
4. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
5. Type "Extensions: Install from VSIX..."
6. Select the downloaded `.vsix` file

#### Option 2: Install from VS Code Marketplace

*Note: This extension may not be available on the marketplace yet. Use GitHub Releases instead.*

### For Developers

See the [Development](#-development) section below.

## ✨ Features

### 🎨 Syntax Highlighting
- **Semantic highlighting** via Language Server Protocol (LSP)
- Multi-word type recognition (e.g., "öğe listesi")
- Color-coded syntax for:
  - Functions
  - Types
  - Variables
  - Keywords
  - Strings and numbers

### 🔍 Code Navigation
- **Go to Definition** (`F12`) - Jump to where symbols are defined
- **Find All References** (`Shift+F12`) - Find all usages of a symbol
- **Workspace Symbols** (`Ctrl+T` / `Cmd+T`) - Search symbols across your workspace
- **Document Outline** (`Ctrl+Shift+O` / `Cmd+Shift+O`) - View all symbols in current file

### 💡 Code Intelligence
- **Auto-completion** - Smart suggestions as you type
- **Hover Information** - See documentation when hovering over symbols
- **Code Formatting** - Format your code with `Shift+Alt+F`
- **Code Actions** - Quick fixes and refactorings (`Ctrl+.` / `Cmd+.`)

### 🚀 Code Execution
- **Run Kip Files** - Execute `.kip` files directly from VS Code
  - Click the ▶️ button in the editor toolbar
  - Or press `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS)
  - Or use Command Palette: "Kip: Run File"

### 📝 Language Support
- Turkish grammar-based syntax
- Type declarations: `Bir ... ya ... olabilir`
- Function definitions with gerund patterns (`-mak/-mek`)
- Variable definitions: `X Y Z diyelim`
- Pattern matching and conditional expressions

## 🚀 Quick Start

1. **Install the extension** (see [Installation](#-installation) above)
2. **Open a `.kip` file** in VS Code
3. **Start coding!** The extension will automatically:
   - Highlight your code
   - Provide code completion
   - Show errors and warnings
4. **Run your code** using the ▶️ button or `Ctrl+Shift+R`

## 📚 Example Code

Here's a simple example to get you started:

```kip
Bir (öğe listesi)
ya boş
ya da bir öğenin bir öğe listesine eki
olabilir.

(bu öğe listesiyle) (şu öğe listesinin) birleşimi,
  bu boşsa,
    şu,
  ilkin devama ekiyse,
    ilkin (devamla şunun birleşimine) ekidir.

(bu öğe listesinin) tersi,
  bu boşsa,
    boş,
  ilkin devama ekiyse,
    (devamın tersiyle) 
      (ilkin boşa ekinin) birleşimidir.

((1'in (2'nin boşa ekine) ekinin) tersini) bastır.
```

## ⚙️ Configuration

You can configure the extension in VS Code settings (`Ctrl+,` / `Cmd+,`):

```json
{
  "kip.compilerPath": "",           // Path to Kip compiler (empty = auto-detect)
  "kip.lspPath": "",              // Path to Kip LSP server (empty = auto-detect)
  "kip.enableCodeLens": true,     // Show reference counts above symbols
  "kip.formatOnSave": false,     // Automatically format on save
  "kip.enableWorkspaceSymbols": true // Enable workspace symbol search
}
```

## 🔗 Useful Links

- **Official Kip Language**: [kip-dili/kip](https://github.com/kip-dili/kip) - The official Kip programming language repository
- **Kip Language Documentation**: Check the official repository for language documentation and tutorials
- **Report Issues**: [GitHub Issues](https://github.com/algorynth/kip-vscode-language-support/issues) - Found a bug? Let us know!
- **Request Features**: [GitHub Issues](https://github.com/algorynth/kip-vscode-language-support/issues) - Have an idea? We'd love to hear it!
- **Latest Releases**: [GitHub Releases](https://github.com/algorynth/kip-vscode-language-support/releases) - Download the latest version

## 🐛 Troubleshooting

### Extension not working?

1. **Restart VS Code** - Sometimes a simple restart fixes issues
2. **Check the Output Panel** - Open Output (`Ctrl+Shift+U` / `Cmd+Shift+U`) and select "Kip Language Server"
3. **Reload Window** - Press `Ctrl+Shift+P` / `Cmd+Shift+P` and run "Developer: Reload Window"

### Syntax highlighting not working?

- Make sure you're editing a `.kip` file
- Check that the file is recognized as "Kip" language (see bottom-right of VS Code)
- Try reloading the window

### Code completion not working?

- The extension uses LSP (Language Server Protocol) for code intelligence
- Make sure the LSP server started successfully (check Output panel)
- Try restarting the extension host: `Ctrl+Shift+P` → "Developer: Restart Extension Host"

### Can't run Kip files?

- Make sure you have the Kip compiler installed
- Check that `kip` command is available in your terminal
- See the [official Kip repository](https://github.com/kip-dili/kip) for installation instructions

## 🛠 Development

### For Contributors

This extension is open source and community-maintained. Contributions are welcome!

> **Important:** Run all npm commands from the **`kip-vscode-language-support`** directory. If the repo is a subfolder (e.g. monorepo or `git pull` into a workspace), run `cd kip-vscode-language-support` first. Running from the parent causes `rootDir` / "file is not under 'rootDir'" TypeScript errors.

#### Prerequisites
- Node.js 20+
- npm
- TypeScript
- VS Code 1.80+

#### Setup
```bash
# Clone the repository
git clone https://github.com/algorynth/kip-vscode-language-support.git
cd kip-vscode-language-support

# Install dependencies
npm install

# Compile TypeScript (veya: npm run build)
npm run compile
```

#### Development Workflow
```bash
# Derleme
npm run build          # = npm run compile
npm run watch          # watch mode

# Testler
npm test
npm run test:lsp

# VSIX paketle
npm run package
```

#### Project Structure
```
kip-vscode-language-support/
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── server/
│   │   └── server.ts          # LSP server implementation
│   ├── semanticTokensProvider.ts
│   ├── completionProvider.ts
│   ├── hoverProvider.ts
│   ├── definitionProvider.ts
│   ├── referenceProvider.ts
│   ├── renameProvider.ts
│   ├── codeActionProvider.ts
│   ├── formattingProvider.ts
│   ├── diagnosticProvider.ts
│   └── kipRunner.ts          # Kip file execution
├── scripts/
│   ├── test-lsp-detailed.js  # LSP test suite
│   └── ...
├── .github/
│   └── workflows/
│       └── build-extension.yml # CI/CD workflow
└── package.json
```

#### LSP Server

The extension includes a custom TypeScript-based LSP server that provides:

- **Document Analysis**: Parses Kip code to extract types, functions, variables, and symbols
- **Semantic Highlighting**: Identifies and highlights different token types
- **Code Navigation**: Definition and reference finding
- **Symbol Management**: Tracks symbols across documents

#### Testing

The extension includes comprehensive tests:

- **Extension Tests**: `npm test` - Tests extension functionality
- **LSP Tests**: `npm run test:lsp` - Tests LSP server features
- **All Tests**: `npm run test:all` - Runs all test suites

#### CI/CD

The project uses GitHub Actions for continuous integration:

- **Build**: Automatically builds on every push
- **Test**: Runs all tests on every push
- **Release**: Creates GitHub Releases when tags are pushed (format: `v*`)

To create a release:
```bash
# Update version in package.json
git tag v1.2.0
git push origin v1.2.0
```

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Report Bugs**: [Open an issue](https://github.com/algorynth/kip-vscode-language-support/issues)
2. **Suggest Features**: [Open an issue](https://github.com/algorynth/kip-vscode-language-support/issues)
3. **Submit Pull Requests**: 
   - Fork the repository
   - Create a feature branch
   - Make your changes
   - Submit a pull request

### Contribution Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Be respectful and constructive in discussions

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Kip Language**: Created by the Kip language team - [kip-dili/kip](https://github.com/kip-dili/kip)
- **VS Code**: Built with [VS Code Extension API](https://code.visualstudio.com/api)
- **LSP**: Powered by [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- **Community**: Maintained by the community for the community

## ⚠️ Disclaimer

This extension is **community-maintained** and is **not an official product** of the Kip language team. While we strive to provide the best experience possible, this extension is provided "as-is" without warranty.

For official Kip language resources, documentation, and support, please visit:
- **Official Repository**: [github.com/kip-dili/kip](https://github.com/kip-dili/kip)

---

**Made with ❤️ by the community**

If you find this extension useful, please consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs
- 💡 Suggesting features
- 🤝 Contributing code

Thank you for using Kip VS Code Extension!
