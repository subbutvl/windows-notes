mod drive;
mod export;
mod fonts;
mod measure;
mod store;

use drive::{BackupFile, Drive, DriveStatus};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use store::{Folder, ImportReport, Library, Note, NoteSummary, NoteUpdate, SearchHit, Store};
use tauri_plugin_opener::OpenerExt;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

struct AppState(Arc<Mutex<Store>>);
/// Separate from the store so a slow upload never blocks typing.
struct DriveState(Arc<Mutex<Drive>>);

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
fn search_notes(state: State<AppState>, query: String) -> CmdResult<Vec<SearchHit>> {
    with_store(&state, |s| Ok(s.search(&query)))
}

const MAX_IMPORT_BYTES: u64 = 512 * 1024 * 1024;

fn json_path(path: &str) -> CmdResult<PathBuf> {
    let p = PathBuf::from(path);
    match p.extension().and_then(|e| e.to_str()) {
        Some(e) if e.eq_ignore_ascii_case("json") => Ok(p),
        _ => Err("choose a .json file".into()),
    }
}

#[tauri::command]
fn export_library(state: State<AppState>, path: String) -> CmdResult<()> {
    let path = json_path(&path)?;
    let bytes = with_store(&state, |s| s.export())?;
    std::fs::write(&path, bytes).map_err(|e| format!("couldn't write {}: {e}", path.display()))
}

#[tauri::command]
fn import_library(state: State<AppState>, path: String) -> CmdResult<ImportReport> {
    let path = json_path(&path)?;
    let size = std::fs::metadata(&path).map_err(|e| format!("couldn't open {}: {e}", path.display()))?.len();
    if size > MAX_IMPORT_BYTES {
        return Err("that file is too large to be a Windows Notes export".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("couldn't read {}: {e}", path.display()))?;
    with_store(&state, |s| s.import(&bytes))
}

/// Runs slow network work off the UI threads.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> CmdResult<T> + Send + 'static) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

fn lock<T>(m: &Mutex<T>) -> CmdResult<std::sync::MutexGuard<'_, T>> {
    m.lock().map_err(|_| "busy, please try again".to_string())
}

// Every Drive command is async: sign-in can wait minutes for the browser and
// must never hold up the window.
#[tauri::command]
async fn drive_status(drive: State<'_, DriveState>) -> CmdResult<DriveStatus> {
    let drive = drive.0.clone();
    blocking(move || Ok(lock(&drive)?.status())).await
}

#[tauri::command]
async fn drive_set_client(drive: State<'_, DriveState>, client_id: String, client_secret: String) -> CmdResult<DriveStatus> {
    let drive = drive.0.clone();
    blocking(move || {
        let d = lock(&drive)?;
        d.set_client(&client_id, &client_secret)?;
        Ok(d.status())
    })
    .await
}

#[tauri::command]
async fn drive_connect(app: AppHandle, drive: State<'_, DriveState>) -> CmdResult<DriveStatus> {
    let drive = drive.0.clone();
    blocking(move || {
        lock(&drive)?.connect(|url| app.opener().open_url(url, None::<&str>).map_err(|e| format!("couldn't open the browser: {e}")))
    })
    .await
}

#[tauri::command]
async fn drive_disconnect(drive: State<'_, DriveState>) -> CmdResult<DriveStatus> {
    let drive = drive.0.clone();
    blocking(move || lock(&drive)?.disconnect()).await
}

#[tauri::command]
async fn drive_list(drive: State<'_, DriveState>) -> CmdResult<Vec<BackupFile>> {
    let drive = drive.0.clone();
    blocking(move || lock(&drive)?.list_backups()).await
}

#[tauri::command]
async fn drive_backup(state: State<'_, AppState>, drive: State<'_, DriveState>) -> CmdResult<BackupFile> {
    let (store, drive) = (state.0.clone(), drive.0.clone());
    blocking(move || {
        let export = lock(&store)?.export()?;
        let stamp = chrono::Local::now().format("%Y-%m-%d %H.%M").to_string();
        lock(&drive)?.backup(export, &stamp)
    })
    .await
}

#[tauri::command]
async fn drive_restore(state: State<'_, AppState>, drive: State<'_, DriveState>, file_id: String) -> CmdResult<ImportReport> {
    let (store, drive) = (state.0.clone(), drive.0.clone());
    blocking(move || {
        let bytes = lock(&drive)?.download(&file_id)?;
        lock(&store)?.import(&bytes)
    })
    .await
}

#[tauri::command]
async fn list_system_fonts() -> Vec<String> {
    fonts::system_fonts()
}

/// Opens Windows' own snipping overlay; the image goes to the clipboard and
/// never passes through this app.
#[tauri::command]
fn start_screen_snip() -> CmdResult<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg("ms-screenclip:")
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("couldn't start the snipping tool: {e}"))
    }
    #[cfg(not(windows))]
    Err("screen snip is only available on Windows".into())
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

// Async: on Windows, making a window inside a synchronous command can deadlock.
#[tauri::command]
async fn open_measure(app: AppHandle) -> CmdResult<()> {
    measure::open(&app)
}

#[tauri::command]
fn close_measure(app: AppHandle) {
    measure::close(&app);
}

#[tauri::command]
fn screen_info(window: tauri::WebviewWindow) -> measure::ScreenInfo {
    measure::screen_info(&window)
}

#[tauri::command]
async fn export_note_pdf(window: tauri::WebviewWindow, path: String) -> CmdResult<()> {
    export::write_pdf(window, &path).await
}

#[tauri::command]
fn export_note_html(path: String, html: String) -> CmdResult<()> {
    export::write_html(&path, &html)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // Opening the app again (shortcut, .exe, Start menu) brings back the running
    // window, even from the notification area, instead of starting a second copy.
    // Speed tests with WINDOWS_NOTES_DATA_DIR run beside the real app, so they skip it.
    if std::env::var_os("WINDOWS_NOTES_DATA_DIR").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)));
    }
    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Roaming AppData, so notes live in %APPDATA%\WindowsNotes.
            // WINDOWS_NOTES_DATA_DIR points it elsewhere (used for speed tests).
            let root = match std::env::var_os("WINDOWS_NOTES_DATA_DIR") {
                Some(dir) => PathBuf::from(dir),
                None => app.path().data_dir()?.join("WindowsNotes"),
            };
            let store = Store::open(root)?;
            app.manage(DriveState(Arc::new(Mutex::new(Drive::new(store.root())))));
            app.manage(AppState(Arc::new(Mutex::new(store))));
            create_tray(app)?;
            Ok(())
        })
        // Minimizing tucks the window into the notification area; closing still quits.
        .on_window_event(|window, event| match event {
            WindowEvent::Resized(_) if window.label() == "main" => {
                if window.is_minimized().unwrap_or(false) {
                    let _ = window.hide();
                }
            }
            // The measure overlay never outlives the main window.
            WindowEvent::Destroyed if window.label() == "main" => measure::close(window.app_handle()),
            _ => {}
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
            list_system_fonts,
            start_screen_snip,
            open_measure,
            close_measure,
            screen_info,
            search_notes,
            export_library,
            export_note_pdf,
            export_note_html,
            import_library,
            drive_status,
            drive_set_client,
            drive_connect,
            drive_disconnect,
            drive_list,
            drive_backup,
            drive_restore
        ])
        .run(tauri::generate_context!())
        .expect("error while running Windows Notes");
}
