# M&A Group — Gemini & Local Career Workspace

Japanese 履歴書 and 職務経歴書 editor. When GEMINI_API_KEY is configured, Gemini is the default document-reading and drafting provider. Without it, the app uses free local OCR, extraction rules, and templates. No company password or login is required.

## What works

- Editable Japanese résumé and career-history forms, live preview, autosaved drafts.
- Local PDF, DOCX, XLSX/XLSM, PPTX, TXT/CSV/Markdown/JSON readers and common image formats (JPEG, PNG, WEBP, TIFF, BMP).
- Free Japanese/English Tesseract OCR for image uploads and scanned PDF pages (first eight pages). Embedded PDF text is read from all pages, up to 40 pages and 25MB per upload.
- Rule-based autofill of labelled contact information and dated education, employment, and qualification rows. Unknown or ambiguous fields remain blank. Imported values are reviewed before application and remain editable.
- Job-offer and career-history uploads with separate free-writing notes. Local draft creation uses the supplied text and common job/career keywords to assemble editable Japanese templates.
- Embedded applicant-photo reuse, crop, replacement, and deletion. Photo selection is heuristic and requires staff confirmation.
- PDF export with an embedded Japanese Mincho font, editable Word `.docx` export, and persistent history supporting more than 20 generated files.

**The local fallback is rule/template based, not generative AI. Gemini mode uses Google’s generative model.** It cannot interpret every document layout or produce the same varied language as a language model. OCR and autofill may misread text; staff must check originals and edit drafts. Legacy DOC/XLS and unsupported formats need conversion. Word may substitute a font unless Noto Serif JP is installed.

## Use on your Mac (no hosting)

Download and unzip the Mac launcher package into a permanent folder. See `START HERE - Mac.txt`. Install Node.js 24+ and Python 3.12+ once, then open `Start M&A Group.command`. The first launch installs dependencies; later launches open the app in your browser. Keep the Terminal window open during use. The launcher always binds to your own computer only and stores documents in the package folder's hidden `.data` directory. It never includes cloud credentials or applicant data in the download.

You can enter a Gemini key using hidden Terminal input each session, or press Return for local tools. Keys entered this way stay in the launched process environment, not a saved file. Gemini needs internet; installed local readers/editing/export/history work offline. Tesseract is optional for local image OCR; without it, text documents work and configured Gemini can still receive page images. Hosting is not needed. This is a source/launcher package, not a notarized standalone Mac binary. The launcher is validated on Linux; actual macOS behavior needs verification on the user's Mac.

## Run

Use the existing checkout at `/workspace/first-app`. Each cloud task is isolated; do not create a Git worktree unless explicitly requested.

Requirements: Node 24+, Python 3.12+, and the `tesseract` command. The selected cloud machine already provides Tesseract. On another machine, install Tesseract through its OS package manager first. Japanese and English OCR language data are bundled in `server/ocr/` under Apache 2.0, with checksums in `SHA256SUMS`.

```sh
cd /workspace/first-app
npm ci --cache /workspace/.npm-cache
python3 -m venv .venv
.venv/bin/pip install --cache-dir /workspace/.pip-cache -r requirements.txt
sha256sum --check server/ocr/SHA256SUMS
npm run build
PYTHON=/workspace/first-app/.venv/bin/python npm run dev
```

Development serves the built frontend and API on loopback port 3001. Run `npm run client` in a second terminal for Vite hot reload. Rebuild after frontend changes to update the backend-served UI.

For a production process, use `PYTHON=/workspace/first-app/.venv/bin/python npm start`. This starts without a password, with optional Gemini credentials. Optional environment variables are `PORT` (default 3001), `PYTHON` (default python3), and `DATA_DIR` (default `.data`). No variables are needed for local mode. Set GEMINI_API_KEY securely for Gemini mode; GEMINI_MODEL optionally overrides the default gemini-2.5-flash model. Older OpenAI/password variables are unused and can be deleted from environment settings.

