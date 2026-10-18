# Verification review — 0.7.7

Reviewed on 2026-10-18 (Japan time). This is a code and artifact review, not a certificate of live Mac/provider operation.

## Review passes

1. Readers and OCR: PDF, Word text boxes/headers/tables, Excel sheets and formulas, PowerPoint tables/groups, Japanese text encodings, RTF, JPEG/PNG and multi-page TIFF; completeness flags and unreadable content.
2. Autofill and generation: field validation, partial-output rejection, field-group retry merging, applicant identity during asynchronous reads, retained job text, retry dialogs, original-source citations, sentence verification, cancellation, Gemini-first/Groq fallback and safe provider errors.
3. Delivery: dependency manifests, native launcher/bootstrap, separate persistent data and Keychain services, source/build version agreement, ZIP contents, executable permissions and a clean extracted-ZIP smoke test.

## Defects corrected during this review

- UTF-16/UTF-32 BOM text could be incorrectly decoded as legacy Japanese text.
- Excel formulas without cached results could disappear while the file was marked fully read. Formula text is now retained, a warning is shown, and the complete-text shortcut stays disabled.
- Unsupported Office image data could silently disappear. The reader now stops explicitly rather than claiming complete content.
- Native Mac OCR timeout/invalid output did not consistently reach an available Tesseract fallback.
- A later field group could return an unrequested phone/name field and overwrite an earlier valid result. Only each group's assigned fields can merge; malformed warnings are normalized.
- Successful job retries could duplicate retained raw text and leave the previous failure dialog open.
- Delayed reads could attach to another applicant after a document switch. Reads now check document identity before applying.
- Special-token-looking source strings could fail token counting. They are counted as ordinary document text.
- Automatic mode could stop on a Gemini key/request rejection despite an available Groq provider. The eligible fallback path now restarts with the same factual verification, while cancellation still stops immediately.

The running backend version is now visible in settings; the package builder checks it against the Mac bundle version.

## Completed checks

- Node backend/provider/grounding tests: 72 passed.
- Browser workflows: 18 passed.
- File readers/OCR adapter: 13 passed.
- Fixed two-page resume layouts and export constraints: 4 passed.
- Desktop lifecycle/key handling: 6 passed.
- Production frontend build: passed.

The two privately supplied four-page PDFs were inspected locally. A page of the job PDF was also rendered as JPEG and read using local OCR. Native job text and completed OCR text were preserved with zero cloud transcription calls. A simulated transport deliberately cut off career extraction responses; all 25 requested fields completed through separate groups without applying partial JSON. These transport results do not represent a live Groq generation test. Uploaded files and their text remain outside the repository and ZIP.

## Outstanding live validation

- A real Gemini generation attempt using the supplied documents passed evidence extraction, then Google returned a quota error at drafting. No completed live draft is claimed.
- The workspace proxy blocks api.groq.com with HTTP 403 before API authentication. The Groq key is on the user's Mac, not in this workspace. Live Groq generation was not verified here.
- Native macOS Vision, actual macOS Keychain dialogs, Gatekeeper and Microsoft Word pagination cannot execute in this Linux workspace. Adapter/lifecycle mocks and fixed-layout checks are reported separately from actual Mac execution.

Free-provider quotas and availability remain external constraints. OCR and generated claims still require original-document review. Supported readers do not mean every possible file extension or embedded object is supported; legacy DOC/XLS require conversion, and HEIC depends on an available image decoder. No unconditional end-to-end readiness or zero-error guarantee is asserted.

## Exact ZIP audit

The 0.7.7 ZIP passed CRC/integrity checks and byte comparison against every shipped source folder. Its extracted workspace started successfully in a clean temporary directory, reported backend version 0.7.7, preserved native/OCR job text without cloud credentials, saved a draft, exported a two-page PDF and exported editable DOCX. Runtime dependencies were reused from the test workspace; this does not emulate installing dependencies on a new Mac.

SHA-256: `5ad24dbd32311a0d8f88baa9179f92c19a5549d0f992f1bd5edf70e974b1a56b`.

All 113 automated checks above passed. The live-validation limitations remain; passing code tests is not the same as a successful live applicant-to-generated-draft run on the user's Mac.
