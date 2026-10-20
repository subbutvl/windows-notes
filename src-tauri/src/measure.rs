//! The screen measure overlay: a transparent, borderless window over one
//! monitor. It exists only while measuring and is destroyed on close, so it
//! costs nothing the rest of the time.

use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "measure";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenInfo {
    /// The monitor's real pixels per inch from its EDID, if it reports one.
    pub raw_dpi: Option<u32>,
    /// Windows display scaling (1.25 = 125%).
    pub scale: f64,
}

/// Opens the overlay over the monitor the main window is on, or focuses it.
pub fn open(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return w.set_focus().map_err(|e| e.to_string());
    }
    let main = app.get_webview_window("main").ok_or("the main window is missing")?;
    let monitor = main
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| main.primary_monitor().ok().flatten())
        .ok_or("no monitor found")?;
    let (pos, size) = (*monitor.position(), *monitor.size());
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::default())
        .title("Measure")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()
        .map_err(|e| format!("couldn't open the measure overlay: {e}"))?;
    w.set_position(PhysicalPosition::new(pos.x, pos.y)).map_err(|e| e.to_string())?;
    w.set_size(PhysicalSize::new(size.width, size.height)).map_err(|e| e.to_string())?;
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())
}

pub fn close(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.destroy();
    }
}

pub fn screen_info(window: &WebviewWindow) -> ScreenInfo {
    let scale = window.scale_factor().unwrap_or(1.0);
    let center = match (window.outer_position(), window.outer_size()) {
        (Ok(p), Ok(s)) => (p.x + s.width as i32 / 2, p.y + s.height as i32 / 2),
        _ => (0, 0),
    };
    ScreenInfo { raw_dpi: raw_dpi(center.0, center.1), scale }
}

#[cfg(windows)]
fn raw_dpi(x: i32, y: i32) -> Option<u32> {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::Graphics::Gdi::{MonitorFromPoint, MONITOR_DEFAULTTONEAREST};
    use windows_sys::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_RAW_DPI};
    let (mut dx, mut dy) = (0u32, 0u32);
    // SAFETY: plain Win32 calls with valid out-pointers to locals.
    let ok = unsafe {
        let monitor = MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONEAREST);
        GetDpiForMonitor(monitor, MDT_RAW_DPI, &mut dx, &mut dy) == 0
    };
    // Projectors and some virtual displays report nonsense; ignore it.
    (ok && (50..=1000).contains(&dx)).then_some(dx)
}

#[cfg(not(windows))]
fn raw_dpi(_x: i32, _y: i32) -> Option<u32> {
    None
}
