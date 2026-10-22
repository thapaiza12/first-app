import {test} from 'node:test';
import assert from 'node:assert/strict';
import {educationEvents} from '../src/education.js';
test('education periods become separate admission and graduation rows with their own dates',()=>{
 const rows=educationEvents([{name:'テスト大学',date:'2012-04',end:'2016-03',detail:'経済学部'}]);
 assert.deepEqual(rows.map(r=>[r.date,r.name]),[['2012-04','テスト大学　入学'],['2016-03','テスト大学　卒業']]);
 assert.deepEqual(educationEvents(rows),rows);
});
test('legacy duplicate school descriptions are cleaned without inventing admission dates',()=>{
 const rows=educationEvents([{name:'テスト大学',date:'2016-03',detail:'テスト大学 卒業'}]);
 assert.equal(rows.length,1);assert.equal(rows[0].name,'テスト大学 卒業');assert.equal(rows[0].detail,'');
});
test('explicit events are split and unknown dates remain blank',()=>{
 const rows=educationEvents([{name:'テスト大学 入学\nテスト大学 卒業',date:'2012-04'}]);
 assert.equal(rows.length,2);assert.equal(rows[1].date,'');
});
