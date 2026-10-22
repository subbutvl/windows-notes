//! Exporting one note as a PDF or HTML file.

use std::path::PathBuf;

type CmdResult<T> = Result<T, String>;

/// `path` with the extension the export writes, or an error naming it.
pub fn with_extension(path: &str, ext: &str) -> CmdResult<PathBuf> {
    let p = PathBuf::from(path);
    match p.extension().and_then(|e| e.to_str()) {
        Some(e) if e.eq_ignore_ascii_case(ext) => Ok(p),
        _ => Err(format!("choose a .{ext} file")),
    }
}

pub fn write_html(path: &str, html: &str) -> CmdResult<()> {
    let path = with_extension(path, "html")?;
    std::fs::write(&path, html).map_err(|e| format!("couldn't write {}: {e}", path.display()))
}

/// Prints the window's page to a PDF with WebView2's own PDF printer. The page's
/// print styles show only the open note, so the PDF holds just that note.
#[cfg(windows)]
pub async fn write_pdf(window: tauri::WebviewWindow, path: &str) -> CmdResult<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7};
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let path = with_extension(path, "pdf")?;
    let (tx, rx) = std::sync::mpsc::channel::<CmdResult<()>>();
    let target = HSTRING::from(path.as_os_str());
    window
        .with_webview(move |webview| {
            let start = || -> windows::core::Result<()> {
                // SAFETY: WebView2 COM calls, made on the window's own thread as WebView2 requires.
                unsafe {
                    let core: ICoreWebView2_7 = webview.controller().CoreWebView2()?.cast()?;
                    let settings = webview.environment().cast::<ICoreWebView2Environment6>()?.CreatePrintSettings()?;
                    settings.SetShouldPrintBackgrounds(true)?;
                    settings.SetShouldPrintHeaderAndFooter(false)?;
                    let done = tx.clone();
                    let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                        let _ = done.send(match result {
                            Ok(()) if ok => Ok(()),
                            Ok(()) => Err("the PDF couldn't be written".into()),
                            Err(e) => Err(e.message().to_string()),
                        });
                        Ok(())
                    }));
                    core.PrintToPdf(&target, &settings, &handler)
                }
            };
            if let Err(e) = start() {
                let _ = tx.send(Err(e.message().to_string()));
            }
        })
        .map_err(|e| e.to_string())?;
    let result = tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(std::time::Duration::from_secs(60)))
        .await
        .map_err(|e| e.to_string())?;
    match result {
        Ok(r) => r.map_err(|e| format!("couldn't write {}: {e}", path.display())),
        Err(_) => Err("the PDF took too long to write".into()),
    }
}

#[cfg(not(windows))]
pub async fn write_pdf(_window: tauri::WebviewWindow, _path: &str) -> CmdResult<()> {
    Err("PDF export needs Windows".into())
}
