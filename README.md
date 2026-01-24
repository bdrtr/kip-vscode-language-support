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

Main branch'e her push'ta kod otomatik derlenir ve VSIX dosyası release'de yayınlanır:

1. **[GitHub Releases](https://github.com/algorynth/kip-vscode-language-support/releases/latest)** sayfasına gidin
2. **Assets** bölümünden `kip-language-X.X.X.vsix` dosyasını indirin
3. VS Code'da yükleyin:
   ```bash
   code --install-extension kip-language-X.X.X.vsix
   ```

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
- ✅ **Run Command** - Kip dosyalarını çalıştırma (`Ctrl+Shift+R`)
- ✅ **Error Diagnostics** - Gerçek zamanlı hata tespiti
- ✅ **Otomatik Binary İndirme** - Kip derleyicisi bulunamazsa GitHub Releases'dan otomatik indirir
- ✅ **Platform Desteği** - Linux, macOS (Intel/ARM), Windows için binary'ler
- ✅ **Binary Cache** - İndirilen binary'ler cache'lenir, sonraki kullanımlarda hızlı erişim

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

**İlk Kullanım:**
- Eğer sistemde `kip` derleyicisi yoksa, extension otomatik olarak GitHub Releases'dan indirme seçeneği sunar
- Binary indirildikten sonra cache'lenir ve sonraki kullanımlarda otomatik olarak kullanılır
- Tüm platformlar için (Linux, macOS Intel/ARM, Windows) binary desteği mevcuttur

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

Main branch'e push yapıldığında GitHub Actions otomatik olarak:
1. Kodu derler
2. VSIX dosyası oluşturur
3. Release oluşturur ve VSIX'i ekler

**Yeni versiyon yayınlamak için:**

```bash
# Otomatik script ile (önerilen)
npm run release:patch  # 1.1.0 -> 1.1.1 (bug fix)
npm run release:minor  # 1.1.0 -> 1.2.0 (yeni özellik)
npm run release:major  # 1.1.0 -> 2.0.0 (büyük değişiklik)
```

**Manuel yöntem:**
1. `package.json`'da versiyonu değiştirin
2. Commit ve push edin
3. GitHub Actions otomatik release oluşturur

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
2. **Cache'deki binary** - Daha önce indirilen binary (extension global storage)
3. **Varsayılan kurulum yolu** - `~/.local/bin/kip` (Linux/macOS)
4. **Sistem PATH'i** - Sistem PATH'inde `kip` komutu
5. **GitHub Releases'dan indirme** - Otomatik olarak GitHub'dan indirir (kullanıcı onayı ile)

### Otomatik Binary İndirme

Extension, `kip` derleyicisi bulunamazsa:
- GitHub Releases'dan indirme seçeneği sunar
- Önce `algorynth/kip-vscode-language-support` repo'sundan arar
- Bulamazsa `kip-dili/kip` repo'sundan arar
- İndirilen binary cache'lenir (`~/.config/Code/User/globalStorage/algorynth.kip-language/kip-binaries/`)
- Sonraki kullanımlarda cache'den otomatik kullanılır

## 🐛 Sorun Giderme

### Hızlı Kontrol
Tüm kontrolleri tek seferde yapmak için:
```bash
npm run quick-check
```

### Yaygın Sorunlar

**Kip derleyicisi bulunamıyor:**
- Extension otomatik olarak GitHub Releases'dan indirme seçeneği sunar
- Veya VS Code ayarlarından `kip.compilerPath` ayarını kullanarak manuel yol belirtebilirsiniz
- Sistem PATH'ine `kip` binary'sini ekleyebilirsiniz

**Binary indirme başarısız:**
- İnternet bağlantınızı kontrol edin
- GitHub Releases'da binary'lerin mevcut olduğundan emin olun
- Manuel olarak binary'leri indirip `kip.compilerPath` ayarına yol belirtebilirsiniz

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
