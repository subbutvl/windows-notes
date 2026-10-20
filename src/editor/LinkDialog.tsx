import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

/** Adds https:// when someone types a bare domain. */
function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (url.includes("@") && !url.includes("/")) return `mailto:${url}`;
  return `https://${url}`;
}

export function LinkDialog({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const existing = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [url, setUrl] = useState(existing);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const finish = () => {
    onClose();
    editor.commands.focus();
  };

  const save = () => {
    const href = normalizeUrl(url);
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!href) {
      chain.unsetLink().run();
    } else if (editor.state.selection.empty && !editor.isActive("link")) {
      // Nothing selected: insert the address itself as the link text.
      chain.insertContent({ type: "text", text: url.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    finish();
  };

  return (
    <div className="link-dialog" role="dialog" aria-label="Link">
      <label htmlFor="link-url">Link address</label>
      <input
        id="link-url"
        ref={input}
        value={url}
        placeholder="https://example.com"
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") finish();
        }}
      />
      {existing && (
        <button className="text-button danger" onClick={() => (editor.chain().focus().extendMarkRange("link").unsetLink().run(), finish())}>
          Remove
        </button>
      )}
      <button className="text-button" onClick={finish}>
        Cancel
      </button>
      <button className="text-button primary" onClick={save}>
        Save
      </button>
    </div>
  );
}
