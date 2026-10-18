# M&A CV creation — M&A Group

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

## Use on your Mac — no Terminal window

Download `downloads/MA-Group-Mac-App.zip`, unzip it, and drag **M&A Group.app** into Applications. Open that icon or add it to Dock. It starts the server in the background and opens the browser. Closing the browser or Terminal does not stop this background process. Opening the icon again reconnects to the same process. After restarting the Mac, open the icon again. No login password or hosting is required.

Node.js 24+ and Python 3.12+ are still one-time prerequisites. Existing installations from the previous version are reused. First open prepares dependencies in `~/Library/Application Support/M&A Group/app`; it never installs inside the downloaded app bundle. A normal macOS dialog asks for a Gemini key, stored through the native macOS Keychain backend. There is no plaintext key file. Choose local tools to skip Gemini. The app settings contain controls to update the key and stop the background app deliberately.

Applicant data is kept separately in `~/Library/Application Support/M&A Group/data`. Keep and back up that directory when replacing the app. The old `.command` version's `.data` folder is not migrated automatically: preserve the old folder and move its documents deliberately before deleting it. Setup logs are in `~/Library/Logs/M&A Group/app.log`. Never post API keys with logs.

This app is unsigned and not notarized, so macOS may require a one-time Privacy & Security **Open Anyway** approval. Do not disable system security. The background lifecycle, packaging, and Keychain control logic are tested on Linux with the Keychain API simulated. Actual LaunchServices, Keychain permissions, and Gatekeeper behavior must still be verified on a Mac. The download is not a prebuilt native executable: the installed runtimes run the web app locally, with a graphical launcher.

For maintainers: `npm run package:mac` builds the distributable; `npm run test:desktop` tests persistence after launcher exit, instance checking, and key reuse. The source-level `.app` wrapper also works from this checkout, but the distributable `.app` includes all source resources and copies them to writable Application Support.

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

## Document formats

履歴書 now uses a two-sheet sample layout: optional gender, current and alternate contact addresses, combined education/employment chronology, licenses, the combined motivation/strengths area, and applicant preferences. It excludes family/dependant/spouse questions. Date and alternate-contact information are editable. Résumé downloads are limited to exactly two fixed sheets. Text is measured at readable font sizes before export. If education/employment, qualifications, or writing cannot fit, both PDF and Word exports stop with an actionable message; they never silently discard input or add a third sheet. The PDF page count is checked after generation. Word uses two fixed-height sheets with measured, manually wrapped editable text; changes made later in Word may change its layout.

This is an independent recreation of the ministry sample's field structure. The official ministry page (`https://www.mhlw.go.jp/stf/newpage_kouseisaiyou030.html`) could not be retrieved because the cloud network blocked that host. It has not been compared with the actual official PDF/Excel file; do not represent it as an exact official-template reproduction or government-certified form. An uploaded official file is needed to verify an exact match.

職務経歴書 uses these six numbered sections: 1. 職務要約 (name, 記入日 and editable summary), 2. 活かせる経験・知識・技術, 3. 職務経歴 (editable company entries with an add-company button), 4. テクニカルスキル, 5. 資格・語学力 (qualifications with names/dates plus language, the five requested proficiency levels, language qualification/date), and 6. 自己PR・志望動機, followed by 以上. It has no decorative rules outside employment tables. It does not export résumé photo, birth-date, gender, or address boxes. Each résumé company prints two rows, 入社 and 退社, with their respective dates. Current employment is an explicit editable flag and uses 現在に至る in the second row. Legacy separate 入社/退社 records are paired without inventing dates. Blank end dates alone do not imply a current job. PDF and editable Word exports follow the same distinct structures.

## Gemini setup and environment editor

1. Create a Google Gemini API key in Google AI Studio and restrict it to the Generative Language API where supported. If a key has been shared in chat, rotate it. Do not paste secret values into code, commits, screenshots, or chat.
2. In environment **Secrets**, add `GEMINI_API_KEY` with HTTPS destination `generativelanguage.googleapis.com`. Register the value privately in the environment editor. The key is used only by the backend, in the `x-goog-api-key` request header; it is never sent to the browser or put in the URL.
3. Review Google’s current free-tier and project billing settings. No perpetual/free/unlimited usage is promised. Model availability can change; optional `GEMINI_MODEL` defaults to `gemini-2.5-flash`.
4. Save environment changes and restart the app. Status reports configuration presence, not verified provider access. Run a representative document-reading and drafting request to validate the real key and quota.

When configured, uploading an existing document sends its text and first eight page images to Gemini. Job-offer/career uploads can also be transcribed with Gemini. Drafting separates applicant originals (`sourceText`, `careerText`) from job requirements (`jobText`, `jobNotes`). Uploaded originals are authoritative; when none exist, explicitly entered education, experience, skills, technical skills, qualifications, and languages are used with a warning. Previous generated summaries, motivation, PR text, and unconfirmed career notes never become applicant evidence. Separate structured contact details and photos are omitted, although source documents may themselves contain personal information. Follow company consent and data-handling rules and Google’s applicable data-use terms before submitting applicant information. There is no automatic hosted request in local mode.

If Gemini fails, times out, exhausts quota, or returns invalid/blocked output, the API returns an error and the review screen stops the import. It never silently substitutes local extraction for a configured Gemini provider. Invalid/blocked keys are classified without exposing raw provider errors. A generic 400 request rejection is retried once with compatible JSON mode, preserving the text and images. Staff can retry the retained upload or test connectivity in settings. Local OCR/rules/templates remain available when Gemini is deliberately unconfigured. All generated/extracted values are reviewed before application and remain editable.

