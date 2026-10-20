//! Manual backup to the user's own Google Drive.
//!
//! Sign-in uses Google's desktop-app flow: the browser opens Google's page,
//! Google redirects to a one-off listener on 127.0.0.1, and the app swaps the
//! code for tokens (with PKCE). The app asks only for the `drive.file` scope,
//! so it can see the backup files it created and nothing else in Drive.
//!
//! The refresh token is kept in Windows Credential Manager, not in a file.
//! The OAuth client (made by the user in Google Cloud) is in
//! `google-client.json` in the data folder, and the account e-mail and last
//! backup time in `google.json`.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

type Result<T> = std::result::Result<T, String>;

const SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const KEYRING_SERVICE: &str = "Windows Notes";
const KEYRING_USER: &str = "google-drive";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(180);
/// Older backups beyond this many are deleted after each new one.
const KEEP_BACKUPS: usize = 10;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientConfig {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct State {
    email: Option<String>,
    last_backup_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveStatus {
    pub configured: bool,
    pub connected: bool,
    pub email: Option<String>,
    pub last_backup_at: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub id: String,
    pub name: String,
    pub modified_time: String,
    #[serde(default)]
    pub size: Option<String>,
}

/// Lives in the Tauri state; holds a short-lived access token in memory only.
pub struct Drive {
    root: PathBuf,
    access: Option<(String, Instant)>,
}

fn err<E: std::fmt::Display>(context: &'static str) -> impl Fn(E) -> String {
    move |e| format!("{context}: {e}")
}

/// Turns a ureq error into something a person can read.
fn http_err(context: &'static str) -> impl Fn(ureq::Error) -> String {
    move |e| match e {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            let detail = serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| v.pointer("/error/message").or_else(|| v.get("error_description")).or_else(|| v.get("error")).and_then(Value::as_str).map(str::to_owned))
                .unwrap_or(body);
            format!("{context} (HTTP {code}): {detail}")
        }
        ureq::Error::Transport(t) => format!("{context}: can't reach Google ({t})"),
    }
}

fn keyring() -> Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(err("open Credential Manager"))
}

fn random_token() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

fn pct(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then(|| {
            let mut out = Vec::new();
            let bytes = v.as_bytes();
            let mut i = 0;
            while i < bytes.len() {
                match bytes[i] {
                    b'%' if i + 2 < bytes.len() => {
                        let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok());
                        if let Some(b) = hex {
                            out.push(b);
                            i += 3;
                            continue;
                        }
                        out.push(b'%');
                    }
                    b'+' => out.push(b' '),
                    b => out.push(b),
                }
                i += 1;
            }
            String::from_utf8_lossy(&out).into_owned()
        })
    })
}

impl Drive {
    pub fn new(root: &Path) -> Self {
        Drive { root: root.to_owned(), access: None }
    }

    fn client_path(&self) -> PathBuf {
        self.root.join("google-client.json")
    }

    fn state_path(&self) -> PathBuf {
        self.root.join("google.json")
    }

    fn client(&self) -> Result<ClientConfig> {
        let bytes = fs::read(self.client_path()).map_err(|_| "Google Drive isn't set up yet".to_string())?;
        serde_json::from_slice(&bytes).map_err(err("read google-client.json"))
    }

