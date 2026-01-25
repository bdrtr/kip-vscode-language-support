/**
 * Kip Lexer — ra-kip/crates/kip-lexer token.rs ile 1:1 uyumlu.
 * Kılavuz: https://github.com/kip-dili/kip/wiki/Kılavuz
 *
 * - Anahtar kelimeler, sayı/dizge/ident, noktalama token.rs ile aynı.
 * - Yorum (* ... *) atlanır. Çok kelimeli isimler tireyle (tam-sayı, öğe-listesi).
 * - Sayı eki: 5'in, 3.14'ü (kesme işareti). Dizge kaçış: \n \t \\ \"
 */

export type TokenKind =
    | 'Bir' | 'Ya' | 'Da' | 'Olabilir' | 'Olsun' | 'Var' | 'Olamaz'
    | 'Yerlesik' | 'Yerlesiktir' | 'Diyelim' | 'Olarak' | 'Yukle' | 'Ile' | 'Ise' | 'Degilse'
    | 'Dogru' | 'Yanlis' | 'Dogruysa' | 'Yanlissa' | 'Yokluksa'
    | 'Float' | 'IntegerWithSuffix' | 'Integer' | 'String' | 'Ident'
    | 'Dot' | 'Comma' | 'LParen' | 'RParen' | 'Apostrophe';

export interface Token {
    kind: TokenKind;
    /** Orijinal metin (token.rs'deki `text`). Parser uyumu için `token` ile aynı. */
    text: string;
    /** Parser uyumu: token === text */
    token: string;
    start: number;
    line: number;
    char: number;
}

/** Orijinal token.rs + Kılavuz keyword'leri. Uzun→kısa sıra (doğruysa before doğru). */
const KEYWORDS_ORDERED: [string, TokenKind][] = [
    ['yerleşiktir', 'Yerlesiktir'],
    ['yerleşik', 'Yerlesik'],
    ['olabilir', 'Olabilir'],
    ['değilse', 'Degilse'],
    ['doğruysa', 'Dogruysa'],
    ['yanlışsa', 'Yanlissa'],
    ['yokluksa', 'Yokluksa'],
    ['diyelim', 'Diyelim'],
    ['olarak', 'Olarak'],
    ['olamaz', 'Olamaz'],
    ['olsun', 'Olsun'],
    ['yükle', 'Yukle'],
    ['yanlış', 'Yanlis'],
    ['doğru', 'Dogru'],
    ['Bir', 'Bir'],
    ['var', 'Var'],
    ['ile', 'Ile'],
    ['ise', 'Ise'],
    ['ya', 'Ya'],
    ['da', 'Da'],
];

/** LSP/semantic tokens için: keyword mü? (metin) */
export const KIP_KEYWORDS = new Set(KEYWORDS_ORDERED.map(([s]) => s));

/** Keyword token kind'ları (renklendirme için) */
export const KEYWORD_KINDS = new Set<TokenKind>(KEYWORDS_ORDERED.map(([, k]) => k));

const WS = /[ \t\r\n]+/gy;
const COMMENT = /\(\*([^*]|\*[^)])*\*\)/gy;
const FLOAT = /-?[0-9]+\.[0-9]+/gy;
const INT_SUFFIX = /-?[0-9]+'[a-zA-ZçğıöşüÇĞİÖŞÜ]+/gy;
const INT = /-?[0-9]+/gy;
const STRING = /"([^"\\]|\\.)*"/gy;
const IDENT = /[a-zA-ZçğıöşüÇĞİÖŞÜ][a-zA-ZçğıöşüÇĞİÖŞÜ0-9\-]*/gy;

function pos(text: string, offset: number): { line: number; char: number } {
    const before = text.slice(0, offset);
    const lines = before.split('\n');
    const line = lines.length - 1;
    const char = lines[lines.length - 1].length;
    return { line, char };
}

