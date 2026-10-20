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

| Keys | Action |
| --- | --- |
| Ctrl+N | New note |
| Ctrl+F | Search |
| Up / Down | Move through the note list |
| Delete | Move the selected note to Recently Deleted |

## Layout

- `src/` React UI: `components/` (Sidebar, NoteList, Editor), `lib/` (store, api, theme, dates)
- `src-tauri/src/store.rs` note storage: atomic writes, index rebuild, Recently Deleted
- `src-tauri/src/lib.rs` Tauri commands
