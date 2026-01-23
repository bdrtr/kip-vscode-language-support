# Kip - Turkish Programming Language Extension

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/kip-dili/kip/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Build Extension](https://github.com/algorynth/kip-vscode-language-support/actions/workflows/build-extension.yml/badge.svg)](https://github.com/algorynth/kip-vscode-language-support/actions/workflows/build-extension.yml)

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

### GitHub Actions'dan VSIX İndirme

Her commit ve release için otomatik olarak VSIX dosyası oluşturulur:

1. **[GitHub Actions](https://github.com/algorynth/kip-vscode-language-support/actions)** sayfasına gidin
2. En son başarılı workflow'u seçin
3. **Artifacts** sekmesinden `kip-language-vsix-*.vsix` dosyasını indirin
4. VS Code'da yükleyin:
   ```bash
   code --install-extension kip-language-*.vsix
   ```

**Not:** GitHub Actions her push'ta otomatik olarak VSIX oluşturur ve 90 gün boyunca saklar.

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
