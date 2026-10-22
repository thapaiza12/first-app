# Fixed résumé typography — 0.7.15

Requested policy: headings/labels 13 pt; content 12 pt; applicant name retains its larger fitting rule. The policy applies to the résumé PDF, editable Word output, and proportionally scaled browser preview. Career-document formatting and OCR/provider settings are unchanged.

The shared layout measures fixed-size text, widens contact columns (or uses full-width contact rows for longer emails), grows header areas for long kana, wraps English at word boundaries, and redistributes the available two-page section heights. It does not reduce content font size below 12 pt or silently discard text. Extremely long content is rejected with the requested sizes stated in the error. Font-size fixtures that previously relied on shrinking were adjusted to test fitting content at 12 pt; a separate regression verifies larger content is explicitly rejected without shrinking.

The user's agriculture/bakery motivation example was rendered in a two-page PDF and visually inspected. PDF text spans were checked for 13/12 pt values, the name was checked at 18 pt in the sample, and nonempty Word runs were checked for the corresponding half-point sizes. Further tests cover longer contact/kana fields, separate birth/gender cells, balanced bottom margins, and data preservation.

The ZIP was extracted into a temporary test workspace, its packaged sources byte-compared against the reviewed sources, and the following suites passed there:

- Backend/API/provider tests: 84.
- Browser workflows: 23.
- Résumé layout/PDF/Word tests: 14.

Total: 121 checks. ZIP CRC, executable launcher permissions, version 0.7.15, source equality and private-file exclusions also passed. Existing dependencies were reused; this was not a fresh Mac installation.

ZIP SHA-256: fa527274007eb82fbac6d6e1aa06803890bae47bf36567a6715ae02a20126148

Limitations: Microsoft Word itself is not available in this Linux environment; Word content, fonts and fixed layout structure are checked, but actual Word pagination is not rendered here. This update does not add new OCR engines or change the AI request policy.
