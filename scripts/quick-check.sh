#!/bin/bash
# Hızlı kontrol scripti - Tüm kontrolleri tek seferde yapar

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "🚀 Quick Check - Extension Validation"
echo "======================================"
echo ""

# 1. Dependency kontrolü
echo "📦 Step 1: Checking dependencies..."
node "$SCRIPT_DIR/check-dependencies.js"
echo ""

# 2. Extension testi
echo "🧪 Step 2: Testing extension..."
node "$SCRIPT_DIR/test-extension.js"
echo ""

# 3. VSIX validation (eğer varsa)
VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -1)
if [ -n "$VSIX_FILE" ]; then
    echo "📦 Step 3: Validating VSIX..."
    node "$SCRIPT_DIR/validate-vsix.js" "$VSIX_FILE"
    echo ""
else
    echo "📦 Step 3: No VSIX file found, skipping validation"
    echo ""
fi

echo "✅ Quick Check Complete!"
echo ""
echo "Next steps:"
echo "1. If all checks passed, you can install the extension"
echo "2. If checks failed, fix the issues and run again"
echo "3. Run 'npm run package' to create a new VSIX"
