/**
 * Turkish Morphology Analyzer
 * 
 * Analyzes Turkish morphological variations (suffixes) to extract:
 * - Base identifier
 * - Grammatical case (Nom, Gen, Dat, Acc, Ins, Loc, Abl, Cond, P3s)
 */

export enum Case {
    Nom = 'Nom',      // Nominative (yalın hal)
    Gen = 'Gen',      // Genitive (-in eki)
    Dat = 'Dat',      // Dative (-e hali)
    Acc = 'Acc',      // Accusative (-i hali)
    Ins = 'Ins',      // Instrumental (ile, -le)
    Loc = 'Loc',      // Locative (-de hali)
    Abl = 'Abl',      // Ablative (-den hali)
    Cond = 'Cond',    // Conditional (-se, şart kipi)
    P3s = 'P3s'       // 3rd person possessive (-sI, tamlanan eki)
}

export interface MorphologyResult {
    base: string;
    case: Case;
    suffix: string;
}

/**
 * Turkish case suffixes
 */
const CASE_SUFFIXES: Array<{ suffix: string; case: Case }> = [
    // Genitive (-in eki)
    { suffix: 'nın', case: Case.Gen },
    { suffix: 'nin', case: Case.Gen },
    { suffix: 'nun', case: Case.Gen },
    { suffix: 'nün', case: Case.Gen },
    { suffix: 'ın', case: Case.Gen },
    { suffix: 'in', case: Case.Gen },
    { suffix: 'un', case: Case.Gen },
    { suffix: 'ün', case: Case.Gen },
    
    // Dative (-e hali)
    { suffix: 'ya', case: Case.Dat },
    { suffix: 'ye', case: Case.Dat },
    { suffix: 'a', case: Case.Dat },
    { suffix: 'e', case: Case.Dat },
    { suffix: 'na', case: Case.Dat },
    { suffix: 'ne', case: Case.Dat },
    
    // Accusative (-i hali)
    { suffix: 'yı', case: Case.Acc },
    { suffix: 'yi', case: Case.Acc },
    { suffix: 'ı', case: Case.Acc },
    { suffix: 'i', case: Case.Acc },
    { suffix: 'u', case: Case.Acc },
    { suffix: 'ü', case: Case.Acc },
    { suffix: 'nı', case: Case.Acc },
    { suffix: 'ni', case: Case.Acc },
    { suffix: 'nu', case: Case.Acc },
    { suffix: 'nü', case: Case.Acc },
    
    // Instrumental (ile, -le)
    { suffix: 'yla', case: Case.Ins },
    { suffix: 'yle', case: Case.Ins },
    { suffix: 'la', case: Case.Ins },
    { suffix: 'le', case: Case.Ins },
    
    // Locative (-de hali)
    { suffix: 'da', case: Case.Loc },
    { suffix: 'de', case: Case.Loc },
    { suffix: 'ta', case: Case.Loc },
    { suffix: 'te', case: Case.Loc },
    
    // Ablative (-den hali)
    { suffix: 'dan', case: Case.Abl },
    { suffix: 'den', case: Case.Abl },
    { suffix: 'tan', case: Case.Abl },
    { suffix: 'ten', case: Case.Abl },
    
    // Conditional (-se, şart kipi)
    { suffix: 'sa', case: Case.Cond },
    { suffix: 'se', case: Case.Cond },
    
    // 3rd person possessive (-sI, tamlanan eki)
    { suffix: 'sı', case: Case.P3s },
    { suffix: 'si', case: Case.P3s },
    { suffix: 'su', case: Case.P3s },
    { suffix: 'sü', case: Case.P3s }
];

/**
 * Analyze Turkish morphology to extract base identifier and case
 */
export function analyzeMorphology(word: string): MorphologyResult[] {
    const results: MorphologyResult[] = [];
    
    // First, add exact match (nominative)
    results.push({
        base: word,
        case: Case.Nom,
        suffix: ''
    });
    
    // Try to match case suffixes (longest first)
    const sortedSuffixes = [...CASE_SUFFIXES].sort((a, b) => b.suffix.length - a.suffix.length);
    
    for (const { suffix, case: caseType } of sortedSuffixes) {
        if (word.endsWith(suffix) && word.length > suffix.length) {
            const base = word.slice(0, -suffix.length);
            // Basic validation: base should be at least 2 characters
            if (base.length >= 2) {
                results.push({
                    base,
                    case: caseType,
                    suffix
                });
            }
        }
    }
    
    return results;
}

/**
 * Find base identifier from a word with possible Turkish suffix
 * Returns the most likely base (prefer shorter suffix matches)
 */
export function findBaseIdentifier(word: string): string {
    const analyses = analyzeMorphology(word);
    if (analyses.length === 0) {
        return word;
    }
    
    // Prefer nominative (exact match) or shortest suffix
    const sorted = analyses.sort((a, b) => {
        if (a.case === Case.Nom) return -1;
        if (b.case === Case.Nom) return 1;
        return a.suffix.length - b.suffix.length;
    });
    
    return sorted[0].base;
}

/**
 * Check if a word has a specific case suffix
 */
export function hasCase(word: string, caseType: Case): boolean {
    const analyses = analyzeMorphology(word);
    return analyses.some(a => a.case === caseType);
}

/**
 * Extract case from a word
 */
export function extractCase(word: string): Case {
    const analyses = analyzeMorphology(word);
    // Return first non-nominative case, or nominative if none found
    const nonNom = analyses.find(a => a.case !== Case.Nom);
    return nonNom ? nonNom.case : Case.Nom;
}
