# Graph Maker – desktop build

Wraps the Graph Maker web app in Electron. Works offline (SheetJS is bundled at build time).

## Easiest: build in the cloud (no installs)
1. Create a new GitHub repository and upload everything in this folder (keep the `.github` folder).
2. Open the repo's **Actions** tab → **Build desktop apps** → **Run workflow**.
3. When it finishes (about 5 minutes), download the artifacts:
   - `graph-maker-windows-latest` → installer `.exe` and a portable `.exe`
   - `graph-maker-macos-latest` → `.dmg` (Apple Silicon and Intel)

## Or build on your own machine
Install Node.js 20+, then in this folder:
    npm install
    npm run build:win     (on Windows)
    npm run build:mac     (on a Mac)
Output goes to `dist/`. Test without packaging: `npm start`.

## Opening the apps
- Windows may show "Windows protected your PC" (the app is not code-signed): More info → Run anyway.
- macOS: the app is not notarised. Right-click the app → Open → Open (first launch only).
  Signing/notarising needs paid developer accounts (Apple ~US$99/yr; Windows certificate extra).

## Put the web app at a short address
Name the repository **graphmaker**, then in Settings → Pages set Source to "GitHub Actions".
The workflow "Publish web app" deploys it to `https://<your-github-username>.github.io/graphmaker/`.


## Quick path for mbewesm-png
1. Create the repo **graphmaker** at https://github.com/mbewesm-png and upload this whole folder (keep `.github`).
2. Settings → Pages → Source: **GitHub Actions**. The web app goes live at **https://mbewesm-png.github.io/graphmaker/** (works in any browser, including on a MacBook).
3. Actions → "Build desktop apps" → Run workflow. Download the Windows `.exe` and the Mac `.dmg` from the run's Artifacts.
   - Apple Silicon MacBooks (M-series, incl. MacBook Neo): use the **arm64** `.dmg`. Intel Macs: the x64 `.dmg`.
   - Unsigned app: first launch, right-click → Open.
4. For a permanent download page, push a tag (`git tag v1.0.0 && git push --tags`); the installers are attached to a GitHub Release.
