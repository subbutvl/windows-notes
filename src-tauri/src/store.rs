//! On-disk note storage.
//!
//! Layout under the data folder (`%APPDATA%\WindowsNotes`):
//!   notes/<id>.json   one file per note, full content
//!   folders.json      the folder tree
//!   index.json        note summaries for the list and search; rebuilt from
//!                     the note files whenever it is missing or out of step
//!
//! Only summaries are kept in memory. A note's content is read from disk when
//! it is opened and written back on save, so memory stays flat as notes grow.

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const DELETED_RETENTION_DAYS: i64 = 30;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub folder_id: String,
    pub title: String,
    pub snippet: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    #[serde(flatten)]
    pub summary: NoteSummary,
    pub content: Value,
}

/// What the editor sends on every autosave.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteUpdate {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub tags: Vec<String>,
    pub content: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub folders: Vec<Folder>,
    pub notes: Vec<NoteSummary>,
}

/// One search result: the note and a bit of text around the first match.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub snippet: Option<String>,
}

/// What an import or restore did.
#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub added: usize,
    pub updated: usize,
    pub skipped: usize,
    pub folders_added: usize,
}

pub const EXPORT_FORMAT: &str = "windows-notes-export";

/// The file written by Export and by Google Drive backups.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFile {
    pub format: String,
    pub version: u32,
    pub exported_at: String,
    pub folders: Vec<Folder>,
    pub notes: Vec<Note>,
}

pub struct Store {
    root: PathBuf,
    folders: Vec<Folder>,
    notes: HashMap<String, NoteSummary>,
    /// Plain text of every note for search, filled on the first search and
    /// kept in step on save. Only text, no formatting, so it stays small.
    texts: Option<HashMap<String, String>>,
}

/// The words in a TipTap document, one line per block.
pub fn plain_text(doc: &Value) -> String {
    fn walk(v: &Value, out: &mut String) {
        if let Some(t) = v.get("text").and_then(Value::as_str) {
            out.push_str(t);
        }
        if let Some(children) = v.get("content").and_then(Value::as_array) {
            for c in children {
                walk(c, out);
            }
            if !out.ends_with('\n') {
                out.push('\n');
            }
        }
    }
    let mut out = String::new();
    walk(doc, &mut out);
    out
}

/// About `before` characters before the match and `after` after it, on char boundaries.
fn snippet_around(text: &str, lower: &str, at: usize, before: usize, after: usize) -> String {
    // Map the byte offset in the lowercase copy to a char index, then back
    // into the original text (lowercasing can change byte lengths).
    let char_at = lower[..at].chars().count();
    let chars: Vec<char> = text.chars().collect();
    let start = char_at.saturating_sub(before);
    let end = (char_at + after).min(chars.len());
    let body: String = chars[start.min(chars.len())..end].iter().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
    format!("{}{}{}", if start > 0 { "…" } else { "" }, body, if end < chars.len() { "…" } else { "" })
}

type Result<T> = std::result::Result<T, String>;

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

fn err<E: std::fmt::Display>(context: &str) -> impl Fn(E) -> String + '_ {
    move |e| format!("{context}: {e}")
}

/// Write to a temp file, then rename over the target, so a crash mid-write
/// never leaves a half-written file behind.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(err("create temp file"))?;
        f.write_all(bytes).map_err(err("write temp file"))?;
        f.sync_all().map_err(err("flush temp file"))?;
    }
    fs::rename(&tmp, path).map_err(err("replace file"))
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let bytes = serde_json::to_vec(value).map_err(err("serialize"))?;
    write_atomic(path, &bytes)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Ids become file names, so only allow plain characters.
fn check_id(id: &str) -> Result<()> {
    if !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        Ok(())
    } else {
        Err(format!("invalid id: {id}"))
    }
}

