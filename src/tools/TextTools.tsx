import { useState } from "react";
import { CopyIcon, InsertIcon, RestoreIcon, TrashIcon } from "../components/Icons";
import { insertIntoNote } from "../lib/tools";
import { IconAction, useCanInsert, type Copy } from "./shared";

/** A big text box that scrolls when the text is long, with copy, insert and clear. */
function TextBox({ value, onChange, copy, placeholder, undo }: { value: string; onChange(v: string): void; copy: Copy; placeholder: string; undo?: () => void }) {
  const canInsert = useCanInsert();
  return (
    <div className="text-tool-box">
      <textarea className="tool-textarea" value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
      <div className="tool-actions">
        {undo && (
          <IconAction label="Undo the last change" onClick={undo}>
            <RestoreIcon size={16} />
          </IconAction>
        )}
        <IconAction label="Clear" disabled={!value} onClick={() => onChange("")}>
          <TrashIcon size={16} />
        </IconAction>
        <IconAction label="Copy text" disabled={!value} onClick={() => copy(value, "text")}>
          <CopyIcon size={16} />
        </IconAction>
        <IconAction label="Insert text into note" disabled={!value || !canInsert} onClick={() => insertIntoNote(value)}>
          <InsertIcon size={16} />
        </IconAction>
      </div>
    </div>
  );
}

/** Text that can be changed by buttons, with one step of undo. */
function useEditableText() {
  const [text, setText] = useState("");
  const [previous, setPrevious] = useState<string | null>(null);
  const apply = (next: string) => {
    if (next === text) return;
    setPrevious(text);
    setText(next);
  };
  const undo = previous === null ? undefined : () => (setText(previous), setPrevious(null));
  return { text, setText, apply, undo };
}

const num = (n: number) => n.toLocaleString();
const minutes = (words: number, perMinute: number) => {
  const m = words / perMinute;
  if (words === 0) return "0 sec";
  return m < 1 ? `${Math.max(1, Math.round(m * 60))} sec` : `${Math.round(m * 10) / 10} min`;
};

function countText(text: string) {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? [];
  const sentences = text.split(/[.!?…]+(?=\s|$)/u).filter((s) => /[\p{L}\p{N}]/u.test(s)).length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const unique = new Set(words.map((w) => w.toLowerCase())).size;
  return [
    ["Characters", num([...text].length)],
    ["Without spaces", num([...text.replace(/\s/g, "")].length)],
    ["Words", num(words.length)],
    ["Unique words", num(unique)],
    ["Sentences", num(sentences)],
    ["Paragraphs", num(paragraphs)],
    ["Lines", num(text ? text.split("\n").length : 0)],
    ["Reading time", minutes(words.length, 238)],
    ["Speaking time", minutes(words.length, 150)],
  ];
}

