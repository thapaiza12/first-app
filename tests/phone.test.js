import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatPhone} from '../src/phone.js';
test('display formatting hyphenates eleven digits and preserves other numbers',()=>{
 assert.equal(formatPhone('07012345678'),'070-1234-5678');
 assert.equal(formatPhone('０９０１２３４５６７８'),'090-1234-5678');
 for(const value of ['','03-1234-5678','0312345678','+81 90 1234 5678','090-1234-5678'])assert.equal(formatPhone(value),value);
});
