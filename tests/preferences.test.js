import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreferences,DEFAULT_PREFERENCES} from '../src/preferences.js';
test('mandatory opening precedes imported preferences without duplicates',()=>{
 for(const source of ['',null,'貴社の規定に従います','貴社の規定に従います。'])assert.equal(normalizePreferences(source),DEFAULT_PREFERENCES);
 const actual=normalizePreferences('勤務地は東京を希望します。\n貴社の規定に従います。');
 assert.equal(actual,'貴社の規定に従います。\n勤務地は東京を希望します。\n');
 assert.equal(normalizePreferences(actual),actual);
 assert.equal(normalizePreferences('土日休み希望。'),DEFAULT_PREFERENCES+'\n土日休み希望。');
});
