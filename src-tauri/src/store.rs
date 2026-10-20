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

pub struct Store {
    root: PathBuf,
    folders: Vec<Folder>,
    notes: HashMap<String, NoteSummary>,
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

        let mut store = Store { root, folders: Vec::new(), notes: HashMap::new() };
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
        self.save_index()
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
    fn rejects_path_like_ids() {
        let s = Store::open(temp_root("ids")).unwrap();
        assert!(s.load_note("../secrets").is_err());
    }
}
