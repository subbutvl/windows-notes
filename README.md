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

## Layout

- `src/` React UI: `components/` (Sidebar, NoteList, Editor, ContextMenu), `editor/` (TipTap extensions, toolbar, commands), `lib/` (store, api, menus, shortcuts, theme), `tools/` (quick tools)
- `src-tauri/src/store.rs` note storage: atomic writes, index rebuild, Recently Deleted
- `src-tauri/src/lib.rs` Tauri commands and the tray icon
- `src-tauri/src/fonts.rs` installed font families, read from the registry
