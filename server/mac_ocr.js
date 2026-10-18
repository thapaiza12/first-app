// Native macOS OCR. Document contents are data; no network or shell execution.
ObjC.import('Foundation');
ObjC.import('Vision');
function run(args) {
  const request = $.VNRecognizeTextRequest.alloc.init;
  request.recognitionLevel = $.VNRequestTextRecognitionLevelAccurate;
  request.recognitionLanguages = $(['ja-JP', 'en-US']);
  request.usesLanguageCorrection = true;
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions($.NSURL.fileURLWithPath(args[0]), $({}));
  const error = Ref();
  if (!handler.performRequestsError($([request]), error)) throw Error('Native OCR failed');
  const lines = [];
  for (let i = 0; i < request.results.count; i++) {
    const candidates = request.results.objectAtIndex(i).topCandidates(1);
    if (candidates.count) lines.push(ObjC.unwrap(candidates.objectAtIndex(0).string));
  }
  return JSON.stringify({text: lines.join('\n')});
}
