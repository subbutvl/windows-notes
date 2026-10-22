//! Writing files the quick tools make (converted images, icons, audio). The
//! bytes come as the raw request body so large files skip JSON encoding.

use tauri::ipc::{InvokeBody, Request};

type CmdResult<T> = Result<T, String>;

/// Writes the request body to the path in the `path` header (URI-encoded),
/// making any missing folders on the way. The path comes from a save or
/// folder dialog the user just answered.
#[tauri::command]
pub fn save_file(request: Request<'_>) -> CmdResult<()> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected file bytes".into());
    };
    let encoded = request.headers().get("path").and_then(|v| v.to_str().ok()).ok_or("missing file path")?;
    let path = std::path::PathBuf::from(decode(encoded)?);
    if !path.is_absolute() {
        return Err("expected a full file path".into());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("couldn't create {}: {e}", dir.display()))?;
    }
    std::fs::write(&path, bytes).map_err(|e| format!("couldn't write {}: {e}", path.display()))
}

/// Undoes encodeURIComponent.
fn decode(s: &str) -> CmdResult<String> {
    let mut out = Vec::with_capacity(s.len());
    let mut bytes = s.bytes();
    while let Some(b) = bytes.next() {
        if b == b'%' {
            let hex = [bytes.next().ok_or("bad path")?, bytes.next().ok_or("bad path")?];
            let hex = std::str::from_utf8(&hex).map_err(|_| "bad path")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "bad path")?);
        } else {
            out.push(b);
        }
    }
    String::from_utf8(out).map_err(|_| "bad path".into())
}
