# Gemini import regression validation — 2026-10-16

The new language-level response schema listed an empty string as an enum value. The real Gemini endpoint rejected this request with HTTP 400 before reading the CV. The server then returned a successful local-rule response, which only recovered some fields.

The provider enum now contains only nonempty language levels. Unknown levels are omitted; local saved data can still use an empty level. A live request with the corrected schema returned HTTP 200 on its first attempt.

A synthetic two-page Japanese résumé PDF was generated, parsed by `server/documents.py`, and submitted with both full-page images and extracted text to the real Gemini service using a privately injected credential. Assertions passed for name, birth date, address, phone, two education rows, one employment record, one qualification, motivation, and preferences. No applicant data or credential values are recorded here.

Other safeguards: one compatible JSON-mode retry for generic request rejection; separate invalid/blocked-key errors; HTTP 502 on failed configured-Gemini requests instead of partial local success; retained-upload retry; settings connection check; and confirmation when imported and current applicant names differ. Mocked regression tests cover these failure paths. Actual applicant files and macOS-native behavior still need validation on the user's installation.
