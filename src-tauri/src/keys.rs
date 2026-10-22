//! Alt+letter shortcuts. WebView2 treats Alt combinations as system keys and
//! they never reach the page, so they are caught here and sent to the UI as an
//! "alt-key" event carrying the letter.

#[cfg(windows)]
pub fn watch_alt_letters(window: &tauri::WebviewWindow) {
    use tauri::Emitter;
    use webview2_com::AcceleratorKeyPressedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN, COREWEBVIEW2_PHYSICAL_KEY_STATUS};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CONTROL, VK_SHIFT};

    let target = window.clone();
    let _ = window.with_webview(move |webview| {
        let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            // SAFETY: plain getters on the event arguments, on the window's own thread.
            unsafe {
                let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
                let mut key = 0u32;
                let mut status = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
                args.KeyEventKind(&mut kind)?;
                args.VirtualKey(&mut key)?;
                args.PhysicalKeyStatus(&mut status)?;
                // Ctrl+Alt is AltGr on many keyboards (₹, €), so it stays a typing key.
                let ctrl = GetKeyState(VK_CONTROL as i32) < 0;
                let shift = GetKeyState(VK_SHIFT as i32) < 0;
                let letter = (b'A' as u32..=b'Z' as u32).contains(&key);
                if kind == COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN && letter && !ctrl && !shift {
                    args.SetHandled(true)?;
                    if !status.WasKeyDown.as_bool() {
                        let _ = target.emit("alt-key", char::from(key as u8).to_string());
                    }
                }
            }
            Ok(())
        }));
        let mut token = 0i64;
        // SAFETY: registers the handler on the window's own WebView2 controller.
        unsafe {
            let _ = webview.controller().add_AcceleratorKeyPressed(&handler, &mut token);
        }
    });
}

#[cfg(not(windows))]
pub fn watch_alt_letters(_window: &tauri::WebviewWindow) {}
