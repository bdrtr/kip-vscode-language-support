# Change Log

Kip Language Support eklentisinin tüm önemli değişiklikleri bu dosyada belgelenecektir.

## [0.2.0] - 2026-01-21

### Eklenenler
- ✨ **Hover Tooltips**: Fonksiyon ve anahtar kelimelerin üzerine gelince açıklama gösterimi
  - 40+ yerleşik fonksiyon ve anahtar kelime için dokümantasyon
  - Kategori bazlı renkli ikonlar (I/O, Aritmetik, Karşılaştırma, vb.)
  - Kullanım örnekleri ile birlikte açıklamalar
  - Markdown formatında zengin tooltip'ler
- 🎯 **Basic IntelliSense**: Otomatik tamamlama desteği
  - Anahtar kelime önerileri
  - Yerleşik fonksiyon önerileri
  - Tip önerileri
  - Sabit önerileri
  - Kod şablonları (snippets) entegrasyonu
  - Trigger characters: `.`, `'`, ` ` (boşluk)
  - Kategori bazlı önceliklendirme
- 📁 **Code Folding**: Kod katlama desteği
  - Fonksiyon tanımlarını katlama
  - Tip tanımlarını katlama
  - Yorum bloklarını katlama
  - Çok satırlı yapılar için otomatik folding
- 📊 **Symbol Provider**: Sembol listesi ve navigasyon
  - Outline view'da tüm semboller
  - Tip tanımlarını listeleme
  - Fonksiyon tanımlarını listeleme
  - Sabit tanımlarını listeleme
  - Breadcrumb navigation
  - Go to symbol (`Ctrl+Shift+O`)
- ✨ **Code Formatting**: Otomatik kod formatlama
  - Otomatik girinti düzeltme
  - Format document (`Shift+Alt+F`)
  - Format selection (seçili alanı formatlama)
  - Tip ve fonksiyon tanımları için akıllı girinti
  - Koşullu ifadeler için girinti
- ▶️ **Run Kip File**: Kip programlarını doğrudan VS Code'dan çalıştırma
  - Üst sağda ▶️ Run butonu
  - Klavye kısayolu: `Ctrl+Shift+R` (Mac: `Cmd+Shift+R`)
  - Output panel'de sonuç gösterimi
  - Otomatik Kip derleyici kontrolü
  - Kurulum rehberi entegrasyonu
  - ✨ **Otomatik Kurulum**: Kip derleyicisi olmayan sistemler için tek tıkla otomatik kurulum
- 🔧 TypeScript desteği ile programatik extension

### Değişiklikler
- Extension artık TypeScript ile yazılmış
- "ya da" ifadesi artık diğer anahtar kelimelerle aynı renkte (mor/mavi)
- "ya da" ifadesi tek bir anahtar kelime olarak vurgulanıyor

---

## [0.1.0] - 2026-01-21

### İlk Sürüm 🎉

#### Eklenenler
- ✨ Kip dili için sözdizimi vurgulama (syntax highlighting)
- 📝 Yaygın Kip kod kalıpları için 17 snippet
- 🔧 Dil yapılandırması (parantez eşleştirme, yorumlar, otomatik kapanış)
- 📚 Kapsamlı README dokümantasyonu
- 🎨 Kip dosyaları için simge desteği

#### Desteklenen Özellikler
- Türkçe hal ekleri vurgulama
- Anahtar kelime vurgulama
- Yerleşik tip ve fonksiyon vurgulama
- Yorum ve string literal desteği
- Otomatik girinti
- Kod parçacıkları (snippets)

---

## Gelecek Sürümler İçin Planlananlar

### [0.2.0] - Planlanan
- Language Server Protocol (LSP) desteği
- Tip kontrolü ve hata gösterimi
- Otomatik tamamlama (IntelliSense)

### [0.3.0] - Planlanan
- REPL entegrasyonu
- Kod formatlama desteği
- Hata ayıklama (debugging) desteği

---

Sürüm formatı [Semantic Versioning](https://semver.org/) standardını takip eder.
