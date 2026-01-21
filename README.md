# Kip - Turkish Programming Language Extension

[![Build Extension](https://github.com/kip-dili/kip/actions/workflows/build-extension.yml/badge.svg)](https://github.com/kip-dili/kip/actions/workflows/build-extension.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/kip-dili/kip/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Türkçe tabanlı programlama dili **Kip** için profesyonel Visual Studio Code eklentisi.

## 📥 Kurulum

### Marketplace'ten (Önerilen)
```bash
code --install-extension algorynth.kip-language
```

### VSIX Dosyası ile
En son sürümü GitHub Actions'tan indirebilirsiniz:

**[📦 Son VSIX İndir](https://github.com/kip-dili/kip/actions/workflows/build-extension.yml)** → En son başarılı build → Artifacts → `kip-language-vsix`

Sonra yükleyin:
```bash
code --install-extension kip-language-*.vsix
```

## ✨ Özellikler

### 🔴 **Real-time Hata Tespiti**
- Sözdizimi hataları anlık gösterilir
- Tip hataları vurgulanır
- Problems panel entegrasyonu
- Türkçe hata mesajları

### 🎯 **Kolay Navigasyon**
- **F12** - Tanıma git (Go to Definition)
- **Alt+F12** - Tanımı önizle (Peek Definition)
- **Shift+F12** - Tüm referansları bul
- **Ctrl+Shift+O** - Sembol arama

### 🎨 **Otomatik Formatlama**
- **Shift+Alt+F** - Dosyayı formatla
- Format on Save desteği
- 2 boşluk girintileme
- Tutarlı kod stili

### 📋 **Outline & Breadcrumbs**
- Explorer'da Outline paneli
- Editör üstünde breadcrumb navigasyon
- Hiyerarşik sembol ağacı
- Tip varyantları gösterimi

### 💡 **Akıllı Kod Tamamlama**
- Fonksiyon önerileri
- Yerleşik tip önerileri
- Türkçe hal eki desteği
- Parametre ipuçları

### 🌈 **Syntax Highlighting**
- İşlevler, tipler, değişkenler
- Yorumlar ve stringler
- Türkçe anahtar kelimeler
- Hal ekleri vurgulama

---

## 🚀 Kullanım

### Kip Dosyası Çalıştırma
1. `.kip` uzantılı dosya açın
2. Sağ üstteki **▶ Run** butonuna basın
3. Veya **Ctrl+Shift+R** kısayolu

### Kod Formatlama
```
Shift+Alt+F → Tüm dosyayı formatla
```

### Sembol Arama
```
Ctrl+Shift+O → Sembol listesi
F12 → Tanıma git
Shift+F12 → Referansları bul
```

---

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

### Recursive Fonksiyon
```kip
(bu tam-sayının) faktöriyeli,
  (bunun 0'ın eşitliği) doğruysa,
    1,
  değilse,
    (bunla (bunla 1'in farkının faktöriyeli)'nin çarpımıdır).
```

---

## 🎯 Tam Özellik Listesi

| Özellik | Kısayol | Açıklama |
|---------|---------|----------|
| **Hata Tespiti** | Otomatik | Sözdizimi ve tip hataları |
| **Tanıma Git** | `F12` | Sembol tanımına atla |
| **Referans Bul** | `Shift+F12` | Tüm kullanımları göster |
| **Formatlama** | `Shift+Alt+F` | Kodu düzenle |
| **Sembol Arama** | `Ctrl+Shift+O` | Hızlı navigasyon |
| **Dosya Çalıştır** | `Ctrl+Shift+R` | Kip programını çalıştır |
| **Hover Bilgi** | Fare | Fonksiyon açıklamaları |
| **Otomatik Tamamlama** | Yazarken | Akıllı öneriler |
| **Outline View** | Explorer | Sembol ağacı |
| **Breadcrumbs** | Editör üstü | Konum gösterimi |

---

## 🛠 Geliştirme

### Gereksinimlere
- Node.js 20+
- npm veya yarn
- VSCode 1.108+

### Kurulum
```bash
cd kip-vscode-extension
npm install
npm run compile
```

### Debug
1. `F5` basın (Extension Development Host açılır)
2. Yeni pencerede `.kip` dosyası açın
3. Özellikleri test edin

### VSIX Build
```bash
npm install -g @vscode/vsce
vsce package
```

---

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing`)
5. Pull Request açın

---

## 📝 Lisans

MIT License - detaylar için [LICENSE](LICENSE) dosyasına bakın.

---

## 🔗 Bağlantılar

- **Ana Repo:** [github.com/kip-dili/kip](https://github.com/kip-dili/kip)
- **Dokümantasyon:** [Kip Dili Rehberi](https://github.com/kip-dili/kip#readme)
- **Issues:** [GitHub Issues](https://github.com/kip-dili/kip/issues)
- **Marketplace:** [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=algorynth.kip-language)

---

## 📸 Ekran Görüntüleri

### Syntax Highlighting & Error Detection
![Syntax highlighting with error detection](images/screenshot1.png)

### Outline View & Navigation
![Outline and breadcrumbs](images/screenshot2.png)

### Code Completion
![Auto-completion in action](images/screenshot3.png)

---

**Kip ile mutlu kodlamalar!** 🎉
