mod fonts;
mod store;

use std::sync::Mutex;
use store::{Folder, Library, Note, NoteSummary, NoteUpdate, Store};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

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

#[tauri::command]
async fn list_system_fonts() -> Vec<String> {
    fonts::system_fonts()
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// The notification-area icon: left click brings the window back, right click
/// opens a small menu.
fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Windows Notes", true, None::<&str>)?;
    let new_note = MenuItem::with_id(app, "new-note", "New Note", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &new_note, &PredefinedMenuItem::separator(app)?, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Windows Notes")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "new-note" => {
                show_main(app);
                let _ = app.emit("tray-new-note", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
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
            create_tray(app)?;
            Ok(())
        })
        // Minimizing tucks the window into the notification area; closing still quits.
        .on_window_event(|window, event| {
            if let WindowEvent::Resized(_) = event {
                if window.is_minimized().unwrap_or(false) {
                    let _ = window.hide();
                }
            }
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
            delete_folder,
            list_system_fonts
        ])
        .run(tauri::generate_context!())
        .expect("error while running Windows Notes");
}
