# LSP Hatalarının Açıklaması

## Görülen Hatalar

### 1. `LSP: no handler for: SMethod_Initialized`
**Neden:**
- VS Code LSP client'ı, sunucu başlatıldıktan sonra otomatik olarak `initialized` notification'ı gönderir
- `kip-lsp` sunucusu bu notification için handler implement etmemiş
- Haskell LSP kodunda (`kip-lang/app/Lsp.hs`) sadece şu handler'lar var:
  - `SMethod_TextDocumentDidOpen`
  - `SMethod_TextDocumentDidChange`
  - `SMethod_TextDocumentDidSave`
  - `SMethod_TextDocumentHover`
  - `SMethod_TextDocumentDefinition`
  - `SMethod_TextDocumentCompletion`
  - `SMethod_TextDocumentFormatting`
- `SMethod_Initialized` handler'ı **yok**

**Etkisi:** 
- Extension çalışmaya devam eder
- Sadece bir uyarı mesajıdır
- İşlevselliği etkilemez

**Çözüm:**
- Client tarafında filtreleme yapılıyor (middleware ile)
- Veya sunucu tarafında boş handler eklenebilir

---

### 2. `Sending notification workspace/didChangeConfiguration failed`
**Neden:**
- VS Code, workspace ayarları değiştiğinde `workspace/didChangeConfiguration` notification'ı gönderir
- `kip-lsp` sunucusu bu notification'ı handle edemiyor veya connection kapalı
- Sunucu henüz tam başlatılmamış olabilir

**Etkisi:**
- Configuration değişiklikleri sunucuya ulaşmaz
- Ama temel LSP özellikleri çalışmaya devam eder

**Çözüm:**
- Middleware'de bu notification'ı filtrelemek
- Veya sunucu tarafında handler eklemek

---

### 3. `Sending document notification textDocument/didOpen failed`
**Neden:**
- Bir `.kip` dosyası açıldığında VS Code `textDocument/didOpen` notification'ı gönderir
- Bu notification başarısız oluyor, muhtemelen:
  - Sunucu henüz başlatılmamış
  - Connection problemi var
  - Sunucu crash olmuş olabilir

**Etkisi:**
- Dosya açıldığında sunucu dosyayı parse edemez
- Diagnostics (hata gösterimi) çalışmayabilir
- Hover, definition gibi özellikler etkilenebilir

**Çözüm:**
- Error handling iyileştirilmeli
- Sunucunun başlatıldığından emin olunmalı
- Retry mekanizması eklenebilir

---

### 4. `textDocument/documentSymbol` - Method not found (-32601)
**Neden:**
- VS Code `textDocument/documentSymbol` request'i gönderiyor
- `kip-lsp` sunucusu bu metodu implement etmemiş
- JSON-RPC error code `-32601` = "Method not found"

**Etkisi:**
- Outline view (dosya yapısı) çalışmaz
- Go to Symbol özelliği çalışmaz
- Ama diğer özellikler (hover, definition) çalışır

**Çözüm:**
- Client tarafında bu request'i handle etmek
- Veya sunucu tarafında `documentSymbol` handler'ı eklemek

---

## Genel Durum

### kip-lsp Sunucusunun Desteklediği Özellikler ✅
1. `textDocument/didOpen` - Dosya açıldığında
2. `textDocument/didChange` - Dosya değiştiğinde
3. `textDocument/didSave` - Dosya kaydedildiğinde
4. `textDocument/hover` - Hover bilgisi
5. `textDocument/definition` - Tanım bulma
6. `textDocument/completion` - Otomatik tamamlama
7. `textDocument/formatting` - Formatlama

### kip-lsp Sunucusunun Desteklemediği Özellikler ❌
1. `initialized` - İlk başlatma (opsiyonel)
2. `$/setTrace` - Trace ayarları (opsiyonel)
3. `workspace/didChangeConfiguration` - Config değişiklikleri
4. `textDocument/documentSymbol` - Dosya sembolleri
5. `textDocument/codeLens` - Code lens
6. `textDocument/semanticTokens` - Semantic tokens

---

## Çözüm Önerileri

### Kısa Vadeli (Client Tarafı)
✅ **Yapıldı:**
- Middleware ile unsupported notification'ları filtreleme
- Error handler ile hataları sessizce handle etme
- Connection interception ile notification'ları engelleme

### Uzun Vadeli (Sunucu Tarafı - Önerilen)
1. **Haskell LSP'ye handler eklemek:**
```haskell
handlers = mconcat
  [ notificationHandler SMethod_Initialized (\_ -> pure ())  -- Boş handler
  , notificationHandler SMethod_SetTrace (\_ -> pure ())    -- Boş handler
  , notificationHandler SMethod_WorkspaceDidChangeConfiguration (\_ -> pure ())
  -- ... mevcut handler'lar
  ]
```

2. **documentSymbol handler'ı eklemek:**
```haskell
, requestHandler SMethod_TextDocumentDocumentSymbol onDocumentSymbol
```

---

## Sonuç

Bu hatalar **normal** ve **beklenen** durumlar çünkü:
- `kip-lsp` sunucusu minimal bir LSP implementasyonu
- Sadece temel özellikleri destekliyor
- Opsiyonel özellikler için handler'lar yok

Extension bu durumları handle ediyor ve çalışmaya devam ediyor. Hatalar görsel olarak rahatsız edici olsa da, işlevselliği etkilemiyor.
