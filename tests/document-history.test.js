import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentHistory,documentHistoryReducer,HISTORY_LIMIT} from '../src/document-history.js';
const edit=(state,value,now=1000)=>documentHistoryReducer(state,{type:'edit',value,now});
test('continuous writing is one undoable edit and redo restores it',()=>{
 const initial={name:'',confirmed:false};let state=createDocumentHistory(initial);
 state=edit(state,{...initial,name:'A'},1000);state=edit(state,{...initial,name:'Alice'},1200);
 assert.equal(state.past.length,1);state=documentHistoryReducer(state,{type:'undo'});assert.deepEqual(state.present,initial);
 state=documentHistoryReducer(state,{type:'redo'});assert.equal(state.present.name,'Alice');
});
test('checkboxes, removed rows, and applied AI fields can be undone together',()=>{
 const initial={name:'A',confirmed:false,experience:[{name:'Company'}],motivation:'Original',strengths:'Original strength'};let state=createDocumentHistory(initial);
 state=edit(state,{...initial,confirmed:true});state=documentHistoryReducer(state,{type:'undo'});assert.equal(state.present.confirmed,false);
 state=edit(state,{...initial,experience:[]});state=documentHistoryReducer(state,{type:'undo'});assert.equal(state.present.experience.length,1);
 state=edit(state,{...initial,motivation:'AI draft',strengths:'AI strength'});state=documentHistoryReducer(state,{type:'undo'});assert.deepEqual(state.present,initial);
});
test('new edits discard redo, reset isolates applicants, and history has a bound',()=>{
 let state=createDocumentHistory({name:''});for(let i=0;i<150;i++)state=edit(state,{name:String(i)},i*1000);
 assert.equal(state.past.length,HISTORY_LIMIT);state=documentHistoryReducer(state,{type:'undo'});assert.ok(state.future.length);
 state=edit(state,{name:'Replacement'},999999);assert.equal(state.future.length,0);
 state=documentHistoryReducer(state,{type:'reset',document:{name:'Another applicant'}});assert.equal(state.past.length,0);assert.equal(state.future.length,0);
 assert.equal(documentHistoryReducer(state,{type:'undo'}).present.name,'Another applicant');
});
test('blur boundaries and no-op edits do not merge or add misleading history',()=>{
 let state=createDocumentHistory({name:''});state=edit(state,{name:'A'});const unchanged=edit(state,{name:'A'});assert.equal(unchanged,state);
 state=documentHistoryReducer(state,{type:'boundary'});state=edit(state,{name:'AB'},1100);assert.equal(state.past.length,2);
 state=documentHistoryReducer(state,{type:'undo'});assert.equal(state.present.name,'A');
});
