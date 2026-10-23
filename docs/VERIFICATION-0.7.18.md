# 0.7.18 résumé typography and spacing

- Résumé PDF and DOCX use 12 pt labels/headings and 11 pt content; existing larger name fitting is unchanged.
- Chronology headings are centered in their description cell on both sheets.
- The first sheet reserves 28 pt below its table for the optional-gender note.
- Motivation height is measured from wrapped content with 1.5 blank lines below; spare second-sheet space goes to chronology/qualification tables. Preferences end at the established page-two bottom margin.
- Kana readings are normalized at import, document reopening, manual commit, backend validation, and direct export. Actual names and source evidence are preserved. IME composition is retained until committed.
- 90 Node checks, 15 PDF/Word layout checks, 27 browser checks, and 7 desktop checks passed (139 total).
- Two synthetic sample PDF sheets were rendered and visually inspected. Tests assert centered PDF/Word headings, font sizes, katakana, gender-note inclusion, writing-box padding, and two-page output.
- Packaged sources match checked source/build files; ZIP CRC, launcher executable mode, version and private-data exclusions verified.
- ZIP SHA256: `65071c2e180b9cff7f65ed6feb669e49f65a3621c866dd11579fed563b2ed06e`.

Checks ran on Linux. Native macOS integrations are mocked where needed; actual Microsoft Word pagination, installed fonts, and macOS startup require on-device verification. Provider regression tests use simulated responses; no new live applicant/API validation was performed.