## Access and storage

There is no authentication. Anyone who can reach the app can read, edit, download, or delete stored documents. For company-only use, restrict access through the company network/firewall; the app itself does not enforce company membership. Use HTTPS and persistent private storage for an actual company deployment. Hosting, server hardware, and electricity may still cost money; local processing has no API charges. Gemini free-tier availability, quotas, eligibility, and any charges depend on Google project/billing settings; this app cannot enforce a free-tier-only billing policy. It does not enable billing or automatically switch to a paid plan.

The private SQLite database, selected photos, text, and generated files are stored in `.data/` or `DATA_DIR`. Back up the entire directory consistently. Uploaded originals are deleted after parsing; extracted text and selected photos remain in documents and generated snapshots. Deleting a draft does not delete earlier generated snapshots: delete those separately from history. No automatic retention cap or expiry is imposed; available disk space limits storage. Disk encryption, hosting, company-domain setup, backups, and network restrictions are deployment responsibilities.

## Gemini setup and environment editor

1. Create a Google Gemini API key in Google AI Studio and restrict it to the Generative Language API where supported. If a key has been shared in chat, rotate it. Do not paste secret values into code, commits, screenshots, or chat.
2. In environment **Secrets**, add `GEMINI_API_KEY` with HTTPS destination `generativelanguage.googleapis.com`. Register the value privately in the environment editor. The key is used only by the backend, in the `x-goog-api-key` request header; it is never sent to the browser or put in the URL.
3. Review Google’s current free-tier and project billing settings. No perpetual/free/unlimited usage is promised. Model availability can change; optional `GEMINI_MODEL` defaults to `gemini-2.5-flash`.
4. Save environment changes and restart the app. Status reports configuration presence, not verified provider access. Run a representative document-reading and drafting request to validate the real key and quota.

When configured, uploading an existing document sends its text and first eight page images to Gemini. Job-offer/career uploads can also be transcribed with Gemini. Drafting sends job/career text, notes, and relevant experience fields; it omits separate name, phone, email, and photo fields, although uploaded source text may itself contain personal information. Follow company consent and data-handling rules and Google’s applicable data-use terms before submitting applicant information. There is no automatic hosted request in local mode.

If Gemini fails, times out, exhausts quota, or returns invalid/blocked output, the app shows an explanatory warning and uses local OCR/rules/templates. The result must not be mistaken for a Gemini-generated draft. All generated/extracted values are reviewed before application and remain editable.

Earlier setup drafts declared `AI_API_KEY` (OpenAI) and `COMPANY_PASSWORD`. Neither is used. Delete those obsolete entries from **Secrets** and **Environment variables** in the environment editor. The draft tool supports additive requirements only, so it cannot delete these old metadata entries programmatically. No company password should be supplied.

## Check

```sh
PYTHON=/workspace/first-app/.venv/bin/python npm test
npm run build
npm run test:e2e
```

Tests cover Gemini request structure, response validation, quota/error handling and explicit local fallback with simulated service responses, plus local extraction, Japanese era dates, missing/ambiguous information, template drafts, actual Japanese OCR, PDF/Word exports, applicant images from existing PDF/Word files, Excel/PowerPoint reading, retained history above 20 files, production startup without authentication, and browser workflows/mobile layout. Tests use temporary storage and synthetic applicant data. The review-dialog interaction test uses simulated helper responses; actual local helper functionality is covered by backend and workflow tests.

The bundled Noto Serif JP font is licensed under the SIL Open Font License (`server/fonts/OFL.txt`). It is a Japanese Mincho font, not a government certification. The supplied workflow reference informs the section flow and preview. Export pagination and spacing can differ from the continuous onscreen preview.

Live Gemini access is not established by mocked tests. It requires a privately configured key and a successful real provider request; no live Gemini validation has been completed yet.
