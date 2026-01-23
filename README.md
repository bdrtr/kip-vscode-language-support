# Kip - Turkish Programming Language Extension

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/algorynth/kip-vscode-language-support/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Build Extension](https://github.com/algorynth/kip-vscode-language-support/actions/workflows/build-extension.yml/badge.svg)](https://github.com/algorynth/kip-vscode-language-support/actions/workflows/build-extension.yml)
[![Latest Release](https://img.shields.io/github/v/release/algorynth/kip-vscode-language-support)](https://github.com/algorynth/kip-vscode-language-support/releases/latest)

Türkçe tabanlı programlama dili **Kip** için profesyonel Visual Studio Code eklentisi.

## 📥 Kurulum

### VS Code Marketplace
```bash
code --install-extension algorynth.kip-language
```

Veya VS Code içinden:
1. Extensions panelini açın (`Ctrl+Shift+X`)
2. "Kip" araması yapın
3. "Kip - Turkish Programming Language" eklentisini yükleyin

### GitHub Releases'dan VSIX İndirme (Önerilen)

Her release için otomatik olarak VSIX dosyası oluşturulur ve Releases bölümünde yayınlanır:

1. **[GitHub Releases](https://github.com/algorynth/kip-vscode-language-support/releases)** sayfasına gidin
2. En son release'i seçin
3. **Assets** bölümünden `kip-language-*.vsix` dosyasını indirin
4. VS Code'da yükleyin:
   ```bash
   code --install-extension kip-language-*.vsix
   ```

**Not:** Release oluşturulduğunda VSIX otomatik olarak release'e eklenir ve süresiz saklanır.

### GitHub Actions Artifacts (Geliştirme)

Geliştirme sırasında her commit için VSIX dosyası Artifacts olarak saklanır:

1. **[GitHub Actions](https://github.com/algorynth/kip-vscode-language-support/actions)** sayfasına gidin
2. En son başarılı workflow'u seçin
3. **Artifacts** sekmesinden VSIX'i indirin

**Not:** Artifacts 90 gün boyunca saklanır. Production kullanımı için Releases bölümünü kullanın.

## ✨ Özellikler

### Temel Özellikler
- ✅ **Syntax Highlighting** - Türkçe anahtar kelimeler ve syntax vurgulama
- ✅ **Code Completion** - Akıllı kod tamamlama ve öneriler
- ✅ **Hover Documentation** - Yerleşik fonksiyonlar için dokümantasyon
- ✅ **Code Formatting** - Otomatik kod formatlama (`Shift+Alt+F`)
- ✅ **Run Command** - Kip dosyalarını çalıştırma (`Ctrl+Shift+R`)
- ✅ **Error Diagnostics** - Gerçek zamanlı hata tespiti

### LSP Özellikleri (Language Server Protocol)
- ✅ **Go to Definition** (`F12`) - Tanıma git
- ✅ **Find References** (`Shift+F12`) - Tüm referansları bul
- ✅ **Rename Symbol** (`F2`) - Sembol yeniden adlandırma
- ✅ **Code Actions** (`Ctrl+.`) - Hızlı düzeltmeler
- ✅ **Code Lens** - Referans sayısı gösterimi
- ✅ **Outline** (`Ctrl+Shift+O`) - Sembol listesi
- ✅ **Workspace Symbols** (`Ctrl+T`) - Workspace genelinde arama

## 🚀 Kullanım

### Kip Dosyası Çalıştırma
1. `.kip` uzantılı dosya açın
2. Sağ üstteki **▶ Run** butonuna basın
3. Veya **Ctrl+Shift+R** kısayolu

### Kod Formatlama
```
Shift+Alt+F → Tüm dosyayı formatla
```

### Navigasyon
```
F12 → Tanıma git
Shift+F12 → Referansları bul
Ctrl+Shift+O → Sembol listesi
Ctrl+T → Workspace sembol araması
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

### Release Oluşturma

Yeni bir release oluşturmak için:

1. **Versiyon numarasını artırın** (`package.json` içinde):
   ```json
   "version": "1.2.0"
   ```

2. **Tag oluşturun ve push edin:**
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```

3. **GitHub Actions otomatik olarak:**
   - Extension'ı derler
   - VSIX dosyası oluşturur
   - Yeni release oluşturur
   - VSIX dosyasını release'e ekler

**Alternatif:** Otomatik script kullanarak:
```bash
npm run release:patch  # 1.1.0 -> 1.1.1
npm run release:minor  # 1.1.0 -> 1.2.0
npm run release:major  # 1.1.0 -> 2.0.0
```

## 📝 Yapılandırma

Extension ayarları (`settings.json`):
```json
{
  "kip.compilerPath": "",           // Kip derleyicisinin yolu
  "kip.lspPath": "",                // Kip LSP sunucusunun yolu
  "kip.enableCodeLens": true,       // Code Lens'i etkinleştir
  "kip.formatOnSave": false,        // Kaydetme sırasında formatla
  "kip.enableWorkspaceSymbols": true // Workspace sembol araması
}
```

## 🐛 Sorun Giderme

### Hızlı Kontrol
Tüm kontrolleri tek seferde yapmak için:
```bash
npm run quick-check
```

### Yaygın Sorunlar

**LSP modülü yüklenemiyor:**
```bash
npm install
npm run check
npm run package
```

**VSIX'te modüller eksik:**
- `.vscodeignore` dosyasını kontrol edin
- Gerekli modüller için `!node_modules/modul-adi/**` ekleyin

**Extension çalışmıyor:**
1. VS Code'u yeniden başlatın
2. Developer Console'u kontrol edin (`Ctrl+Shift+I`)
3. Extension Host'u yeniden başlatın (`Ctrl+Shift+P` → "Developer: Restart Extension Host")

Detaylı sorun giderme için `scripts/` klasöründeki scriptleri kullanın.

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
- **Kip Dili Repo:** [github.com/kip-dili/kip](https://github.com/kip-dili/kip)
- **Issues:** [GitHub Issues](https://github.com/kip-dili/kip/issues)

---

**Kip ile mutlu kodlamalar!** 🎉
