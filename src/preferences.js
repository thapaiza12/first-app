export const DEFAULT_PREFERENCES='貴社の規定に従います。';
// Keep the mandatory opening once; source preferences continue below it.
export function normalizePreferences(value=''){
 const rest=String(value||'').replace(/貴社の規定に従います[。．.]?/g,'').trimStart();
 return DEFAULT_PREFERENCES+(rest?'\n'+rest:'');
}
