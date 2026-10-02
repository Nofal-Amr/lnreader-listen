# Stage 1 — Identity and CI Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the fork install as a separate app, "LNReader Listen", and have GitHub Actions publish an installable APK to Releases on every push to `master`.

**Architecture:** Change the Expo app identity in `app.json` (name, scheme, Android package) and the in-app deep-link prefix. Add one workflow, `listen-release.yml`, that reuses the steps of the upstream `build.yml` (pnpm → expo prebuild → gradle `assemblePreRelease`) and publishes the APK as a GitHub Release. The `preRelease` build type is signed with the template debug keystore, which is the same on every CI run, so each new APK installs over the previous one.

**Tech Stack:** Expo 57 / React Native 0.86, pnpm 11, Gradle, GitHub Actions, `softprops/action-gh-release@v2`.

**Spec:** `docs/superpowers/specs/2026-10-02-lnreader-listen-design.md` (§3)

## Global Constraints

- App name: `LNReader Listen`. Android package: `com.nofalamr.lnreaderlisten` (no suffix on the build type we ship).
- URL scheme: `lnreaderlisten` (must not be `lnreader`, which belongs to the official app).
- Do not edit translated strings in `src/i18n/languages/*` other than `en`.
- `pnpm run check` must pass before every commit (AGENTS.md).
- Upstream workflows (`build.yml`, `release.yml`, …) are left in place but disabled for the fork, so they don't spend Actions minutes or post to Discord.

---

### Task 1: App identity

**Files:**
- Modify: `app.json` (keys `expo.name`, `expo.slug`, `expo.scheme`, `expo.android.package`)
- Modify: `plugins/android/android-build-types.gradle` (the `preRelease` block)
- Modify: `src/navigators/Main.tsx:98`
- Modify: `package.json` (`dev:android` script app id)

**Interfaces:**
- Produces: the APK path `android/app/build/outputs/apk/preRelease/app-preRelease.apk`, application id `com.nofalamr.lnreaderlisten`.

- [ ] **Step 1: Edit `app.json`**

Set:
```json
"name": "LNReader Listen",
"slug": "LNReaderListen",
"scheme": "lnreaderlisten",
```
and under `expo.android`:
```json
"package": "com.nofalamr.lnreaderlisten",
```
Leave `expo.ios.bundleIdentifier` unchanged (iOS is not built).

- [ ] **Step 2: Edit the `preRelease` build type** in `plugins/android/android-build-types.gradle`

Replace:
```gradle
        preRelease {
            initWith release
            matchingFallbacks = ["release"]
            applicationIdSuffix ".preRelease"
            versionNameSuffix "-pre-release"
            signingConfig signingConfigs.debug
            resValue "string", "app_name", "LNReader Preview"
        }
```
with:
```gradle
        preRelease {
            initWith release
            matchingFallbacks = ["release"]
            versionNameSuffix "-listen"
            signingConfig signingConfigs.debug
            resValue "string", "app_name", "LNReader Listen"
        }
```

- [ ] **Step 3: Deep-link prefix** — in `src/navigators/Main.tsx` change `prefixes: ['lnreader://'],` to `prefixes: ['lnreaderlisten://'],`. Leave `CHAPTER_REFRESH_URL` in `sanitizeChapterText.ts` alone; the reader WebView intercepts it in-app and it never reaches Android.

- [ ] **Step 4: Dev script** — in `package.json`, change `--app-id com.rajarsheechatterjee.LNReader.debug` to `--app-id com.nofalamr.lnreaderlisten.debug`.

- [ ] **Step 5: Verify**

Run: `corepack enable && pnpm install --frozen-lockfile && pnpm run check && pnpm test`
Expected: all pass. If a test asserts the `lnreader://` prefix, update that assertion to `lnreaderlisten://`.

- [ ] **Step 6: Commit**

```bash
git add app.json plugins/android/android-build-types.gradle src/navigators/Main.tsx package.json
git commit -m "chore: rebrand fork as LNReader Listen with its own package id"
```

### Task 2: Release workflow

**Files:**
- Create: `.github/workflows/listen-release.yml`
- Modify: `.github/workflows/build.yml`, `release.yml`, `issue_moderator.yml` (add a fork guard)

**Interfaces:**
- Consumes: the Task 1 APK path.
- Produces: a GitHub Release tagged `listen-r<run_number>` with the asset `LNReader-Listen-r<run_number>.apk`.

- [ ] **Step 1: Create `.github/workflows/listen-release.yml`**

```yaml
name: Listen Release

on:
  push:
    branches: [master]
  workflow_dispatch:

concurrency:
  group: listen-release
  cancel-in-progress: true

permissions:
  contents: write

env:
  CI: 'true'
  EXPO_NO_TELEMETRY: '1'
  NODE_ENV: 'production'

jobs:
  apk:
    runs-on: ubuntu-24.04
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: false

      - uses: pnpm/action-setup@v6

      - uses: actions/setup-node@v7
        with:
          node-version: '22'
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml

      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '17'

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile --prefer-offline

      - name: Check
        run: pnpm run check && pnpm test

      - name: Configure Release Environment
        run: pnpm generate:env:release --build-type "GitHub Action" --node-env "production"

      - name: Generate Native Android Project
        run: pnpm exec expo prebuild --platform android --clean --no-install --non-interactive

      - uses: gradle/actions/setup-gradle@v6

      - name: Build APK
        working-directory: android
        run: |
          base_code="$(node --print "require('../app.json').expo.android.versionCode")"
          base_name="$(node --print "require('../app.json').expo.version")"
          mkdir -p app/build/intermediates/sourcemaps/react/preRelease
          ./gradlew :app:assemblePreRelease --build-cache --parallel \
            -PpreReleaseVersionCode="$((base_code + GITHUB_RUN_NUMBER))" \
            -PpreReleaseVersionName="${base_name}-listen.r${GITHUB_RUN_NUMBER}" \
            --stacktrace
          cp app/build/outputs/apk/preRelease/app-preRelease.apk \
            "../LNReader-Listen-r${GITHUB_RUN_NUMBER}.apk"

      - uses: softprops/action-gh-release@v2
        with:
          tag_name: listen-r${{ github.run_number }}
          name: LNReader Listen r${{ github.run_number }}
          body: |
            Install LNReader-Listen-r${{ github.run_number }}.apk. It installs next to the official LNReader.
            Commit: ${{ github.sha }}
          files: LNReader-Listen-r${{ github.run_number }}.apk
```

- [ ] **Step 2: Guard the upstream workflows.** In each of `build.yml`, `release.yml` and `issue_moderator.yml`, add `if: github.repository == 'LNReader/lnreader'` to every top-level job (for `build.yml`, the `check-preview` job; `build-android` already depends on it). Leave `lint.yml`, `testing.yml` and `types.yml` unchanged; they're useful checks.

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows
git commit -m "ci: publish LNReader Listen APK to GitHub Releases"
git push origin master
```

- [ ] **Step 4: Verify the run**

Run: `gh run watch -R Nofal-Amr/lnreader-listen $(gh run list -R Nofal-Amr/lnreader-listen -w "Listen Release" -L 1 --json databaseId -q '.[0].databaseId') --exit-status`
Expected: success. Then `gh release list -R Nofal-Amr/lnreader-listen` shows `LNReader Listen r1`. If it fails, read `gh run view --log-failed` and fix the cause; don't retry blindly.

- [ ] **Step 5: Device check (user)**

Install the APK on the Samsung phone. Expected: an app named "LNReader Listen" appears **alongside** the official LNReader, and Backup → Restore of an LNReader backup brings the library over.
