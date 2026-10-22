import type { ToolId } from "./tools";

/** Every keyboard shortcut, for tooltips, menus and the Ctrl+/ sheet. */
export const KEYS = {
  newNote: "Ctrl+N",
  newFolder: "Ctrl+Shift+N",
  search: "Ctrl+F",
  pin: "Ctrl+Shift+P",
  toggleTheme: "Ctrl+Shift+D",
  shortcuts: "Ctrl+/",
  tools: "Ctrl+Shift+K",
  deleteNote: "Delete",
  exportPdf: "Ctrl+Shift+E",
  exportHtml: "Ctrl+Shift+W",

  undo: "Ctrl+Z",
  redo: "Ctrl+Y",
  cut: "Ctrl+X",
  copy: "Ctrl+C",
  paste: "Ctrl+V",
  pastePlain: "Ctrl+Shift+V",
  selectAll: "Ctrl+A",

  title: "Ctrl+Alt+1",
  heading: "Ctrl+Alt+2",
  subheading: "Ctrl+Alt+3",
  body: "Ctrl+Alt+0",
  monospaced: "Ctrl+Alt+C",

  bold: "Ctrl+B",
  italic: "Ctrl+I",
  underline: "Ctrl+U",
  strike: "Ctrl+Shift+S",
  highlight: "Ctrl+Shift+H",
  biggerText: "Ctrl+]",
  smallerText: "Ctrl+[",
  clearFormatting: "Ctrl+\\",

  alignLeft: "Ctrl+L",
  alignCenter: "Ctrl+E",
  alignRight: "Ctrl+R",
  justify: "Ctrl+J",

  bulletList: "Ctrl+Shift+8",
  numberedList: "Ctrl+Shift+7",
  checklist: "Ctrl+Shift+L",
  indent: "Tab",
  outdent: "Shift+Tab",
  quote: "Ctrl+Shift+B",

  link: "Ctrl+K",
  table: "Ctrl+Alt+T",
  nextCell: "Tab",
} as const;

/**
 * Alt+letter opens each quick tool (pressing it again closes it). Alt+R and
 * Alt+Z are left alone: NVIDIA's overlay uses them system-wide.
 */
export const TOOL_KEYS: Record<ToolId, string> = {
  calculator: "Alt+C",
  color: "Alt+O",
  picker: "Alt+P",
  tailwind: "Alt+W",
  clipboard: "Alt+V",
  password: "Alt+G",
  currency: "Alt+U",
  snip: "Alt+S",
  measure: "Alt+M",
  dates: "Alt+D",
  clock: "Alt+T",
  textCount: "Alt+X",
  textCase: "Alt+E",
  whitespace: "Alt+Q",
  units: "Alt+N",
  photo: "Alt+F",
};

/** The quick tool for an Alt+letter key press, given as a key code like "KeyX". */
export function toolForKey(code: string): ToolId | undefined {
  const letter = /^Key([A-Z])$/.exec(code)?.[1];
  return (Object.keys(TOOL_KEYS) as ToolId[]).find((id) => TOOL_KEYS[id] === `Alt+${letter}`);
}

export const SHORTCUT_GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Notes",
    items: [
      ["New note", KEYS.newNote],
      ["New folder", KEYS.newFolder],
      ["Search", KEYS.search],
      ["Pin or unpin note", KEYS.pin],
      ["Export note as PDF", KEYS.exportPdf],
      ["Export note as HTML", KEYS.exportHtml],
      ["Delete note (in the list)", KEYS.deleteNote],
      ["Previous or next note", "Up / Down"],
      ["Switch light and dark", KEYS.toggleTheme],
      ["Open or close the last quick tool", KEYS.tools],
      ["Show shortcuts", KEYS.shortcuts],
    ],
  },
  {
    title: "Editing",
    items: [
      ["Undo", KEYS.undo],
      ["Redo", KEYS.redo],
      ["Paste without formatting", KEYS.pastePlain],
      ["Insert link", KEYS.link],
      ["Open a link", "Click"],
      ["Edit a link", "Right-click"],
      ["Insert table", KEYS.table],
      ["Next table cell", KEYS.nextCell],
      ["Tints & shades of a colour code", "Right-click"],
    ],
  },
  {
    title: "Text style",
    items: [
      ["Title", KEYS.title],
      ["Heading", KEYS.heading],
      ["Subheading", KEYS.subheading],
      ["Body", KEYS.body],
      ["Code block", KEYS.monospaced],
      ["Block quote", KEYS.quote],
    ],
  },
  {
    title: "Formatting",
    items: [
      ["Bold", KEYS.bold],
      ["Italic", KEYS.italic],
      ["Underline", KEYS.underline],
      ["Strikethrough", KEYS.strike],
      ["Highlight", KEYS.highlight],
      ["Bigger text", KEYS.biggerText],
      ["Smaller text", KEYS.smallerText],
      ["Clear formatting", KEYS.clearFormatting],
    ],
  },
  {
    title: "Paragraph",
    items: [
      ["Align left", KEYS.alignLeft],
      ["Center", KEYS.alignCenter],
      ["Align right", KEYS.alignRight],
      ["Justify", KEYS.justify],
      ["Bulleted list", KEYS.bulletList],
      ["Numbered list", KEYS.numberedList],
      ["Checklist", KEYS.checklist],
      ["Indent / outdent list item", `${KEYS.indent} / ${KEYS.outdent}`],
    ],
  },
];
