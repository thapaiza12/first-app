# 0.7.19 annotated résumé refinements

- PDF and editable Word: title 15 pt, headings 12 pt, content 10.5 pt, alternate-contact explanation and gender note 8 pt; applicant-name sizing remains unchanged.
- Measured five-space indents for the name and reading labels; address uses a hanging indent aligned below the postal-code ending.
- Phone and Email labels appear on separate lines above their values. Contact width adapts within a bounded two-column layout; exceptionally long values wrap without silently shrinking or dropping text.
- One divider coordinate determines both birth/gender and address/contact table columns in PDF and Word.
- Existing two-sheet layout, content-sized motivation, bottom preferences, reading conversion, and undo/autosave behavior retained.
- Passed: 90 Node checks, 16 PDF/Word/layout checks, 27 browser checks, 7 desktop checks (140 total).
- Rendered and inspected both pages of a private sample reconstructed from the supplied annotated PDF. That reconstruction exercises layout, not renewed verification of applicant facts; neither it nor uploaded originals is committed or bundled.
- ZIP source/build equality, CRC, version, executable launcher permissions, and private-file exclusions verified.
- ZIP SHA256: `2041b6f0cfb8a7336f29c45c0bd8e6d14f37590669ecaf8ad8b2c10de8ad688b`.

Tests ran on Linux; native Mac operations are simulated where unavailable. Real Microsoft Word pagination and macOS startup remain device-dependent. Provider tests use synthetic or mocked data, not live account validation.
