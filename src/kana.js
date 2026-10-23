// Convert kana readings, never the applicant's actual name or source evidence.
export const toKatakana=value=>String(value||'').normalize('NFC').replace(/[\u3041-\u3096\u309d\u309e]/g,char=>String.fromCharCode(char.charCodeAt(0)+0x60));
export function normalizeReadings(document){return {...document,...Object.fromEntries(['furigana','addressKana','alternateAddressKana'].map(key=>[key,toKatakana(document[key])]))};}
