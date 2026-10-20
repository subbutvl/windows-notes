mod store;

use std::sync::Mutex;
use store::{Folder, Library, Note, NoteSummary, NoteUpdate, Store};
use tauri::{Manager, State};

struct AppState(Mutex<Store>);

type CmdResult<T> = Result<T, String>;

fn with_store<T>(state: &State<AppState>, f: impl FnOnce(&mut Store) -> CmdResult<T>) -> CmdResult<T> {
    let mut store = state.0.lock().map_err(|_| "storage is unavailable".to_string())?;
    f(&mut store)
}

#[tauri::command]
fn get_library(state: State<AppState>) -> CmdResult<Library> {
    with_store(&state, |s| Ok(s.library()))
}

#[tauri::command]
fn load_note(state: State<AppState>, id: String) -> CmdResult<Note> {
    with_store(&state, |s| s.load_note(&id))
}

#[tauri::command]
fn create_note(state: State<AppState>, folder_id: String) -> CmdResult<Note> {
    with_store(&state, |s| s.create_note(&folder_id))
}

#[tauri::command]
fn save_note(state: State<AppState>, update: NoteUpdate) -> CmdResult<NoteSummary> {
    with_store(&state, |s| s.save_note(update))
}

#[tauri::command]
fn set_pinned(state: State<AppState>, id: String, pinned: bool) -> CmdResult<NoteSummary> {
    with_store(&state, |s| s.set_pinned(&id, pinned))
}

#[tauri::command]
fn move_note(state: State<AppState>, id: String, folder_id: String) -> CmdResult<NoteSummary> {
    with_store(&state, |s| s.move_note(&id, &folder_id))
}

#[tauri::command]
fn delete_note(state: State<AppState>, id: String) -> CmdResult<NoteSummary> {
    with_store(&state, |s| s.delete_note(&id))
}

#[tauri::command]
fn restore_note(state: State<AppState>, id: String) -> CmdResult<NoteSummary> {
    with_store(&state, |s| s.restore_note(&id))
}

#[tauri::command]
fn purge_note(state: State<AppState>, id: String) -> CmdResult<()> {
    with_store(&state, |s| s.purge_note(&id))
}

#[tauri::command]
fn create_folder(state: State<AppState>, name: String, parent_id: Option<String>) -> CmdResult<Folder> {
    with_store(&state, |s| s.create_folder(&name, parent_id))
}

#[tauri::command]
fn rename_folder(state: State<AppState>, id: String, name: String) -> CmdResult<Folder> {
    with_store(&state, |s| s.rename_folder(&id, &name))
}

#[tauri::command]
fn delete_folder(state: State<AppState>, id: String) -> CmdResult<Library> {
    with_store(&state, |s| s.delete_folder(&id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Roaming AppData, so notes live in %APPDATA%\WindowsNotes.
            let root = app.path().data_dir()?.join("WindowsNotes");
            let store = Store::open(root)?;
            app.manage(AppState(Mutex::new(store)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_library,
            load_note,
            create_note,
            save_note,
            set_pinned,
            move_note,
            delete_note,
            restore_note,
            purge_note,
            create_folder,
            rename_folder,
            delete_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Windows Notes");
}
