# Kip - Turkish Programming Language Support for VS Code

VS Code extension for the Kip programming language - a Turkish grammar-based programming language.

## Features

### 🎨 Semantic Syntax Highlighting
- Full semantic token support via LSP
- Multi-word type recognition (e.g., "öğe listesi")
- Function, type, variable, and keyword highlighting
- Real-time syntax analysis

### 🔍 Language Server Protocol (LSP) Features
- **Go to Definition** - Navigate to symbol definitions
- **Find All References** - Find all usages of symbols
- **Semantic Tokens** - Advanced syntax highlighting
- **Document Symbols** - Outline view support
- **Workspace Symbols** - Search symbols across workspace
- **Code Formatting** - Automatic code formatting
- **Code Actions** - Quick fixes and code actions
- **Code Lens** - Additional code information

### 🚀 Code Execution
- Run Kip files directly from VS Code
- Integrated Kip language runner

### 📝 Language Support
- Turkish grammar-based syntax
- Type declarations: `Bir ... ya ... olabilir`
- Function definitions with gerund patterns (`-mak/-mek`)
- Variable definitions: `X Y Z diyelim`
- Pattern matching and conditional expressions

## Installation

### From VSIX File
1. Download the latest `.vsix` file from [Releases](https://github.com/algorynth/kip-vscode-language-support/releases)
2. Open VS Code
3. Go to Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`)
4. Click the `...` menu and select "Install from VSIX..."
5. Select the downloaded `.vsix` file

### From Source
```bash
git clone https://github.com/algorynth/kip-vscode-language-support.git
cd kip-vscode-language-support
npm install
npm run compile
npm run package
# Install the generated .vsix file
```

## Development

### Prerequisites
- Node.js 20+
- npm
- TypeScript
- VS Code Extension Development Host

### Setup
```bash
npm install
npm run compile
```

### Build
```bash
npm run compile
npm run package
```

### Test
```bash
# Run extension tests
npm test

# Run LSP tests
npm run test:lsp

# Run all tests
npm run test:all
```

### Project Structure
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

## LSP Server

The extension includes a custom TypeScript-based LSP server that provides:

- **Document Analysis**: Parses Kip code to extract types, functions, variables, and symbols
- **Semantic Highlighting**: Identifies and highlights different token types
- **Code Navigation**: Definition and reference finding
- **Symbol Management**: Tracks symbols across documents

### LSP Features Implemented
- ✅ Semantic Tokens (full & range)
- ✅ Completion
- ✅ Hover
- ✅ Definition
- ✅ References
- ✅ Document Symbols
- ✅ Workspace Symbols
- ✅ Formatting
- ✅ Code Actions
- ✅ Code Lens

## Usage

### Running Kip Files
1. Open a `.kip` file
2. Press `F5` or use Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Select "Kip: Run File"

### Code Navigation
- **Go to Definition**: `F12` or right-click → "Go to Definition"
- **Find References**: `Shift+F12` or right-click → "Find All References"
- **Symbol Search**: `Ctrl+T` / `Cmd+T` for workspace symbols

### Syntax Highlighting
Syntax highlighting is provided entirely through the LSP semantic tokens system. No TextMate grammar is used - all highlighting is semantic and context-aware.

## Example Kip Code

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

## CI/CD

The project uses GitHub Actions for continuous integration:

- **Build**: Compiles TypeScript and packages extension
- **Test**: Runs extension tests and LSP tests
- **Release**: Automatically creates GitHub Releases when tags are pushed (format: `v*`)

### Creating a Release
```bash
# Update version in package.json
git tag v1.2.0
git push origin v1.2.0
```

GitHub Actions will automatically:
1. Build and test the extension
2. Create a GitHub Release
3. Attach the VSIX file to the release

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Add your license here]

## Links

- Repository: [GitHub](https://github.com/algorynth/kip-vscode-language-support)
- Issues: [GitHub Issues](https://github.com/algorynth/kip-vscode-language-support/issues)
- Releases: [GitHub Releases](https://github.com/algorynth/kip-vscode-language-support/releases)

## Acknowledgments

Built with:
- [VS Code Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [vscode-languageserver](https://github.com/Microsoft/vscode-languageserver-node)
- [vscode-languageclient](https://github.com/Microsoft/vscode-languageserver-node)