function skipWsAndComments(source: string, i: number): number {
    let pos = i;
    for (;;) {
        WS.lastIndex = pos;
        const m = WS.exec(source);
        if (m && m.index === pos) {
            pos = WS.lastIndex;
            continue;
        }
        COMMENT.lastIndex = pos;
        const c = COMMENT.exec(source);
        if (c && c.index === pos) {
            pos = COMMENT.lastIndex;
            continue;
        }
        break;
    }
    return pos;
}

/**
 * Kaynağı tokenlara ayır. Çıktı, orijinal kip-lexer (token.rs) ile aynı tür ve sırayla uyumludur.
 * Sıra: boşluk/yorum atla → float → int+suffix → int → string → keyword → ident → noktalama.
 */
export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const n = source.length;

    while (i < n) {
        i = skipWsAndComments(source, i);
        if (i >= n) break;

        const { line, char } = pos(source, i);
        let matched = false;

        // 1. Keyword (uzun → kısa)
        for (const [kw, kind] of KEYWORDS_ORDERED) {
            if (source.startsWith(kw, i)) {
                const rest = source[i + kw.length];
                const nextIsIdent = /[a-zA-ZçğıöşüÇĞİÖŞÜ0-9\-]/.test(rest ?? '');
                if (!nextIsIdent) {
                    tokens.push({ kind, text: kw, token: kw, start: i, line, char });
                    i += kw.length;
                    matched = true;
                    break;
                }
            }
        }
        if (matched) continue;

        // 2. Float
        FLOAT.lastIndex = i;
        let m = FLOAT.exec(source);
        if (m && m.index === i) {
            const t = m[0];
            tokens.push({ kind: 'Float', text: t, token: t, start: i, line, char });
            i = FLOAT.lastIndex;
            continue;
        }

        // 3. IntegerWithSuffix
        INT_SUFFIX.lastIndex = i;
        m = INT_SUFFIX.exec(source);
        if (m && m.index === i) {
            const t = m[0];
            tokens.push({ kind: 'IntegerWithSuffix', text: t, token: t, start: i, line, char });
            i = INT_SUFFIX.lastIndex;
            continue;
        }

        // 4. Integer
        INT.lastIndex = i;
        m = INT.exec(source);
        if (m && m.index === i) {
            const t = m[0];
            tokens.push({ kind: 'Integer', text: t, token: t, start: i, line, char });
            i = INT.lastIndex;
            continue;
        }

        // 5. String
        STRING.lastIndex = i;
        m = STRING.exec(source);
        if (m && m.index === i) {
            const t = m[0];
            tokens.push({ kind: 'String', text: t, token: t, start: i, line, char });
            i = STRING.lastIndex;
            continue;
        }

        // 6. Ident
        IDENT.lastIndex = i;
        m = IDENT.exec(source);
        if (m && m.index === i) {
            const t = m[0];
            tokens.push({ kind: 'Ident', text: t, token: t, start: i, line, char });
            i = IDENT.lastIndex;
            continue;
        }

        // 7. Punctuation
        const c = source[i];
        if (c === '.') {
            tokens.push({ kind: 'Dot', text: '.', token: '.', start: i, line, char });
            i += 1;
            continue;
        }
        if (c === ',') {
            tokens.push({ kind: 'Comma', text: ',', token: ',', start: i, line, char });
            i += 1;
            continue;
        }
        if (c === '(') {
            tokens.push({ kind: 'LParen', text: '(', token: '(', start: i, line, char });
            i += 1;
            continue;
        }
        if (c === ')') {
            tokens.push({ kind: 'RParen', text: ')', token: ')', start: i, line, char });
            i += 1;
            continue;
        }
        if (c === "'") {
            tokens.push({ kind: 'Apostrophe', text: "'", token: "'", start: i, line, char });
            i += 1;
            continue;
        }

        // Bilinmeyen karakter: takılmayı önlemek için atla
        i += 1;
    }

    return tokens;
}
