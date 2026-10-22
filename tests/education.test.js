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

test('school editor pairs imported admission and graduation without duplicating the university',async()=>{
 const {educationSchools}=await import('../src/education.js');
 const rows=educationSchools([{name:'Pioneers multiple campus (大学)',date:'2018-02'},{name:'Pioneers multiple campus (大学)',date:'2022-04'}]);
 assert.equal(rows.length,1);assert.equal(rows[0].date,'2018-02');assert.equal(rows[0].end,'2022-04');
 assert.deepEqual(educationSchools(rows),rows);
 assert.deepEqual(educationEvents(rows).map(r=>[r.date,r.name]),[['2018-02','Pioneers multiple campus (大学)　入学'],['2022-04','Pioneers multiple campus (大学)　卒業']]);
});
test('graduation-only and graduate-school completion retain their known dates',async()=>{
 const {educationSchools}=await import('../src/education.js');
 const rows=educationSchools([{name:'大学院 入学',date:'2020-04'},{name:'大学院 修了',date:'2022-03'},{name:'高校 卒業',date:'2012-03'}]);
 assert.equal(rows[0].completion,'修了');assert.equal(rows[1].date,'');assert.equal(rows[1].end,'2012-03');
 const events=educationEvents(rows);assert.equal(events.length,3);assert.equal(events[1].name,'大学院　修了');
});