export function TextCounter({ copy }: { copy: Copy }) {
  const [text, setText] = useState("");
  return (
    <div className="tool-body">
      <div className="text-stats">
        {countText(text).map(([label, value]) => (
          <div key={label} className="text-stat">
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <TextBox value={text} onChange={setText} copy={copy} placeholder="Type or paste text to count" />
      <p className="tool-hint">Reading time at 238 words a minute, speaking at 150. The text is never saved.</p>
    </div>
  );
}

/** Words of the text for code-style cases: splits spaces, punctuation and camelCase humps. */
const wordsOf = (line: string) =>
  line
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
/** Applies `f` to each line on its own, so line breaks stay where they are. */
const perLine = (f: (line: string) => string) => (text: string) => text.split("\n").map(f).join("\n");

const CASES: { label: string; convert(text: string): string }[] = [
  { label: "UPPER CASE", convert: (t) => t.toUpperCase() },
  { label: "lower case", convert: (t) => t.toLowerCase() },
  { label: "Title Case", convert: (t) => t.toLowerCase().replace(/(^|[\s(\["'“‘-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) },
  { label: "Sentence case", convert: (t) => t.toLowerCase().replace(/(^\s*|[.!?…]\s+|\n\s*)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) },
  { label: "camelCase", convert: perLine((l) => wordsOf(l).map((w, i) => (i ? cap(w) : w.toLowerCase())).join("")) },
  { label: "PascalCase", convert: perLine((l) => wordsOf(l).map(cap).join("")) },
  { label: "snake_case", convert: perLine((l) => wordsOf(l).join("_").toLowerCase()) },
  { label: "kebab-case", convert: perLine((l) => wordsOf(l).join("-").toLowerCase()) },
  { label: "CONSTANT_CASE", convert: perLine((l) => wordsOf(l).join("_").toUpperCase()) },
  { label: "dot.case", convert: perLine((l) => wordsOf(l).join(".").toLowerCase()) },
  { label: "iNVERSE cASE", convert: (t) => [...t].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join("") },
  { label: "aLtErNaTiNg", convert: (t) => { let i = 0; return [...t].map((c) => (/\p{L}/u.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join(""); } },
];

export function CaseConverter({ copy }: { copy: Copy }) {
  const { text, setText, apply, undo } = useEditableText();
  return (
    <div className="tool-body">
      <div className="text-buttons">
        {CASES.map((c) => (
          <button key={c.label} className="chip" disabled={!text} onClick={() => apply(c.convert(text))}>
            {c.label}
          </button>
        ))}
      </div>
      <TextBox value={text} onChange={setText} copy={copy} undo={undo} placeholder="Type or paste text, then pick a case" />
    </div>
  );
}

const CLEANERS = [
  { id: "trimLines", label: "Trim spaces at the start and end of each line", run: (t: string) => t.replace(/^[ \t ]+|[ \t ]+$/gm, "") },
  { id: "collapse", label: "Turn runs of spaces into one space", run: (t: string) => t.replace(/[  ]{2,}/g, " ") },
  { id: "tabs", label: "Turn tabs into spaces", run: (t: string) => t.replace(/\t/g, " ") },
  { id: "blankRuns", label: "Keep at most one empty line in a row", run: (t: string) => t.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n") },
  { id: "blank", label: "Remove all empty lines", run: (t: string) => t.replace(/^[ \t]*\n/gm, "").replace(/\n[ \t]*$/, "") },
  { id: "breaks", label: "Join all lines into one", run: (t: string) => t.replace(/\s*\n\s*/g, " ") },
  { id: "invisible", label: "Remove invisible characters (zero-width, BOM)", run: (t: string) => t.replace(/[​-‍⁠﻿]/g, "") },
  { id: "all", label: "Remove every space and line break", run: (t: string) => t.replace(/\s+/g, "") },
] as const;
type CleanerId = (typeof CLEANERS)[number]["id"];

export function WhitespaceRemover({ copy }: { copy: Copy }) {
  const { text, setText, apply, undo } = useEditableText();
  const [on, setOn] = useState<CleanerId[]>(["trimLines", "collapse", "blankRuns", "invisible"]);
  const [removed, setRemoved] = useState<number | null>(null);
  const toggle = (id: CleanerId) => setOn((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const clean = () => {
    const next = CLEANERS.filter((c) => on.includes(c.id)).reduce((t, c) => c.run(t), text).trim();
    setRemoved(text.length - next.length);
    apply(next);
  };
  return (
    <div className="tool-body">
      <div className="tool-section">
        {CLEANERS.map((c) => (
          <label key={c.id} className="tool-check">
            <input type="checkbox" checked={on.includes(c.id)} onChange={() => toggle(c.id)} />
            {c.label}
          </label>
        ))}
      </div>
      <div className="tool-actions">
        {removed !== null && <span className="tool-hint text-removed">Removed {num(removed)} characters</span>}
        <button className="text-button" disabled={!text || !on.length} onClick={clean}>
          Clean Up
        </button>
      </div>
      <TextBox
        value={text}
        onChange={(v) => (setText(v), setRemoved(null))}
        copy={copy}
        undo={undo && (() => (undo(), setRemoved(null)))}
        placeholder="Type or paste text, then press Clean Up"
      />
    </div>
  );
}
