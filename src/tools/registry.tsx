import type { ReactNode } from "react";
import { CalculatorIcon, CalendarIcon, ClipboardIcon, ClockIcon, CurrencyIcon, EyedropperIcon, KeyIcon, PaletteIcon, RulerIcon, ScissorsIcon, SwatchesIcon } from "../components/Icons";
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

/** Every quick tool. Add a row here and it shows up in the Quick Tools menu. */
export const TOOLS: { id: ToolId; label: string; icon: ReactNode; render(copy: Copy): ReactNode }[] = [
  { id: "calculator", label: "Calculator", icon: <CalculatorIcon size={16} />, render: (copy) => <Calculator copy={copy} /> },
  { id: "color", label: "Color Codes", icon: <PaletteIcon size={16} />, render: (copy) => <ColorTool copy={copy} /> },
  { id: "picker", label: "Screen Color Picker", icon: <EyedropperIcon size={16} />, render: (copy) => <PickerTool copy={copy} /> },
  { id: "tailwind", label: "Tailwind Colors", icon: <SwatchesIcon size={16} />, render: (copy) => <TailwindTool copy={copy} /> },
  { id: "clipboard", label: "Clipboard History", icon: <ClipboardIcon size={16} />, render: (copy) => <ClipboardTool copy={copy} /> },
  { id: "password", label: "Password Generator", icon: <KeyIcon size={16} />, render: (copy) => <PasswordTool copy={copy} /> },
  { id: "currency", label: "Currency Converter", icon: <CurrencyIcon size={16} />, render: (copy) => <CurrencyTool copy={copy} /> },
  { id: "snip", label: "Screen Snip", icon: <ScissorsIcon size={16} />, render: () => <SnipTool /> },
  { id: "measure", label: "Screen Measure", icon: <RulerIcon size={16} />, render: () => <MeasureTool /> },
  { id: "dates", label: "Date Calculator", icon: <CalendarIcon size={16} />, render: () => <DateTool /> },
  { id: "clock", label: "World Clock", icon: <ClockIcon size={16} />, render: () => <ClockTool /> },
];

function toolsMenu(): MenuEntry[] {
  const { open, tool, toggle } = useTools.getState();
  return [
    ...TOOLS.map((t) => ({ label: t.label, shortcut: TOOL_KEYS[t.id], checked: open && tool === t.id, onSelect: () => (open && tool === t.id ? undefined : toggle(t.id)) })),
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