    fn state(&self) -> State {
        fs::read(self.state_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    fn save_state(&self, state: &State) -> Result<()> {
        fs::write(self.state_path(), serde_json::to_vec(state).map_err(err("serialize"))?).map_err(err("save Google Drive status"))
    }

    pub fn status(&self) -> DriveStatus {
        let state = self.state();
        let connected = keyring().and_then(|k| k.get_password().map_err(|e| e.to_string())).is_ok();
        DriveStatus { configured: self.client().is_ok(), connected, email: state.email, last_backup_at: state.last_backup_at }
    }

    /// Saves the OAuth client the user created in Google Cloud. Accepts the
    /// downloaded client JSON ({"installed": {...}}) or the two values.
    pub fn set_client(&self, client_id: &str, client_secret: &str) -> Result<()> {
        let (id, secret) = (client_id.trim(), client_secret.trim());
        if !id.ends_with(".apps.googleusercontent.com") {
            return Err("that doesn't look like a Google client ID (it ends in .apps.googleusercontent.com)".into());
        }
        if secret.is_empty() {
            return Err("the client secret is missing".into());
        }
        let cfg = ClientConfig { client_id: id.into(), client_secret: secret.into() };
        fs::write(self.client_path(), serde_json::to_vec_pretty(&cfg).map_err(err("serialize"))?).map_err(err("save Google client"))
    }

    /// Opens the browser for sign-in and waits for Google to send the user back.
    pub fn connect(&mut self, open_browser: impl FnOnce(&str) -> Result<()>) -> Result<DriveStatus> {
        let client = self.client()?;
        let listener = TcpListener::bind("127.0.0.1:0").map_err(err("start sign-in listener"))?;
        let redirect = format!("http://127.0.0.1:{}", listener.local_addr().map_err(err("sign-in listener"))?.port());
        let verifier = random_token();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let state = random_token();
        let url = format!(
            "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={challenge}&code_challenge_method=S256&state={state}&access_type=offline&prompt=consent",
            pct(&client.client_id),
            pct(&redirect),
            pct(SCOPE),
        );
        open_browser(&url)?;

        let code = wait_for_code(&listener, &state)?;
        let token: Value = ureq::post(TOKEN_URL)
            .send_form(&[
                ("client_id", client.client_id.as_str()),
                ("client_secret", client.client_secret.as_str()),
                ("code", code.as_str()),
                ("code_verifier", verifier.as_str()),
                ("grant_type", "authorization_code"),
                ("redirect_uri", redirect.as_str()),
            ])
            .map_err(http_err("finish sign-in"))?
            .into_json()
            .map_err(err("read sign-in reply"))?;
        let refresh = token.get("refresh_token").and_then(Value::as_str).ok_or("Google didn't return a refresh token")?;
        let access = token.get("access_token").and_then(Value::as_str).ok_or("Google didn't return an access token")?;
        let expires = token.get("expires_in").and_then(Value::as_u64).unwrap_or(3600);
        keyring()?.set_password(refresh).map_err(err("save sign-in to Credential Manager"))?;
        self.access = Some((access.to_owned(), Instant::now() + Duration::from_secs(expires.saturating_sub(60))));

        let about: Value = ureq::get("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)")
            .set("Authorization", &format!("Bearer {access}"))
            .call()
            .map_err(http_err("read account"))?
            .into_json()
            .map_err(err("read account"))?;
        let mut st = self.state();
        st.email = about.pointer("/user/emailAddress").and_then(Value::as_str).map(str::to_owned);
        self.save_state(&st)?;
        Ok(self.status())
    }

    pub fn disconnect(&mut self) -> Result<DriveStatus> {
        if let Ok(entry) = keyring() {
            if let Ok(refresh) = entry.get_password() {
                // Best effort: tell Google to forget the grant too.
                let _ = ureq::post("https://oauth2.googleapis.com/revoke").send_form(&[("token", refresh.as_str())]);
            }
            let _ = entry.delete_credential();
        }
        self.access = None;
        self.save_state(&State::default())?;
        Ok(self.status())
    }

    fn access_token(&mut self) -> Result<String> {
        if let Some((token, until)) = &self.access {
            if Instant::now() < *until {
                return Ok(token.clone());
            }
        }
        let client = self.client()?;
        let refresh = keyring()?.get_password().map_err(|_| "not signed in to Google Drive".to_string())?;
        let token: Value = ureq::post(TOKEN_URL)
            .send_form(&[
                ("client_id", client.client_id.as_str()),
                ("client_secret", client.client_secret.as_str()),
                ("refresh_token", refresh.as_str()),
                ("grant_type", "refresh_token"),
            ])
            .map_err(http_err("refresh Google sign-in"))?
            .into_json()
            .map_err(err("read Google reply"))?;
        let access = token.get("access_token").and_then(Value::as_str).ok_or("Google sign-in expired; connect again")?.to_owned();
        let expires = token.get("expires_in").and_then(Value::as_u64).unwrap_or(3600);
        self.access = Some((access.clone(), Instant::now() + Duration::from_secs(expires.saturating_sub(60))));
        Ok(access)
    }

    /// The backups this app made, newest first.
    pub fn list_backups(&mut self) -> Result<Vec<BackupFile>> {
        let token = self.access_token()?;
        let q = pct("appProperties has { key='windowsNotesBackup' and value='1' } and trashed=false");
        let url = format!("https://www.googleapis.com/drive/v3/files?q={q}&orderBy=modifiedTime%20desc&pageSize=50&fields=files(id,name,modifiedTime,size)");
        let body: Value = ureq::get(&url)
            .set("Authorization", &format!("Bearer {token}"))
            .call()
            .map_err(http_err("list backups"))?
            .into_json()
            .map_err(err("read backup list"))?;
        serde_json::from_value(body.get("files").cloned().unwrap_or(json!([]))).map_err(err("read backup list"))
    }

    /// Uploads one export file, then trims old backups.
    pub fn backup(&mut self, export: Vec<u8>, stamp: &str) -> Result<BackupFile> {
        let token = self.access_token()?;
        let boundary = format!("wn{}", uuid::Uuid::new_v4().simple());
        let meta = json!({
            "name": format!("Windows Notes backup {stamp}.json"),
            "mimeType": "application/json",
            "appProperties": { "windowsNotesBackup": "1" },
        });
        let mut body = Vec::with_capacity(export.len() + 512);
        write!(body, "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n").map_err(err("build upload"))?;
        body.extend_from_slice(&export);
        write!(body, "\r\n--{boundary}--\r\n").map_err(err("build upload"))?;

        let file: BackupFile = ureq::post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size")
            .set("Authorization", &format!("Bearer {token}"))
            .set("Content-Type", &format!("multipart/related; boundary={boundary}"))
            .send_bytes(&body)
            .map_err(http_err("upload backup"))?
            .into_json()
            .map_err(err("read upload reply"))?;

        let mut st = self.state();
        st.last_backup_at = Some(file.modified_time.clone());
        self.save_state(&st)?;

        if let Ok(all) = self.list_backups() {
            for old in all.iter().skip(KEEP_BACKUPS) {
                let _ = ureq::delete(&format!("https://www.googleapis.com/drive/v3/files/{}", pct(&old.id)))
                    .set("Authorization", &format!("Bearer {token}"))
                    .call();
            }
        }
        Ok(file)
    }

    pub fn download(&mut self, file_id: &str) -> Result<Vec<u8>> {
        let token = self.access_token()?;
        let resp = ureq::get(&format!("https://www.googleapis.com/drive/v3/files/{}?alt=media", pct(file_id)))
            .set("Authorization", &format!("Bearer {token}"))
            .call()
            .map_err(http_err("download backup"))?;
        let mut bytes = Vec::new();
        resp.into_reader().take(512 * 1024 * 1024).read_to_end(&mut bytes).map_err(err("download backup"))?;
        Ok(bytes)
    }
}

/// Waits on the loopback listener for Google's redirect and returns the code.
fn wait_for_code(listener: &TcpListener, expected_state: &str) -> Result<String> {
    listener.set_nonblocking(true).map_err(err("sign-in listener"))?;
    let deadline = Instant::now() + SIGN_IN_TIMEOUT;
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_nonblocking(false).ok();
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                let mut line = String::new();
                BufReader::new(&stream).read_line(&mut line).ok();
                // "GET /?state=...&code=... HTTP/1.1"
                let query = line.split_whitespace().nth(1).and_then(|p| p.split_once('?')).map(|(_, q)| q.to_owned()).unwrap_or_default();
                let mut reply = |msg: &str| {
                    let html = format!("<!doctype html><meta charset=utf-8><title>Windows Notes</title><body style=\"font-family:Segoe UI,sans-serif;padding:48px\"><h2>{msg}</h2><p>You can close this tab and go back to Windows Notes.</p>");
                    let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}", html.len());
                };
                if query.is_empty() {
                    // A browser asking for /favicon.ico or similar; keep waiting.
                    reply("Waiting for Google…");
                    continue;
                }
                if query_param(&query, "state").as_deref() != Some(expected_state) {
                    reply("Sign-in didn't match. Please try again.");
                    return Err("sign-in didn't match; please try again".into());
                }
                if let Some(e) = query_param(&query, "error") {
                    reply("Sign-in was cancelled.");
                    return Err(format!("Google sign-in was cancelled ({e})"));
                }
                return match query_param(&query, "code") {
                    Some(code) => {
                        reply("Windows Notes is connected to Google Drive.");
                        Ok(code)
                    }
                    None => {
                        reply("Something went wrong. Please try again.");
                        Err("Google didn't send a sign-in code".into())
                    }
                };
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err("sign-in timed out; please try again".into());
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(format!("sign-in listener: {e}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_query_params() {
        let q = "state=abc&code=4%2F0Ab_x-y&scope=a+b";
        assert_eq!(query_param(q, "state").as_deref(), Some("abc"));
        assert_eq!(query_param(q, "code").as_deref(), Some("4/0Ab_x-y"));
        assert_eq!(query_param(q, "scope").as_deref(), Some("a b"));
        assert_eq!(query_param(q, "error"), None);
    }

    #[test]
    fn percent_encodes() {
        assert_eq!(pct("http://127.0.0.1:5000"), "http%3A%2F%2F127.0.0.1%3A5000");
        assert_eq!(pct("a b~c"), "a%20b~c");
    }
}
