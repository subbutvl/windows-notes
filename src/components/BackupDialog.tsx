import { open as openFile, save as saveFile } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useNotes } from "../lib/store";
import type { BackupFile, DriveStatus, ImportReport } from "../lib/types";
import { CloseIcon } from "./Icons";

const close = () => useNotes.setState({ showBackup: false });

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

const kb = (size: string | null) => (size ? `${Math.max(1, Math.round(Number(size) / 1024)).toLocaleString()} KB` : "");

function describe(r: ImportReport) {
  const parts = [`${r.added} new ${r.added === 1 ? "note" : "notes"}`];
  if (r.updated) parts.push(`${r.updated} updated`);
  if (r.skipped) parts.push(`${r.skipped} already up to date`);
  if (r.foldersAdded) parts.push(`${r.foldersAdded} new ${r.foldersAdded === 1 ? "folder" : "folders"}`);
  return parts.join(", ");
}

const FILTERS = [{ name: "Windows Notes export", extensions: ["json"] }];

/** Google Drive backup, plus export and import of a JSON file. */
export function BackupDialog() {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [backups, setBackups] = useState<BackupFile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [client, setClient] = useState({ id: "", secret: "" });

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      restore?.focus?.();
    };
  }, [busy]);

  useEffect(() => {
    api.driveStatus().then(setStatus, (e) => setMessage({ text: String(e), error: true }));
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    api.driveList().then(setBackups, (e) => setMessage({ text: String(e), error: true }));
  }, [status?.connected]);

  /** Runs one action with a busy label, showing its result or error. */
  const run = async (label: string, action: () => Promise<string | void>) => {
    setBusy(label);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ text });
    } catch (e) {
      setMessage({ text: String(e), error: true });
    } finally {
      setBusy(null);
    }
  };

  const afterImport = async (r: ImportReport) => {
    await useNotes.getState().init();
    return `Done: ${describe(r)}. Nothing was deleted.`;
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className="dialog backup" role="dialog" aria-modal="true" aria-labelledby="backup-title" tabIndex={-1} ref={ref}>
        <div className="dialog-header">
          <h2 id="backup-title">Backup &amp; Export</h2>
          <button className="icon-button" aria-label="Close" disabled={!!busy} onClick={close}>
            <CloseIcon size={16} />
          </button>
        </div>

        <section className="backup-section">
          <h3>Google Drive</h3>
          {!status ? (
            <p className="tool-hint">Checking…</p>
          ) : !status.configured ? (
            <>
              <p className="backup-text">
                Backups go to your own Google Drive. Windows Notes needs a free Google OAuth client to sign in, set up once. The README explains how to make one in a few minutes.
              </p>
              <div className="backup-form">
                <input className="tool-input" placeholder="Client ID (…apps.googleusercontent.com)" value={client.id} onChange={(e) => setClient({ ...client, id: e.target.value })} />
                <input className="tool-input" placeholder="Client secret" value={client.secret} onChange={(e) => setClient({ ...client, secret: e.target.value })} />
                <button
                  className="text-button primary"
                  disabled={!client.id || !client.secret || !!busy}
                  onClick={() => run("Saving…", async () => setStatus(await api.driveSetClient(client.id, client.secret)))}
                >
                  Save
                </button>
              </div>
            </>
          ) : !status.connected ? (
            <>
              <p className="backup-text">Connect once, then back up whenever you like. Windows Notes can only see the backup files it creates in your Drive.</p>
              <button className="text-button primary" disabled={!!busy} onClick={() => run("Waiting for you to sign in in your browser…", async () => setStatus(await api.driveConnect()))}>
                Connect Google Drive
              </button>
            </>
          ) : (
            <>
              <div className="backup-account">
                <div>
                  <strong>{status.email ?? "Connected"}</strong>
                  <span>{status.lastBackupAt ? `Last backup ${when(status.lastBackupAt)}` : "No backups yet"}</span>
                </div>
                <button
                  className="text-button primary"
                  disabled={!!busy}
                  onClick={() =>
                    run("Backing up…", async () => {
                      const file = await api.driveBackup();
                      setStatus(await api.driveStatus());
                      setBackups(await api.driveList());
                      return `Backed up as "${file.name}".`;
                    })
                  }
                >
                  Back Up Now
                </button>
              </div>

              <div className="backup-list" aria-label="Backups in Google Drive">
                {backups === null ? (
                  <p className="tool-hint">Loading backups…</p>
                ) : backups.length === 0 ? (
                  <p className="tool-hint">No backups in Drive yet.</p>
                ) : (
                  backups.map((b) => (
                    <div key={b.id} className="backup-row">
                      <span>
                        {when(b.modifiedTime)} <small>{kb(b.size)}</small>
                      </span>
                      {confirmRestore === b.id ? (
                        <>
                          <button
                            className="text-button primary"
                            disabled={!!busy}
                            onClick={() => (setConfirmRestore(null), run("Restoring…", async () => afterImport(await api.driveRestore(b.id))))}
                          >
                            Restore
                          </button>
                          <button className="text-button" onClick={() => setConfirmRestore(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button className="text-button" disabled={!!busy} onClick={() => setConfirmRestore(b.id)}>
                          Restore…
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
              {confirmRestore && <p className="tool-hint">Restoring adds missing notes and brings older copies up to date. It never deletes or overwrites newer notes.</p>}
              <p className="tool-hint">
                The newest 10 backups are kept.{" "}
                <button className="link-button" disabled={!!busy} onClick={() => run("Disconnecting…", async () => (setBackups(null), setStatus(await api.driveDisconnect())))}>
                  Disconnect
                </button>
              </p>
            </>
          )}
        </section>

        <section className="backup-section">
          <h3>JSON file</h3>
          <p className="backup-text">All folders and notes, including Recently Deleted, in one file you can keep anywhere. Importing merges into your notes; it never deletes anything.</p>
          <div className="backup-buttons">
            <button
              className="text-button"
              disabled={!!busy}
              onClick={() =>
                run("Exporting…", async () => {
                  const path = await saveFile({ defaultPath: `Windows Notes export ${today}.json`, filters: FILTERS });
                  if (!path) return;
                  await api.exportLibrary(path);
                  return `Exported to ${path}`;
                })
              }
            >
              Export…
            </button>
            <button
              className="text-button"
              disabled={!!busy}
              onClick={() =>
                run("Importing…", async () => {
                  const path = await openFile({ multiple: false, directory: false, filters: FILTERS });
                  if (typeof path !== "string") return;
                  return afterImport(await api.importLibrary(path));
                })
              }
            >
              Import…
            </button>
          </div>
        </section>

        {(busy || message) && (
          <p className={`backup-message${message?.error ? " is-error" : ""}`} role="status">
            {busy ?? message?.text}
          </p>
        )}
      </div>
    </div>
  );
}