impl Store {
    pub fn open(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(root.join("notes")).map_err(err("create data folder"))?;

        let mut store = Store { root, folders: Vec::new(), notes: HashMap::new(), texts: None };
        let first_run = !store.folders_path().exists();

        store.folders = read_json(&store.folders_path()).unwrap_or_default();
        if store.folders.is_empty() {
            store.folders.push(Folder { id: "notes".into(), name: "Notes".into(), parent_id: None });
            store.save_folders()?;
        }

        store.load_index()?;
        store.purge_expired()?;

        if first_run && store.notes.is_empty() {
            store.seed_welcome_note()?;
        }
        Ok(store)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn folders_path(&self) -> PathBuf {
        self.root.join("folders.json")
    }

    fn index_path(&self) -> PathBuf {
        self.root.join("index.json")
    }

    fn note_path(&self, id: &str) -> PathBuf {
        self.root.join("notes").join(format!("{id}.json"))
    }

    fn save_folders(&self) -> Result<()> {
        write_json(&self.folders_path(), &self.folders)
    }

    fn save_index(&self) -> Result<()> {
        let list: Vec<&NoteSummary> = self.notes.values().collect();
        write_json(&self.index_path(), &list)
    }

    /// Trust index.json when it lists exactly the note files on disk;
    /// otherwise rebuild it by reading every note once.
    fn load_index(&mut self) -> Result<()> {
        let on_disk: HashSet<String> = fs::read_dir(self.root.join("notes"))
            .map_err(err("read notes folder"))?
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let name = e.file_name().into_string().ok()?;
                name.strip_suffix(".json").map(str::to_owned)
            })
            .collect();

        if let Some(list) = read_json::<Vec<NoteSummary>>(&self.index_path()) {
            let indexed: HashSet<String> = list.iter().map(|n| n.id.clone()).collect();
            if indexed == on_disk {
                self.notes = list.into_iter().map(|n| (n.id.clone(), n)).collect();
                return Ok(());
            }
        }

