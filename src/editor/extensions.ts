import { Extension, type Extensions } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { ColorCodes } from "./colorCodes";

export const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 48];
export const DEFAULT_FONT_SIZE = 15;

export const FONT_WEIGHTS = [
  { label: "Light", value: "300" },
  { label: "Regular", value: "400" },
  { label: "Medium", value: "500" },
  { label: "Semibold", value: "600" },
  { label: "Bold", value: "700" },
];

/** Text colours chosen to read on both the light and dark editor. */
export const TEXT_COLORS = [
  { label: "Red", value: "#e5484d" },
  { label: "Orange", value: "#f76b15" },
  { label: "Yellow", value: "#d9a400" },
  { label: "Green", value: "#30a46c" },
  { label: "Teal", value: "#12a594" },
  { label: "Blue", value: "#0090ff" },
  { label: "Purple", value: "#8e4ec6" },
  { label: "Pink", value: "#d6409f" },
  { label: "Gray", value: "#8b8d98" },
];

/** Highlighted text is always drawn dark, so these stay light. */
export const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: "#ffe58f" },
  { label: "Green", value: "#b7f0c8" },
  { label: "Blue", value: "#bde0ff" },
  { label: "Pink", value: "#ffc9e3" },
  { label: "Purple", value: "#e2d1ff" },
  { label: "Orange", value: "#ffd8b5" },
];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
      stepFontSize: (direction: 1 | -1) => ReturnType;
    };
    fontFamily: {
      setFontFamily: (family: string) => ReturnType;
      unsetFontFamily: () => ReturnType;
    };
    fontWeight: {
      setFontWeight: (weight: string) => ReturnType;
      unsetFontWeight: () => ReturnType;
    };
  }
}

/** Adds a `font-size` attribute to the textStyle mark. */
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize || null,
            renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
      stepFontSize:
        (direction) =>
        ({ editor, commands }) => {
          const current = parseInt(editor.getAttributes("textStyle").fontSize ?? "", 10) || DEFAULT_FONT_SIZE;
          const next =
            direction > 0
              ? FONT_SIZES.find((s) => s > current)
              : [...FONT_SIZES].reverse().find((s) => s < current);
          if (!next) return false;
          return next === DEFAULT_FONT_SIZE ? commands.unsetFontSize() : commands.setFontSize(`${next}px`);
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-]": () => this.editor.commands.stepFontSize(1),
      "Mod-[": () => this.editor.commands.stepFontSize(-1),
    };
  },
});

/** Adds a `font-weight` attribute to the textStyle mark. */
const FontWeight = Extension.create({
  name: "fontWeight",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontWeight: {
            default: null,
            parseHTML: (el) => el.style.fontWeight || null,
            renderHTML: (attrs) => (attrs.fontWeight ? { style: `font-weight: ${attrs.fontWeight}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontWeight:
        (weight) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontWeight: weight }).run(),
      unsetFontWeight:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontWeight: null }).removeEmptyTextStyle().run(),
    };
  },
});

/** Adds a `font-family` attribute to the textStyle mark. */
const FontFamily = Extension.create({
  name: "fontFamily",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (el) => el.style.fontFamily || null,
            renderHTML: (attrs) => (attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontFamily:
        (family) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily: family }).run(),
      unsetFontFamily:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontFamily: null }).removeEmptyTextStyle().run(),
    };
  },
});

/** Word-style alignment keys (Ctrl+L/E/R/J) instead of TipTap's Ctrl+Shift ones. */
const Align = TextAlign.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-l": () => this.editor.commands.setTextAlign("left"),
      "Mod-e": () => this.editor.commands.setTextAlign("center"),
      "Mod-r": () => this.editor.commands.setTextAlign("right"),
      "Mod-j": () => this.editor.commands.setTextAlign("justify"),
    };
  },
}).configure({ types: ["heading", "paragraph"] });

/** Apple Notes uses Shift+Cmd+L for a checklist. */
const Checklist = TaskList.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Shift-l": () => this.editor.commands.toggleTaskList(),
    };
  },
});

export const LINK_REQUEST_EVENT = "windows-notes:link";
/** Plain text sent from the tools panel to the open note: CustomEvent<string>. */
export const INSERT_TEXT_EVENT = "windows-notes:insert-text";

/** Shortcuts that don't belong to a single extension. */
const NoteShortcuts = Extension.create({
  name: "noteShortcuts",
  addKeyboardShortcuts() {
    const clear = () => this.editor.chain().focus().unsetAllMarks().run();
    return {
      "Mod-\\": clear,
      "Mod-Space": clear,
      "Mod-k": () => {
        window.dispatchEvent(new CustomEvent(LINK_REQUEST_EVENT));
        return true;
      },
      "Mod-Alt-t": () => this.editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    };
  },
});

export function createExtensions(): Extensions {
  return [
    StarterKit,
    Underline,
    TextStyle,
    Color,
    FontSize,
    FontFamily,
    FontWeight,
    Highlight.configure({ multicolor: true }),
    Align,
    Checklist,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true, lastColumnResizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
    Placeholder.configure({ placeholder: ({ pos }) => (pos === 0 ? "Title" : "") }),
    NoteShortcuts,
    ColorCodes,
  ];
}
