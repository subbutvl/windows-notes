import { lazy, type ComponentType, type ReactNode } from "react";
import { CalculatorIcon, CalendarIcon, CameraIcon, CaseIcon, TextCountIcon, UnitsIcon, WhitespaceIcon, ClipboardIcon, ClockIcon, CurrencyIcon, EyedropperIcon, KeyIcon, PaletteIcon, RulerIcon, ScissorsIcon, SwatchesIcon } from "../components/Icons";
import { SEPARATOR, useMenu, type MenuEntry } from "../lib/menu";
import { KEYS, TOOL_KEYS } from "../lib/shortcuts";
import { useTools, type ToolId } from "../lib/tools";
import { Calculator } from "./Calculator";
import { ClipboardTool } from "./ClipboardTool";
import { ClockTool } from "./ClockTool";
import { ColorTool } from "./ColorTool";
import { CurrencyTool } from "./CurrencyTool";
import { DateTool } from "./DateTool";
import { MeasureTool } from "./MeasureTool";
import { PasswordTool } from "./PasswordTool";
import { PickerTool } from "./PickerTool";
import type { Copy } from "./shared";
import { SnipTool } from "./SnipTool";
import { TailwindTool } from "./TailwindTool";

/** Loads a tool's code only when it is first opened, so unused tools cost nothing. */
const later = <K extends string>(load: () => Promise<Record<K, ComponentType<{ copy: Copy }>>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const TextCounter = later(() => import("./TextTools"), "TextCounter");
const CaseConverter = later(() => import("./TextTools"), "CaseConverter");
const WhitespaceRemover = later(() => import("./TextTools"), "WhitespaceRemover");
const UnitTool = later(() => import("./UnitTool"), "UnitTool");
const PhotoTool = later(() => import("./PhotoTool"), "PhotoTool");

type Group = "everyday" | "text" | "colour" | "media" | "screen";

/**
 * Every quick tool, in menu order; a separator goes between groups. Add a row
 * here and it shows up in the Quick Tools menu. `wide` tools get a wider panel.
 */
export const TOOLS: { id: ToolId; label: string; group: Group; wide?: boolean; icon: ReactNode; render(copy: Copy): ReactNode }[] = [
  { id: "calculator", label: "Calculator", group: "everyday", icon: <CalculatorIcon size={16} />, render: (copy) => <Calculator copy={copy} /> },
  { id: "currency", label: "Currency Converter", group: "everyday", icon: <CurrencyIcon size={16} />, render: (copy) => <CurrencyTool copy={copy} /> },
  { id: "units", label: "Unit Converter", group: "everyday", icon: <UnitsIcon size={16} />, render: (copy) => <UnitTool copy={copy} /> },
  { id: "dates", label: "Date Calculator", group: "everyday", icon: <CalendarIcon size={16} />, render: () => <DateTool /> },
  { id: "clock", label: "World Clock", group: "everyday", icon: <ClockIcon size={16} />, render: () => <ClockTool /> },
  { id: "password", label: "Password Generator", group: "everyday", icon: <KeyIcon size={16} />, render: (copy) => <PasswordTool copy={copy} /> },
  { id: "clipboard", label: "Clipboard History", group: "everyday", icon: <ClipboardIcon size={16} />, render: (copy) => <ClipboardTool copy={copy} /> },
  { id: "textCount", label: "Text Counter", group: "text", wide: true, icon: <TextCountIcon size={16} />, render: (copy) => <TextCounter copy={copy} /> },
  { id: "textCase", label: "Text Case Converter", group: "text", wide: true, icon: <CaseIcon size={16} />, render: (copy) => <CaseConverter copy={copy} /> },
  { id: "whitespace", label: "Whitespace Remover", group: "text", wide: true, icon: <WhitespaceIcon size={16} />, render: (copy) => <WhitespaceRemover copy={copy} /> },
  { id: "color", label: "Color Codes", group: "colour", icon: <PaletteIcon size={16} />, render: (copy) => <ColorTool copy={copy} /> },
  { id: "tailwind", label: "Tailwind Colors", group: "colour", icon: <SwatchesIcon size={16} />, render: (copy) => <TailwindTool copy={copy} /> },
  { id: "picker", label: "Screen Color Picker", group: "colour", icon: <EyedropperIcon size={16} />, render: (copy) => <PickerTool copy={copy} /> },
  { id: "photo", label: "Photography Tools", group: "media", icon: <CameraIcon size={16} />, render: (copy) => <PhotoTool copy={copy} /> },
  { id: "snip", label: "Screen Snip", group: "screen", icon: <ScissorsIcon size={16} />, render: () => <SnipTool /> },
  { id: "measure", label: "Screen Measure", group: "screen", icon: <RulerIcon size={16} />, render: () => <MeasureTool /> },
];

function toolsMenu(): MenuEntry[] {
  const { open, tool, toggle } = useTools.getState();
  return [
    ...TOOLS.flatMap((t, i) => [
      i > 0 && TOOLS[i - 1].group !== t.group && SEPARATOR,
      { label: t.label, shortcut: TOOL_KEYS[t.id], checked: open && tool === t.id, onSelect: () => (open && tool === t.id ? undefined : toggle(t.id)) },
    ]),
    open && SEPARATOR,
    open && { label: "Close Tool", shortcut: KEYS.tools, onSelect: () => useTools.setState({ open: false }) },
  ];
}

/** Opens the Quick Tools menu beside a button. */
export function openToolsMenu(button: HTMLElement, side: "right" | "below" = "right") {
  const r = button.getBoundingClientRect();
  const [x, y] = side === "right" ? [r.right + 4, r.top] : [r.left, r.bottom + 4];
  useMenu.getState().open(x, y, toolsMenu());
}
