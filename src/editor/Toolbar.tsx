import { useEditorState, type Editor } from "@tiptap/react";
import { useState, type ReactNode } from "react";
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  BulletListIcon,
  ChecklistIcon,
  HighlighterIcon,
  IndentIcon,
  ItalicIcon,
  LinkIcon,
  MoreIcon,
  NumberedListIcon,
  OutdentIcon,
  RedoIcon,
  StrikeIcon,
  TableIcon,
  UnderlineIcon,
  UndoIcon,
} from "../components/Icons";
import { Popover, keepFocus } from "../components/Popover";
import { KEYS } from "../lib/shortcuts";
import { TEXT_STYLES, currentStyle, requestLink, tableMenu } from "./commands";
import { DEFAULT_FONT_SIZE, FONT_SIZES, FONT_WEIGHTS, HIGHLIGHT_COLORS, TEXT_COLORS } from "./extensions";

type Align = "left" | "center" | "right" | "justify";

const ALIGN_ICONS: Record<Align, ReactNode> = {
  left: <AlignLeftIcon />,
  center: <AlignCenterIcon />,
  right: <AlignRightIcon />,
  justify: <AlignJustifyIcon />,
};
const ALIGN_LABELS: Record<Align, [string, string]> = {
  left: ["Align Left", KEYS.alignLeft],
  center: ["Center", KEYS.alignCenter],
  right: ["Align Right", KEYS.alignRight],
  justify: ["Justify", KEYS.justify],
};

