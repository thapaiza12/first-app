export const HISTORY_LIMIT=100;
export function createDocumentHistory(document){return {past:[],present:document,future:[],group:null,changedAt:0};}
export function documentHistoryReducer(state,action){
 if(action.type==='reset')return createDocumentHistory(action.document);
 if(action.type==='boundary')return state.group?{...state,group:null}:state;
 if(action.type==='undo'){
  if(!state.past.length)return state;
  return {...state,past:state.past.slice(0,-1),present:state.past.at(-1),future:[state.present,...state.future],group:null};
 }
 if(action.type==='redo'){
  if(!state.future.length)return state;
  return {...state,past:[...state.past,state.present].slice(-HISTORY_LIMIT),present:state.future[0],future:state.future.slice(1),group:null};
 }
 if(action.type!=='edit')return state;
 const next=typeof action.value==='function'?action.value(state.present):action.value;
 const keys=[...new Set([...Object.keys(state.present),...Object.keys(next)])].filter(key=>!Object.is(state.present[key],next[key])&&JSON.stringify(state.present[key])!==JSON.stringify(next[key]));
 if(!keys.length)return state;
 const fields=keys.filter(key=>key!=='confirmed');
 const group=fields.length===1&&typeof next[fields[0]]==='string'&&fields[0]!=='photo'?fields[0]:null;
 const merge=group&&state.group===group&&!state.future.length&&action.now-state.changedAt<750;
 return {past:merge?state.past:[...state.past,state.present].slice(-HISTORY_LIMIT),present:next,future:[],group,changedAt:action.now};
}