        self.notes = on_disk
            .iter()
            .filter_map(|id| read_json::<Note>(&self.note_path(id)))
            .map(|n| (n.summary.id.clone(), n.summary))
            .collect();
        self.save_index()
    }

    fn purge_expired(&mut self) -> Result<()> {
        let cutoff = Utc::now() - chrono::Duration::days(DELETED_RETENTION_DAYS);
        let expired: Vec<String> = self
            .notes
            .values()
            .filter(|n| {
                n.deleted_at
                    .as_deref()
                    .and_then(|d| DateTime::parse_from_rfc3339(d).ok())
                    .is_some_and(|d| d < cutoff)
            })
            .map(|n| n.id.clone())
            .collect();
        if expired.is_empty() {
            return Ok(());
        }
        for id in &expired {
            let _ = fs::remove_file(self.note_path(id));
            self.notes.remove(id);
        }
        self.save_index()
    }

    fn seed_welcome_note(&mut self) -> Result<()> {
        let content = json!({
            "type": "doc",
            "content": [
                { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Welcome to Windows Notes" }] },
                { "type": "paragraph", "content": [{ "type": "text", "text": "Every note saves as you type. The first line becomes its title." }] },
                { "type": "paragraph", "content": [{ "type": "text", "text": "Press Ctrl+N for a new note." }] }
            ]
        });
        let mut note = self.create_note("notes")?;
        note.content = content;
        self.save_note(NoteUpdate {
            id: note.summary.id,
            title: "Welcome to Windows Notes".into(),
            snippet: "Every note saves as you type. The first line becomes its title.".into(),
            tags: vec![],
            content: note.content,
        })?;
        Ok(())
    }

    fn write_note(&self, note: &Note) -> Result<()> {
        write_json(&self.note_path(&note.summary.id), note)
    }

    fn read_note(&self, id: &str) -> Result<Note> {
        check_id(id)?;
        read_json(&self.note_path(id)).ok_or_else(|| format!("note not found: {id}"))
    }

    fn summary_mut(&mut self, id: &str) -> Result<&mut NoteSummary> {
        self.notes.get_mut(id).ok_or_else(|| format!("note not found: {id}"))
    }

    /// Change a note's metadata, keeping its file and the index in step.
    fn update_meta(&mut self, id: &str, f: impl FnOnce(&mut NoteSummary)) -> Result<NoteSummary> {
        let mut note = self.read_note(id)?;
        f(&mut note.summary);
        self.write_note(&note)?;
        *self.summary_mut(id)? = note.summary.clone();
        self.save_index()?;
        Ok(note.summary)
    }

    // ---- notes -------------------------------------------------------------

    pub fn library(&self) -> Library {
        Library { folders: self.folders.clone(), notes: self.notes.values().cloned().collect() }
    }

    pub fn load_note(&self, id: &str) -> Result<Note> {
        self.read_note(id)
    }

    pub fn create_note(&mut self, folder_id: &str) -> Result<Note> {
        if !self.folders.iter().any(|f| f.id == folder_id) {
            return Err(format!("folder not found: {folder_id}"));
        }
        let ts = now();
        let note = Note {
            summary: NoteSummary {
                id: new_id(),
                folder_id: folder_id.into(),
                title: String::new(),
                snippet: String::new(),
                tags: vec![],
                pinned: false,
                created_at: ts.clone(),
                updated_at: ts,
                deleted_at: None,
            },
            content: json!({ "type": "doc", "content": [{ "type": "paragraph" }] }),
        };
        self.write_note(&note)?;
        self.notes.insert(note.summary.id.clone(), note.summary.clone());
        self.save_index()?;
        Ok(note)
    }

    pub fn save_note(&mut self, update: NoteUpdate) -> Result<NoteSummary> {
        check_id(&update.id)?;
        let mut summary = self.summary_mut(&update.id)?.clone();
        summary.title = update.title;
        summary.snippet = update.snippet;
        summary.tags = update.tags;
        summary.updated_at = now();
        let note = Note { summary: summary.clone(), content: update.content };
        self.write_note(&note)?;
        if let Some(texts) = &mut self.texts {
            texts.insert(summary.id.clone(), plain_text(&note.content));
        }
        self.notes.insert(summary.id.clone(), summary.clone());
        self.save_index()?;
        Ok(summary)
    }

    pub fn set_pinned(&mut self, id: &str, pinned: bool) -> Result<NoteSummary> {
        self.update_meta(id, |n| n.pinned = pinned)
    }

    pub fn move_note(&mut self, id: &str, folder_id: &str) -> Result<NoteSummary> {
        if !self.folders.iter().any(|f| f.id == folder_id) {
            return Err(format!("folder not found: {folder_id}"));
        }
        let folder_id = folder_id.to_owned();
        self.update_meta(id, move |n| n.folder_id = folder_id)
    }

    pub fn delete_note(&mut self, id: &str) -> Result<NoteSummary> {
        let ts = now();
        self.update_meta(id, move |n| {
            n.deleted_at = Some(ts);
            n.pinned = false;
        })
    }

    pub fn restore_note(&mut self, id: &str) -> Result<NoteSummary> {
        let fallback = self.folders[0].id.clone();
        let folder_exists: HashSet<String> = self.folders.iter().map(|f| f.id.clone()).collect();
        self.update_meta(id, move |n| {
            n.deleted_at = None;
            if !folder_exists.contains(&n.folder_id) {
                n.folder_id = fallback;
            }
        })
    }

    pub fn purge_note(&mut self, id: &str) -> Result<()> {
        check_id(id)?;
        let _ = fs::remove_file(self.note_path(id));
        self.notes.remove(id);
        if let Some(texts) = &mut self.texts {
            texts.remove(id);
        }
        self.save_index()
    }

    // ---- search ------------------------------------------------------------

    /// Notes containing every word of the query in their title, text or tags,
    /// ignoring case. Partial words match too ("meet" finds "meeting").
    pub fn search(&mut self, query: &str) -> Vec<SearchHit> {
        let terms: Vec<String> = query.split_whitespace().map(|t| t.trim_start_matches('#').to_lowercase()).filter(|t| !t.is_empty()).collect();
        if terms.is_empty() {
            return Vec::new();
        }
        if self.texts.is_none() {
            let texts = self
                .notes
                .keys()
                .filter_map(|id| read_json::<Note>(&self.note_path(id)).map(|n| (id.clone(), plain_text(&n.content))))
                .collect();
            self.texts = Some(texts);
        }
        let texts = self.texts.as_ref().unwrap();

        let mut hits = Vec::new();
        for n in self.notes.values() {
            let text = texts.get(&n.id).map(String::as_str).unwrap_or("");
            let lower = text.to_lowercase();
            let title = n.title.to_lowercase();
            let tags = n.tags.join(" ");
            if !terms.iter().all(|t| lower.contains(t.as_str()) || title.contains(t.as_str()) || tags.contains(t.as_str())) {
                continue;
            }
            // Show where the first word appears in the body, skipping the title line.
            let body_start = lower.find('\n').map(|i| i + 1).unwrap_or(lower.len());
            let snippet = terms
                .iter()
                .find_map(|t| lower[body_start..].find(t.as_str()).map(|i| body_start + i))
                .map(|at| snippet_around(text, &lower, at, 14, 110));
            hits.push(SearchHit { id: n.id.clone(), snippet });
        }
        hits
    }

    // ---- export and import -------------------------------------------------

    /// Every folder and note, including Recently Deleted, as one JSON file.
    pub fn export(&self) -> Result<Vec<u8>> {
        let mut notes: Vec<Note> = self.notes.keys().filter_map(|id| read_json::<Note>(&self.note_path(id))).collect();
        notes.sort_by(|a, b| a.summary.created_at.cmp(&b.summary.created_at));
        let file = ExportFile { format: EXPORT_FORMAT.into(), version: 1, exported_at: now(), folders: self.folders.clone(), notes };
        serde_json::to_vec_pretty(&file).map_err(err("serialize export"))
    }

    /// Merges an export file into this library. Nothing is ever lost:
    /// new notes are added, a note that exists here is replaced only when the
    /// file has a newer version of it, and existing folders keep their names.
    pub fn import(&mut self, bytes: &[u8]) -> Result<ImportReport> {
        let file: ExportFile = serde_json::from_slice(bytes).map_err(|_| "this isn't a Windows Notes export file".to_string())?;
        if file.format != EXPORT_FORMAT {
            return Err("this isn't a Windows Notes export file".into());
        }
        if file.version > 1 {
            return Err("this export was made by a newer version of Windows Notes".into());
        }
        let mut report = ImportReport::default();

        let known: HashSet<String> = self.folders.iter().map(|f| f.id.clone()).collect();
        for f in &file.folders {
            if check_id(&f.id).is_err() || known.contains(&f.id) || f.name.trim().is_empty() {
                continue;
            }
            self.folders.push(f.clone());
            report.folders_added += 1;
        }
        // Parents that didn't come along make a folder top level.
        let ids: HashSet<String> = self.folders.iter().map(|f| f.id.clone()).collect();
        for f in &mut self.folders {
            if f.parent_id.as_ref().is_some_and(|p| !ids.contains(p)) {
                f.parent_id = None;
            }
        }
        let fallback = self.folders[0].id.clone();

        for mut note in file.notes {
            if check_id(&note.summary.id).is_err() {
                report.skipped += 1;
                continue;
            }
            if !ids.contains(&note.summary.folder_id) {
                note.summary.folder_id = fallback.clone();
            }
            match self.notes.get(&note.summary.id) {
                Some(existing) if existing.updated_at >= note.summary.updated_at => {
                    report.skipped += 1;
                    continue;
                }
                Some(_) => report.updated += 1,
                None => report.added += 1,
            }
            self.write_note(&note)?;
            if let Some(texts) = &mut self.texts {
                texts.insert(note.summary.id.clone(), plain_text(&note.content));
            }
            self.notes.insert(note.summary.id.clone(), note.summary);
        }

        self.save_folders()?;
        self.save_index()?;
        Ok(report)
    }

    // ---- folders -----------------------------------------------------------

    pub fn create_folder(&mut self, name: &str, parent_id: Option<String>) -> Result<Folder> {
        let name = name.trim();
        if name.is_empty() {
            return Err("folder name is empty".into());
        }
        if let Some(p) = &parent_id {
            if !self.folders.iter().any(|f| &f.id == p) {
                return Err(format!("folder not found: {p}"));
            }
        }
        let folder = Folder { id: new_id(), name: name.into(), parent_id };
        self.folders.push(folder.clone());
        self.save_folders()?;
        Ok(folder)
    }

    pub fn rename_folder(&mut self, id: &str, name: &str) -> Result<Folder> {
        let name = name.trim();
        if name.is_empty() {
            return Err("folder name is empty".into());
        }
        let folder = self.folders.iter_mut().find(|f| f.id == id).ok_or_else(|| format!("folder not found: {id}"))?;
        folder.name = name.into();
        let folder = folder.clone();
        self.save_folders()?;
        Ok(folder)
    }

    /// Removes a folder and its subfolders; their notes go to Recently Deleted.
    pub fn delete_folder(&mut self, id: &str) -> Result<Library> {
        if self.folders.len() <= 1 {
            return Err("cannot delete the last folder".into());
        }
        let mut doomed: HashSet<String> = HashSet::from([id.to_owned()]);
        loop {
            let before = doomed.len();
            for f in &self.folders {
                if f.parent_id.as_ref().is_some_and(|p| doomed.contains(p)) {
                    doomed.insert(f.id.clone());
                }
            }
            if doomed.len() == before {
                break;
            }
        }
        if doomed.len() == self.folders.len() {
            return Err("cannot delete every folder".into());
        }

        let affected: Vec<String> = self
            .notes
            .values()
            .filter(|n| doomed.contains(&n.folder_id) && n.deleted_at.is_none())
            .map(|n| n.id.clone())
            .collect();
        let ts = now();
        for nid in affected {
            let mut note = self.read_note(&nid)?;
            note.summary.deleted_at = Some(ts.clone());
            note.summary.pinned = false;
            self.write_note(&note)?;
            self.notes.insert(nid, note.summary);
        }

        self.folders.retain(|f| !doomed.contains(&f.id));
        self.save_folders()?;
        self.save_index()?;
        Ok(self.library())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("wn-test-{name}-{}", new_id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn update(id: &str, title: &str) -> NoteUpdate {
        NoteUpdate { id: id.into(), title: title.into(), snippet: String::new(), tags: vec![], content: json!({"type":"doc"}) }
    }

    #[test]
    fn first_run_seeds_folder_and_welcome_note() {
        let store = Store::open(temp_root("seed")).unwrap();
        let lib = store.library();
        assert_eq!(lib.folders.len(), 1);
        assert_eq!(lib.notes.len(), 1);
        assert_eq!(lib.notes[0].title, "Welcome to Windows Notes");
    }

    #[test]
    fn save_then_reopen_keeps_note() {
        let root = temp_root("reopen");
        let id = {
            let mut s = Store::open(root.clone()).unwrap();
            let n = s.create_note("notes").unwrap();
            s.save_note(update(&n.summary.id, "Groceries")).unwrap();
            n.summary.id
        };
        let s = Store::open(root).unwrap();
        assert_eq!(s.load_note(&id).unwrap().summary.title, "Groceries");
    }

    #[test]
    fn missing_index_is_rebuilt_from_files() {
        let root = temp_root("rebuild");
        {
            let mut s = Store::open(root.clone()).unwrap();
            let n = s.create_note("notes").unwrap();
            s.save_note(update(&n.summary.id, "Kept")).unwrap();
        }
        fs::remove_file(root.join("index.json")).unwrap();
        let s = Store::open(root).unwrap();
        assert!(s.library().notes.iter().any(|n| n.title == "Kept"));
    }

    #[test]
    fn deleting_folder_moves_notes_to_recently_deleted() {
        let mut s = Store::open(temp_root("delfolder")).unwrap();
        let f = s.create_folder("Work", None).unwrap();
        let sub = s.create_folder("Meetings", Some(f.id.clone())).unwrap();
        let n = s.create_note(&sub.id).unwrap();
        let lib = s.delete_folder(&f.id).unwrap();
        assert_eq!(lib.folders.len(), 1);
        let note = lib.notes.iter().find(|x| x.id == n.summary.id).unwrap();
        assert!(note.deleted_at.is_some());
        let restored = s.restore_note(&n.summary.id).unwrap();
        assert_eq!(restored.folder_id, "notes");
    }

    #[test]
    fn search_finds_words_in_text_title_and_tags() {
        let root = temp_root("search");
        let mut store = Store::open(root.clone()).unwrap();
        let id = store.create_note("notes").unwrap().summary.id;
        let mut u = update(&id, "Groceries");
        u.tags = vec!["shopping".into()];
        u.content = json!({ "type": "doc", "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "Groceries" }] },
            { "type": "paragraph", "content": [{ "type": "text", "text": "Oat milk, eggs and Basil from the market" }] }
        ]});
        store.save_note(u).unwrap();

        let ids = |q: &str, s: &mut Store| s.search(q).into_iter().map(|h| h.id).collect::<Vec<_>>();
        assert_eq!(ids("basil", &mut store), [id.clone()]);
        assert_eq!(ids("EGGS mark", &mut store), [id.clone()]);
        assert_eq!(ids("#shopping", &mut store), [id.clone()]);
        assert!(ids("eggs bacon", &mut store).is_empty());
        let hit = store.search("basil").remove(0);
        assert!(hit.snippet.unwrap().contains("Basil"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn export_then_import_merges_without_losing_anything() {
        let a = temp_root("export-a");
        let mut src = Store::open(a.clone()).unwrap();
        let folder = src.create_folder("Work", None).unwrap();
        let id = src.create_note(&folder.id).unwrap().summary.id;
        src.save_note(update(&id, "Plan")).unwrap();
        let bytes = src.export().unwrap();

        let b = temp_root("export-b");
        let mut dst = Store::open(b.clone()).unwrap();
        let before = dst.library().notes.len();
        let report = dst.import(&bytes).unwrap();
        assert_eq!(report.folders_added, 1);
        assert_eq!(report.added, 2); // the welcome note and "Plan"
        assert_eq!(dst.library().notes.len(), before + 2);
        assert_eq!(dst.load_note(&id).unwrap().summary.folder_id, folder.id);

        // Importing the same file again changes nothing.
        let again = dst.import(&bytes).unwrap();
        assert_eq!((again.added, again.updated, again.skipped), (0, 0, 2));
        assert!(dst.import(b"{\"hello\": 1}").is_err());
        fs::remove_dir_all(a).ok();
        fs::remove_dir_all(b).ok();
    }

    /// cargo test --release -- --ignored --nocapture
    #[test]
    #[ignore]
    fn search_1000_notes_timing() {
        let root = temp_root("perf");
        let mut store = Store::open(root.clone()).unwrap();
        let words = ["meeting", "budget", "travel", "recipe", "design", "invoice", "garden", "python", "family", "music"];
        for i in 0..1000 {
            let id = store.create_note("notes").unwrap().summary.id;
            let body: String = (0..300).map(|j| words[(i * 7 + j * 3) % words.len()]).collect::<Vec<_>>().join(" ");
            let mut u = update(&id, &format!("Note {i}"));
            u.content = json!({ "type": "doc", "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": format!("Note {i}") }] },
                { "type": "paragraph", "content": [{ "type": "text", "text": body }] }
            ]});
            store.save_note(u).unwrap();
        }
        let t = std::time::Instant::now();
        let first = store.search("garden").len();
        let cold = t.elapsed();
        let t = std::time::Instant::now();
        let second = store.search("python music").len();
        let warm = t.elapsed();
        println!("1000 notes: first search {cold:?} ({first} hits), next search {warm:?} ({second} hits)");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn rejects_path_like_ids() {
        let s = Store::open(temp_root("ids")).unwrap();
        assert!(s.load_note("../secrets").is_err());
    }
}
