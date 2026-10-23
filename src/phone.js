// Display-only formatting; preserve international, ambiguous and already formatted values.
export function formatPhone(value=''){
 const original=String(value||'');const digits=original.normalize('NFKC').replace(/\s/g,'');
 return /^\d{11}$/.test(digits)?digits.slice(0,3)+'-'+digits.slice(3,7)+'-'+digits.slice(7):original;
}
