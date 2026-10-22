# Photo and education corrections (0.7.13)

- Portrait candidates are separate from full-page OCR images. The latter are only exposed under an explicit manual-crop option, and saving requires a crop selection.
- macOS Vision detects faces locally through `mac_faces.js`; Python crops a scan to a 3:4 head-and-shoulders image. Portrait-sized embedded images in the upper-right photo location can be reused directly. Detection failure returns no photo, never a whole page. No new cloud calls, keys, model downloads, or Python dependencies are required.
- Old unverified saved images are checked through the local `/api/portrait` route when opening the photo editor. User-confirmed crops carry `photoVerified` and remain editable. All temporary uploads are removed.
- Photo drag-and-drop works across the photo dialog and on the basic-information photo button.
- Education is edited as one school card with start/end dates. Exact consecutive duplicates and explicit admission/graduation pairs are grouped; dates are preserved. Completion type (卒業/修了/中退/退学/在学中) survives saves. Exports still show separate events, and unknown dates remain blank.
- New résumés default preferences to 貴社の規定に従います. Existing empty preferences receive this default when opened; custom text stays editable and is retained.
- PDF and Word now put birth/age and optional gender in separate cells.

Verification includes browser file-drop tests, grouped-school date editing, default/custom preference text, local portrait crop tests, legacy-image safeguards, and PDF/Word geometry checks. macOS Vision calls are mocked on this Linux execution environment; actual Mac face-detection accuracy and macOS execution are not verified here. Manual cropping remains available when detection cannot identify a portrait.
