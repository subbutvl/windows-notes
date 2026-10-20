import type { Editor } from "@tiptap/core";

/**
 * Turns the selection into one code block, or a code block back into plain
 * paragraphs. Several selected paragraphs become a single block, one line
 * each (TipTap's own toggle would make a separate block per paragraph).
 */
export function toggleCodeBlock(e: Editor): boolean {
  const { state } = e;
  const { $from, $to } = state.selection;

  if (e.isActive("codeBlock")) {
    // Back to text: one paragraph per line, so line breaks survive.
    const pos = $from.before($from.depth);
    const node = $from.parent;
    const paragraphs = node.textContent.split("\n").map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] }));
    return e.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, paragraphs).run();
  }

  const range = $from.blockRange($to);
  // Inside lists or tables, or a single paragraph: the built-in toggle does the right thing.
  if (!range || range.parent !== state.doc || range.endIndex - range.startIndex < 2) {
    return e.chain().focus().toggleCodeBlock().run();
  }
  const text = state.doc.textBetween(range.start, range.end, "\n", "\n");
  return e
    .chain()
    .focus()
    .insertContentAt({ from: range.start, to: range.end }, { type: "codeBlock", content: text ? [{ type: "text", text }] : [] })
    .run();
}
