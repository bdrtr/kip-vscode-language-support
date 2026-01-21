// Kip dili için yerleşik fonksiyon ve anahtar kelime dokümantasyonu

export interface BuiltinDoc {
    signature: string;
    description: string;
    example: string;
    category: 'io' | 'arithmetic' | 'comparison' | 'string' | 'keyword' | 'type' | 'constant';
}

export const builtinDocs: Record<string, BuiltinDoc> = {
    // I/O Fonksiyonları
    'yazmak': {
        signature: '(değeri) yazmak',
        description: 'Verilen değeri ekrana yazdırır.',
        example: '"Merhaba Dünya"yı yaz.',
        category: 'io'
    },
    'yaz': {
        signature: '(değeri) yaz',
        description: 'Verilen değeri ekrana yazdırır (kısa form).',
        example: '5\'i yaz.',
        category: 'io'
    },
    'okumak': {
        signature: '(isim olarak) okumak',
        description: 'Kullanıcıdan girdi okur ve verilen değişkene atar.',
        example: 'isim olarak okuyup,',
        category: 'io'
    },
    'oku': {
        signature: '(isim olarak) oku',
        description: 'Kullanıcıdan girdi okur (kısa form).',
        example: 'değer olarak oku.',
        category: 'io'
    },

    // Aritmetik Fonksiyonlar
    'toplamı': {
        signature: '(bu değerle) (şu değerin) toplamı',
        description: 'İki sayının toplamını hesaplar.',
        example: '(5\'le 3\'ün toplamını) yaz.',
        category: 'arithmetic'
    },
    'farkı': {
        signature: '(bu değerle) (şu değerin) farkı',
        description: 'İki sayının farkını hesaplar.',
        example: '(10\'la 3\'ün farkını) yaz.',
        category: 'arithmetic'
    },
    'çarpımı': {
        signature: '(bu değerle) (şu değerin) çarpımı',
        description: 'İki sayının çarpımını hesaplar.',
        example: '(6\'yla 7\'nin çarpımını) yaz.',
        category: 'arithmetic'
    },

    // Karşılaştırma Fonksiyonları
    'eşitliği': {
        signature: '(bu değerle) (şu değerin) eşitliği',
        description: 'İki değerin eşit olup olmadığını kontrol eder.',
        example: '(5\'le 5\'in eşitliği) doğruysa,',
        category: 'comparison'
    },
    'küçüklüğü': {
        signature: '(bu değerle) (şu değerin) küçüklüğü',
        description: 'İlk değerin ikinciden küçük olup olmadığını kontrol eder.',
        example: '(3\'le 5\'in küçüklüğü) doğruysa,',
        category: 'comparison'
    },
    'büyüklüğü': {
        signature: '(bu değerle) (şu değerin) büyüklüğü',
        description: 'İlk değerin ikinciden büyük olup olmadığını kontrol eder.',
        example: '(10\'la 5\'in büyüklüğü) doğruysa,',
        category: 'comparison'
    },

    // String Fonksiyonları
    'uzunluğu': {
        signature: '(dizgenin) uzunluğu',
        description: 'Dizgenin karakter sayısını döndürür.',
        example: '("Merhaba"nın uzunluğunu) yaz.',
        category: 'string'
    },
    'birleşimi': {
        signature: '(bu dizgeyle) (şu dizgenin) birleşimi',
        description: 'İki dizgeyi birleştirir.',
        example: '("Merhaba "yla "Dünya"nın birleşimini) yaz.',
        category: 'string'
    },
    'tam-sayı-hali': {
        signature: '(dizgenin) tam-sayı-hali',
        description: 'Dizgeyi tam sayıya dönüştürür. Başarısızsa yokluk döner.',
        example: '("123"ün tam-sayı-hali)',
        category: 'string'
    },

    // Anahtar Kelimeler
    'ya': {
        signature: 'ya ... ya da ...',
        description: 'Tip tanımında alternatif yapıcıları belirtir.',
        example: 'Bir doğruluk ya doğru ya da yanlış olabilir.',
        category: 'keyword'
    },
    'ya da': {
        signature: 'ya ... ya da ...',
        description: 'Tip tanımında "veya" anlamında kullanılır.',
        example: 'ya boş ya da dolu olabilir.',
        category: 'keyword'
    },
    'olabilir': {
        signature: 'Bir tip ... olabilir.',
        description: 'Tip tanımını sonlandırır.',
        example: 'Bir doğruluk ya doğru ya da yanlış olabilir.',
        category: 'keyword'
    },
    'diyelim': {
        signature: 'değere isim diyelim.',
        description: 'Sabit tanımlar.',
        example: 'sıfırın ardılına bir diyelim.',
        category: 'keyword'
    },
    'olsun': {
        signature: 'Bir yerleşik tip olsun.',
        description: 'Yerleşik (primitive) tip tanımlar.',
        example: 'Bir yerleşik tam-sayı olsun.',
        category: 'keyword'
    },
    'Bir': {
        signature: 'Bir tip-adı ...',
        description: 'Yeni tip tanımı başlatır.',
        example: 'Bir doğruluk ya doğru ya da yanlış olabilir.',
        category: 'keyword'
    },

    // Tipler
    'tam-sayı': {
        signature: 'tam-sayı',
        description: 'Yerleşik tam sayı tipi.',
        example: '(bu tam-sayıyı) fonksiyon,',
        category: 'type'
    },
    'dizge': {
        signature: 'dizge',
        description: 'Yerleşik string tipi.',
        example: '(bu dizgeyi) fonksiyon,',
        category: 'type'
    },
    'doğruluk': {
        signature: 'doğruluk',
        description: 'Boolean tipi (doğru/yanlış).',
        example: 'Bir doğruluk ya doğru ya da yanlış olabilir.',
        category: 'type'
    },
    'listesi': {
        signature: 'öğe listesi',
        description: 'Çokbiçimli liste tipi.',
        example: 'Bir (öğe listesi) ya boş ya da eki olabilir.',
        category: 'type'
    },
    'olasılığı': {
        signature: 'öğenin olasılığı',
        description: 'Çokbiçimli Maybe/Optional tipi.',
        example: 'Bir (öğenin olasılığı) ya yokluğu ya da varlığı olabilir.',
        category: 'type'
    },

    // Sabitler
    'doğru': {
        signature: 'doğru',
        description: 'Boolean doğru değeri.',
        example: 'bu doğruysa,',
        category: 'constant'
    },
    'yanlış': {
        signature: 'yanlış',
        description: 'Boolean yanlış değeri.',
        example: 'yanlışsa,',
        category: 'constant'
    },
    'sıfır': {
        signature: 'sıfır',
        description: 'Doğal sayı sıfır değeri.',
        example: 'bu sıfırsa,',
        category: 'constant'
    },
    'boş': {
        signature: 'boş',
        description: 'Boş liste.',
        example: 'liste boşsa,',
        category: 'constant'
    },
    'yokluğu': {
        signature: 'yokluğu',
        description: 'Olasılık tipinde değer yok durumu (None).',
        example: 'değer yokluksa,',
        category: 'constant'
    },
    'varlığı': {
        signature: 'varlığı',
        description: 'Olasılık tipinde değer var durumu (Some).',
        example: 'n\'nin varlığıysa,',
        category: 'constant'
    },
    'durmak': {
        signature: 'durmak / durmaktır',
        description: 'Fonksiyonu sonlandırır.',
        example: 'durmaktır,',
        category: 'constant'
    }
};

// Kategori renkleri ve ikonları
export const categoryInfo = {
    io: { icon: '📝', color: '#4EC9B0', label: 'I/O' },
    arithmetic: { icon: '🔢', color: '#DCDCAA', label: 'Aritmetik' },
    comparison: { icon: '⚖️', color: '#C586C0', label: 'Karşılaştırma' },
    string: { icon: '📄', color: '#CE9178', label: 'String' },
    keyword: { icon: '🔑', color: '#569CD6', label: 'Anahtar Kelime' },
    type: { icon: '📦', color: '#4EC9B0', label: 'Tip' },
    constant: { icon: '💎', color: '#B5CEA8', label: 'Sabit' }
};
