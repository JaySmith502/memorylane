---
name: release
description: Run the full release workflow for MemoryLane — bump version, update release notes, commit, tag, build, push, and create a GitHub release. Use when the user asks to release, ship, publish, bump version, or cut a new version.
---

# Release Workflow

## Prerequisites

- Working tree is clean (`git status` shows nothing to commit)
- On the `main` branch, up to date with origin
- `gh` CLI is authenticated (`gh auth status`)

## Steps

### 1. Determine the new version

Ask the user if not provided. Follow semver: `MAJOR.MINOR.PATCH`.

### 2. Review changes since the last tag

```bash
git log --oneline $(git describe --tags --abbrev=0)..HEAD
git diff --stat $(git describe --tags --abbrev=0)..HEAD
```

Summarize the key changes — this drives the release notes.

### 3. Bump version in `package.json`

Update the `"version"` field to the new version.

### 4. Update `RELEASE_NOTES.md`

Follow the existing format in the file. Key sections to update:

- **Title**: `# MemoryLane vX.Y.Z`
- **What's Changed**: Summarize the commits into user-facing bullet points. Reference GitHub issues where applicable (e.g., `closes #4`).
- **Features**: Update the feature list if new capabilities were added.
- **Known Issues & Limitations**: Remove any issues that have been resolved. Add new ones if applicable.
- **Installation**: Keep the curl one-liner and permission instructions up to date.
- **Full Changelog**: Update the tag reference in the URL.

### 5. Update `README.md` if needed

Check the "Coming Soon" and "Limitations" sections. If a released feature is listed there, move or remove it.

### 6. Format and lint

```bash
npm run format
npm run lint
```

### 7. Commit and tag

```bash
git add -A
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
```

### 8. Build the app

```bash
npm run make:mac
```

The output ZIP will be in `dist/`. Verify it exists:

```bash
ls dist/MemoryLane-X.Y.Z-arm64-mac.zip
```

Note: if `APPLE_ID` and `APPLE_APP_PASSWORD` env vars are not set, notarization is
skipped automatically (`build/notarize.js` handles this). The app is still code-signed.

### 9. Push

```bash
git push origin main --tags
```

### 10. Create GitHub release

```bash
gh release create vX.Y.Z dist/MemoryLane-X.Y.Z-arm64-mac.zip \
  --title "vX.Y.Z" \
  --notes-file RELEASE_NOTES.md
```

## Checklist

Before finishing, verify:

- [ ] `package.json` version matches the new tag
- [ ] `RELEASE_NOTES.md` title, download filename, and changelog link all reference the new version
- [ ] Resolved known issues are removed from release notes
- [ ] `README.md` "Coming Soon" doesn't list shipped features
- [ ] `npm run format` and `npm run lint` pass
- [ ] ZIP exists in `dist/`
- [ ] Tag is pushed to origin
- [ ] GitHub release is published with the ZIP attached
