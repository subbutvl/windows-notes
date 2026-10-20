import type { Editor } from "@tiptap/react";
import { copySelection, readClipboardText } from "../lib/clipboard";
import { SEPARATOR, type MenuEntry } from "../lib/menu";
import { KEYS } from "../lib/shortcuts";
import { toggleCodeBlock } from "./codeBlock";
import { HIGHLIGHT_COLORS, LINK_REQUEST_EVENT, TEXT_COLORS } from "./extensions";

export type StyleId = "title" | "heading" | "subheading" | "body" | "monospaced";

/** Apple Notes' paragraph styles, mapped onto TipTap nodes. */
export const TEXT_STYLES: { id: StyleId; label: string; shortcut: string; run(e: Editor): void }[] = [
  { id: "title", label: "Title", shortcut: KEYS.title, run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { id: "heading", label: "Heading", shortcut: KEYS.heading, run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { id: "subheading", label: "Subheading", shortcut: KEYS.subheading, run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { id: "body", label: "Body", shortcut: KEYS.body, run: (e) => e.chain().focus().setParagraph().run() },
  { id: "monospaced", label: "Code Block", shortcut: KEYS.monospaced, run: (e) => e.isActive("codeBlock") || toggleCodeBlock(e) },
];

export function currentStyle(e: Editor): StyleId {
  if (e.isActive("heading", { level: 1 })) return "title";
  if (e.isActive("heading", { level: 2 })) return "heading";
  if (e.isActive("heading", { level: 3 })) return "subheading";
  if (e.isActive("codeBlock")) return "monospaced";
  return "body";
}

export const requestLink = () => window.dispatchEvent(new CustomEvent(LINK_REQUEST_EVENT));

export async function pastePlainText(e: Editor) {
  const text = await readClipboardText();
  if (text === null) return;
  e.commands.focus();
  e.view.pasteText(text);
}

export function tableMenu(e: Editor): MenuEntry[] {
  const c = () => e.chain().focus();
  return [
    { label: "Add Row Above", onSelect: () => c().addRowBefore().run() },
    { label: "Add Row Below", onSelect: () => c().addRowAfter().run() },
    { label: "Add Column Before", onSelect: () => c().addColumnBefore().run() },
    { label: "Add Column After", onSelect: () => c().addColumnAfter().run() },
    SEPARATOR,
    { label: "Delete Row", onSelect: () => c().deleteRow().run() },
    { label: "Delete Column", onSelect: () => c().deleteColumn().run() },
    SEPARATOR,
    { label: "Header Row", checked: e.isActive("tableHeader"), onSelect: () => c().toggleHeaderRow().run() },
    { label: "Merge Cells", disabled: !e.can().mergeCells(), onSelect: () => c().mergeCells().run() },
    { label: "Split Cell", disabled: !e.can().splitCell(), onSelect: () => c().splitCell().run() },
    SEPARATOR,
    { label: "Delete Table", danger: true, onSelect: () => c().deleteTable().run() },
  ];
}

/** Right-click menu inside the note text. */
export function editorMenu(e: Editor): MenuEntry[] {
  const c = () => e.chain().focus();
  const hasSelection = !e.state.selection.empty;
  const editable = e.isEditable;
  const color = e.getAttributes("textStyle").color as string | undefined;
  const highlight = e.getAttributes("highlight").color as string | undefined;

  if (!editable) {
    return [
      { label: "Copy", shortcut: KEYS.copy, disabled: !hasSelection, onSelect: () => copySelection() },
      { label: "Select All", shortcut: KEYS.selectAll, onSelect: () => c().selectAll().run() },
    ];
  }

  return [
    { label: "Cut", shortcut: KEYS.cut, disabled: !hasSelection, onSelect: () => (e.commands.focus(), copySelection(true)) },
    { label: "Copy", shortcut: KEYS.copy, disabled: !hasSelection, onSelect: () => (e.commands.focus(), copySelection()) },
    { label: "Paste", shortcut: KEYS.paste, onSelect: () => pastePlainText(e) },
    { label: "Select All", shortcut: KEYS.selectAll, onSelect: () => c().selectAll().run() },
    SEPARATOR,
    {
      label: "Font",
      submenu: [
        { label: "Bold", shortcut: KEYS.bold, checked: e.isActive("bold"), onSelect: () => c().toggleBold().run() },
        { label: "Italic", shortcut: KEYS.italic, checked: e.isActive("italic"), onSelect: () => c().toggleItalic().run() },
        { label: "Underline", shortcut: KEYS.underline, checked: e.isActive("underline"), onSelect: () => c().toggleUnderline().run() },
        { label: "Strikethrough", shortcut: KEYS.strike, checked: e.isActive("strike"), onSelect: () => c().toggleStrike().run() },
        SEPARATOR,
        { label: "Bigger", shortcut: KEYS.biggerText, onSelect: () => c().stepFontSize(1).run() },
        { label: "Smaller", shortcut: KEYS.smallerText, onSelect: () => c().stepFontSize(-1).run() },
      ],
    },
    {
      label: "Text Color",
      submenu: [
        { label: "Default", checked: !color, onSelect: () => c().unsetColor().run() },
        ...TEXT_COLORS.map((t) => ({ label: t.label, swatch: t.value, checked: color === t.value, onSelect: () => c().setColor(t.value).run() })),
      ],
    },
    {
      label: "Highlight",
      submenu: [
        { label: "None", checked: !e.isActive("highlight"), onSelect: () => c().unsetHighlight().run() },
        ...HIGHLIGHT_COLORS.map((h) => ({ label: h.label, swatch: h.value, checked: highlight === h.value, onSelect: () => c().setHighlight({ color: h.value }).run() })),
      ],
    },
    {
      label: "Paragraph Style",
      submenu: TEXT_STYLES.map((s) => ({ label: s.label, shortcut: s.shortcut, checked: currentStyle(e) === s.id, onSelect: () => s.run(e) })),
    },
    {
      label: "Alignment",
      submenu: (["left", "center", "right", "justify"] as const).map((a) => ({
        label: a === "left" ? "Align Left" : a === "right" ? "Align Right" : a === "center" ? "Center" : "Justify",
        shortcut: a === "left" ? KEYS.alignLeft : a === "right" ? KEYS.alignRight : a === "center" ? KEYS.alignCenter : KEYS.justify,
        checked: e.isActive({ textAlign: a }),
        onSelect: () => c().setTextAlign(a).run(),
      })),
    },
    SEPARATOR,
    { label: "Bulleted List", shortcut: KEYS.bulletList, checked: e.isActive("bulletList"), onSelect: () => c().toggleBulletList().run() },
    { label: "Numbered List", shortcut: KEYS.numberedList, checked: e.isActive("orderedList"), onSelect: () => c().toggleOrderedList().run() },
    { label: "Checklist", shortcut: KEYS.checklist, checked: e.isActive("taskList"), onSelect: () => c().toggleTaskList().run() },
    { label: "Code Block", shortcut: KEYS.monospaced, checked: e.isActive("codeBlock"), onSelect: () => toggleCodeBlock(e) },
    SEPARATOR,
    e.isActive("link")
      ? { label: "Edit Link…", shortcut: KEYS.link, onSelect: requestLink }
      : { label: "Add Link…", shortcut: KEYS.link, onSelect: requestLink },
    e.isActive("link") && { label: "Remove Link", onSelect: () => c().extendMarkRange("link").unsetLink().run() },
    e.isActive("table")
      ? { label: "Table", submenu: tableMenu(e) }
      : { label: "Insert Table", shortcut: KEYS.table, onSelect: () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    SEPARATOR,
    { label: "Clear Formatting", shortcut: KEYS.clearFormatting, disabled: !hasSelection, onSelect: () => c().unsetAllMarks().run() },
  ];
}
