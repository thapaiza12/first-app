# Recheck of Mac app 0.7.14

Date: 2026-10-22

The download ZIP was freshly extracted to a temporary directory. Its packaged sources were byte-compared to the reviewed source, and the copied test suites ran against that extracted app. Existing installed Node/Python dependencies were reused; this was not a fresh Mac dependency installation.

Passed checks:

- Backend/provider/data tests: 84.
- Browser workflows: 22, including photo drops on the dialog and profile button; full-page images not selected as portraits; one school with two dates; editing completion type before filling the end date; saved school dates and custom preferences surviving reopen.
- Resume layout/export tests: 11, including separate birth/gender cells, contact fitting, separate education events, long content preserved, and exactly two PDF pages with matching bottom margins.
- Document readers: 13.
- Portrait extraction/fallback: 5.

Total: 135 automated checks passed. The first review found and corrected completion-type reset and loss of graduation events in admission-labelled legacy periods. Unexpected native-detector JSON now falls back safely. The completion control also has an explicit accessible label.

ZIP CRC, executable launcher permissions, version 0.7.14, packaged-source equality, and exclusion of .env, .data, .git, .venv and node_modules passed.

SHA-256: b1c953229224ed4ea1462620e2ae9f74d91f802d8d9f53d1d5eba4ebba14916a

Limits: This is a Linux environment. macOS Vision invocation is mocked; actual Mac face-detection accuracy, Gatekeeper behavior and Microsoft Word pagination are not verified here. PDF output is actually rendered and checked; Word checks cover its editable content and fixed-page layout structure. A manual crop remains available if a portrait cannot be identified. No live Gemini/Groq success or unlimited free quota is implied by these tests.