function ToolButton({ label, shortcut, active, disabled, onClick, children }: { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      className={`tool-button${active ? " is-active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MenuRow({ label, shortcut, checked, onClick, swatch }: { label: string; shortcut?: string; checked?: boolean; swatch?: string; onClick(): void }) {
  return (
    <button role="menuitemradio" aria-checked={!!checked} className="menu-item" onMouseDown={keepFocus} onClick={onClick}>
      <span className="menu-check" aria-hidden="true">
        {checked ? "✓" : swatch ? <span className="menu-swatch" style={{ background: swatch }} /> : null}
      </span>
      <span className="menu-label">{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}

function Swatches({ colors, current, onPick, noneLabel, onNone }: { colors: { label: string; value: string }[]; current?: string; onPick(v: string): void; noneLabel: string; onNone(): void }) {
  return (
    <div className="swatch-panel">
      <button className={`swatch-none${!current ? " is-active" : ""}`} onMouseDown={keepFocus} onClick={onNone}>
        {noneLabel}
      </button>
      <div className="swatch-grid">
        {colors.map((c) => (
          <button
            key={c.value}
            className={`swatch${current === c.value ? " is-active" : ""}`}
            style={{ background: c.value }}
            aria-label={c.label}
            title={c.label}
            onMouseDown={keepFocus}
            onClick={() => onPick(c.value)}
          />
        ))}
      </div>
    </div>
  );
}

/** Hover a grid to pick a table size, like Word's Insert Table. */
function TableGrid({ onPick }: { onPick(rows: number, cols: number): void }) {
  const [hover, setHover] = useState({ r: 3, c: 3 });
  const N = 8;
  return (
    <div className="table-grid-wrap">
      <div className="table-grid" onMouseLeave={() => setHover({ r: 3, c: 3 })}>
        {Array.from({ length: N * N }, (_, i) => {
          const r = Math.floor(i / N) + 1;
          const c = (i % N) + 1;
          return (
            <button
              key={i}
              aria-label={`${r} by ${c} table`}
              className={`table-cell-pick${r <= hover.r && c <= hover.c ? " is-on" : ""}`}
              onMouseEnter={() => setHover({ r, c })}
              onFocus={() => setHover({ r, c })}
              onMouseDown={keepFocus}
              onClick={() => onPick(r, c)}
            />
          );
        })}
      </div>
      <div className="table-grid-label">
        {hover.r} × {hover.c}
      </div>
    </div>
  );
}

export function Toolbar({ editor, children }: { editor: Editor; children?: ReactNode }) {
  // Re-render only when something the toolbar shows actually changes.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      editable: e.isEditable,
      style: currentStyle(e),
      fontSize: (e.getAttributes("textStyle").fontSize as string | undefined) ?? null,
      fontWeight: (e.getAttributes("textStyle").fontWeight as string | undefined) ?? null,
      color: (e.getAttributes("textStyle").color as string | undefined) ?? undefined,
      highlight: e.isActive("highlight") ? ((e.getAttributes("highlight").color as string | undefined) ?? HIGHLIGHT_COLORS[0].value) : undefined,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      align: ((["center", "right", "justify"] as Align[]).find((a) => e.isActive({ textAlign: a })) ?? "left") as Align,
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      inList: e.isActive("listItem") || e.isActive("taskItem"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const c = () => editor.chain().focus();
  const sizeLabel = s.fontSize ? parseInt(s.fontSize, 10) : DEFAULT_FONT_SIZE;
  const weightLabel = FONT_WEIGHTS.find((w) => w.value === s.fontWeight)?.label ?? (s.bold ? "Bold" : "Regular");
  const listItemType = s.task ? "taskItem" : "listItem";

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <fieldset className="tool-group" disabled={!s.editable}>
        <ToolButton label="Undo" shortcut={KEYS.undo} disabled={!s.canUndo} onClick={() => c().undo().run()}>
          <UndoIcon />
        </ToolButton>
        <ToolButton label="Redo" shortcut={KEYS.redo} disabled={!s.canRedo} onClick={() => c().redo().run()}>
          <RedoIcon />
        </ToolButton>
      </fieldset>

      <fieldset className="tool-group" disabled={!s.editable}>
        <Popover label="Paragraph style" button={<span className="tool-text strong">Aa</span>}>
          {(close) =>
            TEXT_STYLES.map((t) => (
              <MenuRow key={t.id} label={t.label} shortcut={t.shortcut} checked={s.style === t.id} onClick={() => (t.run(editor), close())} />
            ))
          }
        </Popover>
        <Popover label="Font size" title={`Font size (${KEYS.biggerText} / ${KEYS.smallerText})`} wide button={<span className="tool-text">{sizeLabel}</span>}>
          {(close) => (
            <div className="menu-scroll">
              {FONT_SIZES.map((size) => (
                <MenuRow
                  key={size}
                  label={`${size}`}
                  checked={sizeLabel === size}
                  onClick={() => {
                    if (size === DEFAULT_FONT_SIZE) c().unsetFontSize().run();
                    else c().setFontSize(`${size}px`).run();
                    close();
                  }}
                />
              ))}
            </div>
          )}
        </Popover>
        <Popover label="Font weight" wide button={<span className="tool-text">{weightLabel}</span>}>
          {(close) =>
            FONT_WEIGHTS.map((w) => (
              <MenuRow
                key={w.value}
                label={w.label}
                checked={weightLabel === w.label}
                onClick={() => {
                  // "Bold" uses the bold mark so Ctrl+B keeps working; the rest use a weight style.
                  const chain = c().unsetBold();
                  if (w.value === "700") chain.unsetFontWeight().setBold().run();
                  else if (w.value === "400") chain.unsetFontWeight().run();
                  else chain.setFontWeight(w.value).run();
                  close();
                }}
              />
            ))
          }
        </Popover>
      </fieldset>

      <fieldset className="tool-group" disabled={!s.editable}>
        <ToolButton label="Bold" shortcut={KEYS.bold} active={s.bold} onClick={() => c().toggleBold().run()}>
          <BoldIcon />
        </ToolButton>
        <ToolButton label="Italic" shortcut={KEYS.italic} active={s.italic} onClick={() => c().toggleItalic().run()}>
          <ItalicIcon />
        </ToolButton>
        <ToolButton label="Underline" shortcut={KEYS.underline} active={s.underline} onClick={() => c().toggleUnderline().run()}>
          <UnderlineIcon />
        </ToolButton>
        <ToolButton label="Strikethrough" shortcut={KEYS.strike} active={s.strike} onClick={() => c().toggleStrike().run()}>
          <StrikeIcon />
        </ToolButton>
        <Popover
          label="Text color"
          button={
            <span className="color-a" aria-hidden="true">
              A<span style={{ background: s.color ?? "currentColor" }} />
            </span>
          }
        >
          {(close) => (
            <Swatches
              colors={TEXT_COLORS}
              current={s.color}
              noneLabel="Default color"
              onNone={() => (c().unsetColor().run(), close())}
              onPick={(v) => (c().setColor(v).run(), close())}
            />
          )}
        </Popover>
        <Popover label="Highlight" title={`Highlight (${KEYS.highlight})`} active={!!s.highlight} button={<HighlighterIcon />}>
          {(close) => (
            <Swatches
              colors={HIGHLIGHT_COLORS}
              current={s.highlight}
              noneLabel="No highlight"
              onNone={() => (c().unsetHighlight().run(), close())}
              onPick={(v) => (c().setHighlight({ color: v }).run(), close())}
            />
          )}
        </Popover>
      </fieldset>

      <fieldset className="tool-group" disabled={!s.editable}>
        <Popover label={`Alignment: ${ALIGN_LABELS[s.align][0]}`} button={ALIGN_ICONS[s.align]}>
          {(close) =>
            (Object.keys(ALIGN_LABELS) as Align[]).map((a) => (
              <MenuRow key={a} label={ALIGN_LABELS[a][0]} shortcut={ALIGN_LABELS[a][1]} checked={s.align === a} onClick={() => (c().setTextAlign(a).run(), close())} />
            ))
          }
        </Popover>
        <ToolButton label="Bulleted list" shortcut={KEYS.bulletList} active={s.bullet} onClick={() => c().toggleBulletList().run()}>
          <BulletListIcon />
        </ToolButton>
        <ToolButton label="Numbered list" shortcut={KEYS.numberedList} active={s.ordered} onClick={() => c().toggleOrderedList().run()}>
          <NumberedListIcon />
        </ToolButton>
        <ToolButton label="Checklist" shortcut={KEYS.checklist} active={s.task} onClick={() => c().toggleTaskList().run()}>
          <ChecklistIcon />
        </ToolButton>
        <ToolButton label="Outdent" shortcut={KEYS.outdent} disabled={!s.inList} onClick={() => c().liftListItem(listItemType).run()}>
          <OutdentIcon />
        </ToolButton>
        <ToolButton label="Indent" shortcut={KEYS.indent} disabled={!s.inList} onClick={() => c().sinkListItem(listItemType).run()}>
          <IndentIcon />
        </ToolButton>
      </fieldset>

      <fieldset className="tool-group" disabled={!s.editable}>
        <Popover label={s.table ? "Table options" : "Insert table"} title={s.table ? "Table options" : `Insert table (${KEYS.table})`} active={s.table} button={<TableIcon />}>
          {(close) =>
            s.table ? (
              tableMenu(editor).map((item, i) =>
                !item || "separator" in item ? (
                  <div key={i} className="menu-separator" />
                ) : (
                  <button key={i} className={`menu-item${item.danger ? " danger" : ""}`} disabled={item.disabled} onMouseDown={keepFocus} onClick={() => (item.onSelect?.(), close())}>
                    <span className="menu-check">{item.checked ? "✓" : null}</span>
                    <span className="menu-label">{item.label}</span>
                  </button>
                ),
              )
            ) : (
              <TableGrid onPick={(rows, cols) => (c().insertTable({ rows, cols, withHeaderRow: true }).run(), close())} />
            )
          }
        </Popover>
        <ToolButton label={s.link ? "Edit link" : "Add link"} shortcut={KEYS.link} active={s.link} onClick={requestLink}>
          <LinkIcon />
        </ToolButton>
        <Popover label="More formatting" button={<MoreIcon />}>
          {(close) => (
            <>
              <MenuRow label="Block Quote" shortcut={KEYS.quote} checked={s.quote} onClick={() => (c().toggleBlockquote().run(), close())} />
              <MenuRow label="Code Block" shortcut={KEYS.monospaced} checked={s.code} onClick={() => (c().toggleCodeBlock().run(), close())} />
              <MenuRow label="Divider" onClick={() => (c().setHorizontalRule().run(), close())} />
              <div className="menu-separator" />
              <MenuRow label="Clear Formatting" shortcut={KEYS.clearFormatting} onClick={() => (c().unsetAllMarks().run(), close())} />
            </>
          )}
        </Popover>
      </fieldset>

      <div className="toolbar-spacer" />
      {children}
    </div>
  );
}

