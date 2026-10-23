import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toKatakana,normalizeReadings} from '../src/kana.js';
test('readings convert hiragana including voiced kana without changing actual name or evidence',()=>{
 assert.equal(toKatakana('やまだ たろう'),'ヤマダ タロウ');
 assert.equal(toKatakana('ゔぁん・ごっほー'),'ヴァン・ゴッホー');
 assert.equal(toKatakana('う\u3099ぁん'),'ヴァン');
 const d={name:'山田たろう',furigana:'やまだ たろう',addressKana:'とうきょうと',alternateAddressKana:'おおさか',sourceText:'やまだ'};
 const n=normalizeReadings(d);assert.equal(n.name,d.name);assert.equal(n.sourceText,d.sourceText);assert.equal(n.furigana,'ヤマダ タロウ');assert.equal(n.addressKana,'トウキョウト');assert.deepEqual(normalizeReadings(n),n);assert.equal(d.furigana,'やまだ たろう');
});
