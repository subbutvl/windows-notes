import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { parseColorCode } from "../lib/color";

const COLOR_CODE = /(?<![\w&#])#[0-9a-f]{3,8}(?![\w-])|\b(?:rgba?|hsla?)\([^()\n]{5,60}\)/gi;

/** Swatch decorations for every colour code in one paragraph, heading or list item. */
function decorateBlock(block: PMNode, pos: number, out: Decoration[]) {
  // One placeholder character per inline leaf (line breaks), so offsets match positions.
  const text = block.textBetween(0, block.content.size, undefined, "￼");
  for (const m of text.matchAll(COLOR_CODE)) {
    const color = parseColorCode(m[0]);
    if (!color) continue;
    const from = pos + 1 + m.index!;
    const style = `background-color: ${color.css}` + (color.fg ? `; color: ${color.fg}` : "");
    out.push(Decoration.inline(from, from + m[0].length, { class: "color-code", style }));
  }
}

const key = new PluginKey<DecorationSet>("colorCodes");

/**
 * Shows hex, rgb() and hsl() codes on their own colour, like an editor's
 * colour highlighter. Display only: nothing is added to the saved note. After
 * the first pass only the edited paragraphs are scanned again.
 */
export const ColorCodes = Extension.create({
  name: "colorCodes",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init(_, { doc }) {
            const decos: Decoration[] = [];
            doc.descendants((node, pos) => (node.isTextblock ? (decorateBlock(node, pos, decos), false) : true));
            return DecorationSet.create(doc, decos);
          },
          apply(tr, set) {
            if (!tr.docChanged) return set;
            set = set.map(tr.mapping, tr.doc);
            const size = tr.doc.content.size;
            tr.mapping.maps.forEach((map, i) => {
              const rest = tr.mapping.slice(i + 1);
              map.forEach((_oldFrom, _oldTo, from, to) => {
                const start = Math.max(0, rest.map(from, -1) - 1);
                const end = Math.min(size, rest.map(to, 1) + 1);
                tr.doc.nodesBetween(start, end, (node, pos) => {
                  if (!node.isTextblock) return true;
                  const decos: Decoration[] = [];
                  decorateBlock(node, pos, decos);
                  set = set.remove(set.find(pos, pos + node.nodeSize)).add(tr.doc, decos);
                  return false;
                });
              });
            });
            return set;
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});
