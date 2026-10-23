# 0.7.20 final marked contact adjustments

- Kanji address now uses the same measured prefix as its katakana reading, rather than aligning with the end of the postal code. Applied to current and alternate addresses, including wrapped lines, in PDF, Word and preview.
- Phone labels and values are inline; eleven-digit unformatted numbers gain display-only 3-4-4 hyphens. Full-width digits are supported. Already formatted, international and ambiguous other lengths are preserved. Stored input is not rewritten. Email retains its separate label/value lines.
- Fonts and other layout rules remain: title 15 pt, headings 12 pt, body 10.5 pt, explanatory notes 8 pt; shared divider and two-sheet layout retained.
- 91 Node, 17 PDF/Word/layout, 28 browser and 7 desktop checks passed (143 total).
- A synthetic two-page PDF was rendered and the revised first sheet visually inspected. PDF coordinates and browser bounding boxes verify kana/address alignment; PDF/Word checks verify inline formatted phone values.
- ZIP source/build equality, CRC, version, executable launcher mode and private-file exclusions verified.
- ZIP SHA256: `ae3c9c6d1006acb8a8bdeef598c2141a6ab0a46122c59001d12192a42035b84b`.

Checks ran on Linux with native Mac interactions simulated where unavailable. Actual Word pagination and Mac startup remain device-dependent. No live-provider test was needed; private uploaded applicant files are not committed or bundled.
