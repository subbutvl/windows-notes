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

Right-click anywhere for the app's own menus: formatting and tables in a note, pin/move/delete on a note in the list, new note/subfolder/rename/delete on a folder. Notes can be dragged onto a folder.

## Layout

- `src/` React UI: `components/` (Sidebar, NoteList, Editor, ContextMenu), `editor/` (TipTap extensions, toolbar, commands), `lib/` (store, api, menus, shortcuts, theme)
- `src-tauri/src/store.rs` note storage: atomic writes, index rebuild, Recently Deleted
- `src-tauri/src/lib.rs` Tauri commands
