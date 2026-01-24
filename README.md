# Kip - Turkish Programming Language Extension

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/algorynth/kip-vscode-language-support/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/algorynth/kip-vscode-language-support)](https://github.com/algorynth/kip-vscode-language-support/releases/latest)

> ⚠️ **Not an official extension** - This is a community-maintained extension for the Kip programming language.

Türkçe tabanlı programlama dili **Kip** için Visual Studio Code eklentisi.

## 📥 Kurulum

### GitHub Releases'dan VSIX İndirme (Önerilen)

Main branch'e her push'ta kod otomatik derlenir ve VSIX dosyası GitHub Actions artifact olarak yüklenir:

1. **[GitHub Releases](https://github.com/algorynth/kip-vscode-language-support/releases/latest)** sayfasına gidin
   - Veya direkt link: [Latest Release](https://github.com/algorynth/kip-vscode-language-support/releases/latest)
2. **Assets** bölümünden `kip-language-X.X.X.vsix` dosyasını indirin
3. VS Code'da yükleyin:
   ```bash
   code --install-extension kip-language-X.X.X.vsix
   ```

**Alternatif:** GitHub Actions artifact'ından indirme:
1. Repository'nin **Actions** sekmesine gidin
2. En son başarılı workflow run'ına tıklayın
3. **Artifacts** bölümünden `kip-language-extension` artifact'ını indirin

Veya VS Code içinden:
1. `Ctrl+Shift+P` tuşlarına basın
2. "Extensions: Install from VSIX..." yazın
3. İndirdiğiniz VSIX dosyasını seçin

## ✨ Özellikler

### Temel Özellikler
- ✅ **Syntax Highlighting** - Türkçe anahtar kelimeler ve syntax vurgulama
- ✅ **Code Completion** - Akıllı kod tamamlama ve öneriler
- ✅ **Hover Documentation** - Yerleşik fonksiyonlar için dokümantasyon
- ✅ **Code Formatting** - Otomatik kod formatlama (`Shift+Alt+F`)
- ✅ **Run Command** - Kip dosyalarını çalıştırma (Sağ üstteki ▶ butonu veya `Ctrl+Shift+R`)
- ✅ **Error Diagnostics** - Gerçek zamanlı hata tespiti
- ✅ **Otomatik Kurulum** - Kip derleyicisi bulunamazsa cross-platform kurulum script'i çalıştırır
- ✅ **Cross-Platform** - Linux, macOS (Intel/ARM), Windows desteği

### LSP Özellikleri (Language Server Protocol)
- ✅ **Go to Definition** (`F12`) - Tanıma git
- ✅ **Find References** (`Shift+F12`) - Tüm referansları bul
- ✅ **Rename Symbol** (`F2`) - Sembol yeniden adlandırma
- ✅ **Code Actions** (`Ctrl+.`) - Hızlı düzeltmeler
- ✅ **Code Lens** - Referans sayısı gösterimi (ayarlanabilir)
- ✅ **Outline** (`Ctrl+Shift+O`) - Sembol listesi
- ✅ **Workspace Symbols** (`Ctrl+T`) - Workspace genelinde arama (ayarlanabilir)

## 🚀 Kullanım

### Kip Derleyicisi Kurulumu

**İlk Kullanım:**
- Eğer sistemde `kip` derleyicisi yoksa, extension otomatik kurulum seçeneği sunar
- "Kur" butonuna tıklayarak cross-platform kurulum script'i çalıştırılır
- Script otomatik olarak:
  1. Foma'yı kurar (finite-state morphology toolkit)
  2. Stack'i kurar (Haskell build tool) - önce apt-get, başarısız olursa resmi installer
  3. kip-lang repository'sini clone eder
  4. Build eder ve `~/.local/bin/` dizinine kurar (Linux/macOS) veya `%USERPROFILE%\.local\bin\` (Windows)

**Desteklenen İşletim Sistemleri:**
- **Linux**: apt-get, dnf, yum, pacman desteği
- **macOS**: Homebrew desteği
- **Windows**: PowerShell script desteği (Chocolatey veya resmi Stack installer)

### Kip Dosyası Çalıştırma
1. `.kip` uzantılı dosya açın
2. Sağ üstteki **▶ Run** butonuna basın
3. Veya **Ctrl+Shift+R** (`Cmd+Shift+R` macOS'ta) kısayolu

### Kod Formatlama
```
Shift+Alt+F → Tüm dosyayı formatla
```

**Format on Save:** `kip.formatOnSave` ayarını `true` yaparak kaydetme sırasında otomatik formatlama yapabilirsiniz.

### Navigasyon
```
F12 → Tanıma git (LSP gerekli)
Shift+F12 → Referansları bul (LSP gerekli)
Ctrl+Shift+O → Sembol listesi (LSP gerekli)
Ctrl+T → Workspace sembol araması (LSP gerekli, ayarlanabilir)
```

## 📚 Kod Örnekleri

### Basit Fonksiyon
```kip
selamlamak,
  isim olarak okuyup,
  ("Merhaba "yla ismin birleşimini) yazmaktır.

selamla.
```

### Tip Tanımı
```kip
Bir gün
ya pazartesi
ya salı
ya çarşamba
ya perşembe
ya cuma
ya cumartesi
ya pazar
olabilir.
```

## 🛠 Geliştirme

### Gereksinimler
- Node.js 20+
- npm
- VS Code 1.80+

### Kurulum
```bash
npm install
npm run compile
```

### Test ve Kontrol
```bash
# Bağımlılıkları kontrol et
npm run check

# Extension'ı test et
npm run test

# VSIX oluştur
npm run package

# VSIX'i validate et
npm run validate kip-language-*.vsix

# Tüm kontrolleri yap
npm run quick-check
```

### Debug
1. `F5` basın (Extension Development Host açılır)
2. Yeni pencerede `.kip` dosyası açın
3. Özellikleri test edin

## 📝 Yapılandırma

Extension ayarları (`settings.json`):
```json
{
  "kip.compilerPath": "",           // Kip derleyicisinin tam yolu (boş bırakılırsa otomatik bulunur)
  "kip.lspPath": "",                // Kip LSP sunucusunun tam yolu (boş bırakılırsa otomatik bulunur)
  "kip.enableCodeLens": true,       // Code Lens'i etkinleştir
  "kip.formatOnSave": false,        // Kaydetme sırasında formatla
  "kip.enableWorkspaceSymbols": true // Workspace sembol araması
}
```

### Binary Bulma Sırası

Extension, `kip` derleyicisini şu sırayla arar:

1. **`kip.compilerPath` ayarı** - VS Code ayarlarında belirtilen yol
2. **Varsayılan kurulum yolu** - `~/.local/bin/kip` (Linux/macOS) veya `%USERPROFILE%\.local\bin\kip.exe` (Windows)
3. **Sistem PATH'i** - Sistem PATH'inde `kip` komutu (Windows'ta `kip.exe` de aranır)
4. **Otomatik kurulum** - Kullanıcı onayı ile cross-platform kurulum script'i çalıştırılır

## 🐛 Sorun Giderme

### Yaygın Sorunlar

**Kip derleyicisi bulunamıyor:**
- Extension otomatik kurulum seçeneği sunar
- Veya VS Code ayarlarından `kip.compilerPath` ayarını kullanarak manuel yol belirtebilirsiniz
- Sistem PATH'ine `kip` binary'sini ekleyebilirsiniz

**Kurulum script'i başarısız:**
- İnternet bağlantınızı kontrol edin
- Gerekli bağımlılıkların (git, curl/wget) kurulu olduğundan emin olun
- Linux'ta: sudo yetkilerine sahip olduğunuzdan emin olun
- Windows'ta: PowerShell execution policy'yi kontrol edin (`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`)

**LSP özellikleri çalışmıyor:**
- `kip-lsp` binary'sinin kurulu olduğundan emin olun
- `kip.lspPath` ayarını kontrol edin
- Developer Console'u kontrol edin (`Ctrl+Shift+I`)
- Extension Host'u yeniden başlatın (`Ctrl+Shift+P` → "Developer: Restart Extension Host")

**Extension çalışmıyor:**
1. VS Code'u yeniden başlatın
2. Developer Console'u kontrol edin (`Ctrl+Shift+I`)
3. Extension Host'u yeniden başlatın (`Ctrl+Shift+P` → "Developer: Restart Extension Host")

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing`)
5. Pull Request açın

## 📝 Lisans

MIT License - detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 🔗 Bağlantılar

- **VS Code Marketplace:** [algorynth.kip-language](https://marketplace.visualstudio.com/items?itemName=algorynth.kip-language)
- **Latest Release:** [GitHub Releases](https://github.com/algorynth/kip-vscode-language-support/releases/latest)
- **All Releases:** [GitHub Releases](https://github.com/algorynth/kip-vscode-language-support/releases)
- **Kip Dili Repo:** [github.com/kip-dili/kip](https://github.com/kip-dili/kip)
- **Issues:** [GitHub Issues](https://github.com/algorynth/kip-vscode-language-support/issues)

---

**Kip ile mutlu kodlamalar!** 🎉
