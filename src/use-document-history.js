import {useReducer,useCallback} from 'react';
import {createDocumentHistory,documentHistoryReducer} from './document-history';
export function useDocumentHistory(initial){
 const [state,dispatch]=useReducer(documentHistoryReducer,initial,value=>createDocumentHistory(typeof value==='function'?value():value));
 const setDocument=useCallback(value=>dispatch({type:'edit',value,now:Date.now()}),[]);
 const resetDocument=useCallback(document=>dispatch({type:'reset',document}),[]);
 const undo=useCallback(()=>dispatch({type:'undo'}),[]),redo=useCallback(()=>dispatch({type:'redo'}),[]),breakGroup=useCallback(()=>dispatch({type:'boundary'}),[]);
 return {document:state.present,setDocument,resetDocument,undo,redo,breakGroup,canUndo:!!state.past.length,canRedo:!!state.future.length};
}