Earlier setup drafts declared `AI_API_KEY` (OpenAI) and `COMPANY_PASSWORD`. Neither is used. Delete those obsolete entries from **Secrets** and **Environment variables** in the environment editor. The draft tool supports additive requirements only, so it cannot delete these old metadata entries programmatically. No company password should be supplied.

## Grounded application writing

Every applicant/job request runs fresh evidence extraction, generation, and independent verification. Applicant facts must have literal source quotations. Draft sentences reference those facts; every sentence must receive an explicit supported verdict. Factual sentences also need valid applicant-source quotations. Missing/duplicate checks, unknown references, uncertain claims, unverifiable quotes, or unsupported achievements prevent release. Conservative checks additionally reject unquoted inflated outcomes/abilities and numeric claims. There is one regeneration and re-verification attempt; persistent failures return an error without changing the existing draft. Jobs, future aspirations, and negated experience cannot establish past applicant experience. The review dialog exposes source quotations and gaps.

Normally this uses three Gemini calls; regeneration uses two more, and request compatibility retries can add calls. Google free-tier quota and latency apply. Quota/verification failures withhold output instead of bypassing checks. Offline templates now write only generic future motivation, leaving experience/PR/summary empty. These controls reduce fabrication; semantic verification still uses an LLM and is not a guarantee of real-world truth. Staff must compare originals and confirm the applicant's intent.

## Check

```sh
PYTHON=/workspace/first-app/.venv/bin/python npm test
npm run build
npm run test:e2e
```

Tests cover Gemini request structure, response validation, quota/error handling and 400 compatibility recovery, invalid/blocked keys, failed-import protection and retry with simulated service responses, plus local extraction, Japanese era dates, missing/ambiguous information, template drafts, actual Japanese OCR, PDF/Word exports, applicant images from existing PDF/Word files, Excel/PowerPoint reading, retained history above 20 files, production startup without authentication, and browser workflows/mobile layout. Tests use temporary storage and synthetic applicant data. The review-dialog interaction test uses simulated helper responses; actual local helper functionality is covered by backend and workflow tests.

The bundled Noto Serif JP font is licensed under the SIL Open Font License (`server/fonts/OFL.txt`). It is a Japanese Mincho font, not a government certification. The supplied workflow reference informs the section flow and preview. Export pagination and spacing can differ from the continuous onscreen preview.

Live Gemini validation on 2026-10-16 reproduced HTTP 400 from the language-level schema enum containing an empty string. Removing that invalid provider enum value produced HTTP 200 on the first attempt. A synthetic two-page Japanese résumé PDF was then read through the actual PDF reader and Gemini service: name, birth date, address, phone, both education entries, employment, qualification, motivation, and preferences passed assertions. This verifies that synthetic fixture, not every applicant document or Mac configuration. See `docs/gemini-validation.md`.

## Name and readability

The product/browser-tab title is M&A CV creation. Form controls use black text at 16px or larger, with larger labels and responsive layouts. The loopback address remains a working local URL; a phrase containing spaces and an ampersand cannot replace a browser hostname. No hosts-file edits, root privileges, or custom DNS are requested.

## Gemini and Ollama

AI settings persist in the existing SQLite data directory. Default `auto` prefers Gemini when its key is configured, and restarts the complete request on local Ollama after quota, connection, unavailable-model or provider failures. Factual/verification, credential and document-validation failures do not bypass checks through another model. With no key, automatic mode uses an available Ollama service; otherwise it retains offline OCR/templates. Explicit `ollama` never sends data to Gemini. Explicit `gemini` never falls back. Both providers reuse extraction validation and the full cited-fact writing/verification pipeline.

On Mac install/open [Ollama](https://ollama.com/download/mac), then download `gemma3:4b` from its model selector. This is optional and separate from the app ZIP; no API key is required. A local model and several GB of disk space are required; 16 GB RAM is recommended. Select/save the mode and model inside app settings. No terminal is required for routine use. PDF/image input requires a vision-capable local model. Cloud models, external server addresses and redirects are refused. The backend defaults to `http://127.0.0.1:11434`; optional `OLLAMA_BASE_URL` must be a loopback HTTP origin and `OLLAMA_MODEL` sets the initial model name. Neither is a secret.

Local context is deliberately bounded: prompts above 16,000 characters are rejected rather than silently truncated; the chat context is 8,192 tokens with a maximum 2,048-token response for 8 GB Macs. Near-limit or incomplete replies are withheld. A local operation has a three-minute total deadline. Local model latency, Japanese reading quality and hardware compatibility require testing on the user's Mac. Transport and provider-selection tests use a simulated Ollama service, not downloaded model weights. Automatic mode can send documents to Google first; use Ollama-only for local processing. Gemini quota still applies to its requests. No paid plan is enabled by this app.

### 8 GB Mac import improvements (0.6.1)

Suitable text-based PDFs use all extracted native text without also asking Ollama to inspect page images. The reader conservatively disables this route for short/invalid text or substantial raster sections. Scanned multi-page PDFs are transcribed one page at a time, then their complete transcriptions are organized in one text request; those transcriptions become the retained source evidence. Source material is not shortened to fit. Context/response limits can require splitting long documents or using Gemini.

The busy screen shows elapsed time and an AI cancel button. Browser cancellation closes the backend provider request; active Ollama/Gemini HTTP calls use the abort signal, and cancelled results cannot change the form. Existing factual verification remains enabled. These changes reduce configured memory demand; speed on the user's M1/8 GB hardware has not been benchmarked. Quit/reopen Ollama before testing the new build if an old request is still running.
