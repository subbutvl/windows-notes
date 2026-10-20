# Windows Notes

An Apple Notes-style notes app for Windows, built with Tauri 2, React and TipTap.

Notes are stored as one JSON file per note in `%APPDATA%\WindowsNotes\`.

## Run it

Prerequisites: Node.js 20+, Rust (stable, MSVC toolchain) and the WebView2 runtime (built into Windows 10/11).

```powershell
npm install
npm run tauri dev      # development window with hot reload
npm run tauri build    # installer in src-tauri\target\release\bundle\
```

`npm run dev` alone opens the UI in a browser with sample data, without the native shell.

Rust storage tests: `cd src-tauri; cargo test`.

## Shortcuts

Press **Ctrl+/** in the app for the full list. The most used:

| Keys | Action |
| --- | --- |
| Ctrl+N / Ctrl+Shift+N | New note / new folder |
| Ctrl+F | Search |
| Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+S | Bold, italic, underline, strikethrough |
| Ctrl+] / Ctrl+[ | Bigger / smaller text |
| Ctrl+L, Ctrl+E, Ctrl+R, Ctrl+J | Align left, center, right, justify |
| Ctrl+Shift+8 / 7 / L | Bulleted list / numbered list / checklist |
| Ctrl+Alt+1 / 2 / 3 / 0 | Title / heading / subheading / body |
| Ctrl+K | Link (Ctrl+click a link to open it) |
| Ctrl+Alt+T | Insert table |
| Ctrl+Shift+P | Pin note |
| Ctrl+Shift+K | Open or close the last quick tool |

Right-click anywhere for the app's own menus: formatting and tables in a note, pin/move/delete on a note in the list, new note/subfolder/rename/delete on a folder. Notes can be dragged onto a folder.

## Fonts, quick tools and tray

- **Fonts:** the toolbar's font menu lists a few Google Fonts and every font installed on this PC. A Google Font downloads only when a note uses it; without internet the text falls back to a system font.
- **Quick tools** (Quick Tools in the sidebar, or Ctrl+Shift+K for the last one used): calculator, color codes with tints and shades, clipboard history (last 50 text copies), password generator, currency converter (INR, USD, EUR, SGD on ECB reference rates) and screen snip (opens Windows' own snipping overlay; the image goes to the Windows clipboard). One tool shows at a time and only that one is loaded. Everything stays in memory: nothing is saved with your notes, in backups or in JSON exports, nothing is read back later, and it is gone when the app quits. New tools are added in `src/tools/registry.tsx`.
- **Tray:** minimizing hides the window to the notification area. Click the tray icon to bring it back, or right-click it for New Note and Quit. Closing the window still quits.

## Search, backup and export

- **Search** (Ctrl+F) looks through every note's title, text and #tags as you type. All words must match, in any order; matches are highlighted in the list.
- **Backup & Export** is at the bottom of the sidebar.
  - **JSON file:** Export writes all folders and notes, including Recently Deleted, to one `.json` file. Import merges a file in: notes you don't have are added, notes that are newer in the file replace older copies, and nothing is ever deleted.
  - **Google Drive:** Back Up Now uploads the same JSON to your own Drive and keeps the newest 10 backups. Restore merges a backup in the same way as Import. Backups only run when you press the button.

### Setting up Google Drive (once)

Windows Notes signs in with your own Google OAuth client, so no one else's server is involved.

1. Open [Google Cloud Console](https://console.cloud.google.com/), create a project (any name) and enable the **Google Drive API** for it.
2. Under **Google Auth Platform > Branding**, fill in the app name and your email. Under **Audience**, add your Google account as a test user.
3. Under **Data Access**, add the scope `.../auth/drive.file` (the app can only see files it creates).
4. Under **Clients**, create an OAuth client of type **Desktop app**, and copy its client ID and client secret.
5. In Windows Notes, open Backup & Export, paste both, press Save, then Connect Google Drive and sign in in your browser.

The sign-in token is kept in Windows Credential Manager. The client ID is saved in `google-client.json` in the data folder.

## Speed test with many notes

```powershell
node scripts\seed-notes.mjs $env:TEMP\wn-perf 1000   # 1,000 sample notes in a scratch folder
$env:WINDOWS_NOTES_DATA_DIR = "$env:TEMP\wn-perf"
.\src-tauri\target\release\windows-notes.exe        # after npm run tauri build
cd src-tauri; cargo test --release -- --ignored --nocapture   # search timing over 1,000 notes
```

`WINDOWS_NOTES_DATA_DIR` points the app at another data folder, so test notes never mix with your real ones.

## Layout

- `src/` React UI: `components/` (Sidebar, NoteList, Editor, ContextMenu), `editor/` (TipTap extensions, toolbar, commands), `lib/` (store, api, menus, shortcuts, theme), `tools/` (quick tools)
- `src-tauri/src/store.rs` note storage: atomic writes, index rebuild, Recently Deleted, search, export and import
- `src-tauri/src/drive.rs` Google Drive sign-in, backup and restore
- `src-tauri/src/lib.rs` Tauri commands and the tray icon
- `src-tauri/src/fonts.rs` installed font families, read from the registry
