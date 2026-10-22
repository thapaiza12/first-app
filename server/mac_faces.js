// On-device face detection only; no API keys or network requests.
ObjC.import('Foundation');
ObjC.import('Vision');
function run(args) {
 const request=$.VNDetectFaceRectanglesRequest.alloc.init;
 const handler=$.VNImageRequestHandler.alloc.initWithURLOptions($.NSURL.fileURLWithPath(args[0]),$({}));
 if(!handler.performRequestsError($([request]),Ref()))throw Error('Face detection failed');
 const faces=[];
 for(let i=0;i<request.results.count;i++){
  const face=request.results.objectAtIndex(i),box=face.boundingBox;
  faces.push({x:box.origin.x,y:box.origin.y,width:box.size.width,height:box.size.height,confidence:face.confidence});
 }
 return JSON.stringify({faces});
}
