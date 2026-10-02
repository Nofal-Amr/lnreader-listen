# Stage 4 — Text Pipeline (watermarks, titles, speaking rules)

**Goal:** The cleaning from `epub_cleaner.py`, built into the app, plus T2S's "Speaking text process".

**Architecture:**

- `cleaner/` is a TypeScript port of `epub_cleaner.py`'s Detector (site names, sentence/paragraph/navigation patterns, heuristics, inline span cutting) and `fix_title`. Python's case-sensitive TLD groups `(?-i:…)` have no JS equivalent, so brand TLDs are matched with a separate case-sensitive sticky regex.
- `cleanChapterHtml()` runs on chapter HTML **before** both the reader renders and ListenQueue extracts paragraphs. Display and audio therefore agree, and reader highlight indices stay aligned with the native queue. It removes watermark paragraphs, cuts embedded watermarks, removes short site-link paragraphs, fixes the opening title and drops a duplicated title line.
- Speaking rules (`speechRules.ts`) are speech-only and run per paragraph after extraction: built-in toggles (links, punctuation names, `[1]` references, separator lines) plus ordered custom Remove/Replace rules (whole word, match case, regex). A paragraph emptied by rules keeps its index; native skips blank paragraphs instead of filtering them.
- Settings live in `ChapterReaderSettings.tts.cleaner` and `.speech`, read fresh through `textPipeline.ts`.
- UI: `SpeechRulesSection` in the TTS sheet. Rules can be imported from the clipboard as T2S-style lines (`Remove "…"`, `Replace "…" to "…"`) or as JSON, and exported as JSON.

**Verification:** jest suites for the detector, title fixer, HTML cleaner, speech rules and import. A dry run over all 354 chapters (28,001 paragraphs) of the user's already-cleaned EPUB changed only one paragraph, a stray cover-image URL, so there were no story false positives.
