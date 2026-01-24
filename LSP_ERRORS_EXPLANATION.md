# LSP "no handler" Hatalarının Nedeni ve Çözümü

## Sorunun Nedeni

### 1. LSP Protokolü ve Opsiyonel Metodlar
- `initialized` ve `setTrace` LSP protokolünde **opsiyonel** notification'lardır
- `vscode-languageclient` kütüphanesi bu notification'ları **otomatik olarak** gönderir
- Ancak `kip-lsp` sunucusu bu notification'lar için **handler implement etmemiş**

### 2. Neden Handler Yok?
`kip-lang/app/Lsp.hs` dosyasına bakarsak:

```haskell
handlers :: Handlers (LspM Config)
handlers = mconcat
  [ notificationHandler SMethod_TextDocumentDidOpen onDidOpen
  , notificationHandler SMethod_TextDocumentDidChange onDidChange
  , notificationHandler SMethod_TextDocumentDidSave onDidSave
  , requestHandler SMethod_TextDocumentHover onHover
  , requestHandler SMethod_TextDocumentDefinition onDefinition
  , requestHandler SMethod_TextDocumentCompletion onCompletion
  , requestHandler SMethod_TextDocumentFormatting onFormatting
  ]
```

`SMethod_Initialized` ve `SMethod_SetTrace` handler'ları **yok**.

### 3. Hata Mesajları
- `LSP: no handler for: SMethod_Initialized` - Client `initialized` notification gönderiyor, sunucu handler'ı yok
- `LSP: no handler for: SMethod_SetTrace` - Client `setTrace` notification gönderiyor, sunucu handler'ı yok

## Çözüm Seçenekleri

### Çözüm 1: Sunucu Tarafında Handler Eklemek (En Doğru Çözüm) ✅

`kip-lang/app/Lsp.hs` dosyasına şu handler'ları eklemek:

```haskell
handlers :: Handlers (LspM Config)
handlers = mconcat
  [ notificationHandler SMethod_Initialized (\_ -> pure ())  -- Boş handler
  , notificationHandler SMethod_SetTrace (\_ -> pure ())      -- Boş handler
  , notificationHandler SMethod_TextDocumentDidOpen onDidOpen
  -- ... diğer handler'lar
  ]
```

**Avantajları:**
- LSP protokolüne tam uyum
- Hatalar tamamen kaybolur
- Standart LSP implementasyonu

**Dezavantajları:**
- Sunucu kodunu değiştirmek gerekir
- `kip-lsp` projesinde değişiklik yapmak gerekir

### Çözüm 2: Client Tarafında Notification'ları Engellemek (Mevcut Yaklaşım) ⚠️

Client'ın `connection.sendNotification` metodunu intercept ederek bu notification'ları göndermemek.

**Avantajları:**
- Sadece extension kodunda değişiklik
- Sunucu koduna dokunmadan çözüm

**Dezavantajları:**
- LSP protokolünün standart davranışını değiştirir
- Farklı LSP client versiyonlarında çalışmayabilir
- Gelecekte sorun çıkarabilir

### Çözüm 3: Middleware Kullanmak (Önerilen Client Tarafı Çözüm) 🎯

LSP client'ın `middleware` özelliğini kullanarak notification'ları filtrelemek:

```typescript
const clientOptions: any = {
    // ...
    middleware: {
        sendNotification: (type, params, next) => {
            if (type.method === 'initialized' || type.method === '$/setTrace') {
                return; // Notification'ı gönderme
            }
            return next(type, params);
        }
    }
};
```

## Önerilen Çözüm

**Kısa vadede:** Çözüm 2 veya 3 (client tarafında filtreleme) - Extension'ı çalışır hale getirmek için

**Uzun vadede:** Çözüm 1 (sunucu tarafında handler eklemek) - LSP protokolüne tam uyum için

## Mevcut Durum

Şu anda **Çözüm 2** uygulanıyor ama yeterince etkili değil çünkü:
- Notification'lar client başlatılırken otomatik gönderiliyor
- Interception timing'i kritik
- Farklı LSP client versiyonlarında farklı davranabilir

## Önerilen İyileştirme

`middleware` kullanarak daha temiz ve güvenilir bir çözüm uygulamak.
