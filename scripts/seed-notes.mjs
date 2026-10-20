// Fills a data folder with realistic sample notes for speed and memory tests.
//
//   node scripts/seed-notes.mjs <data-folder> [count]
//   set WINDOWS_NOTES_DATA_DIR=<data-folder> and start the app
//
// Never point this at your real %APPDATA%\WindowsNotes folder.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const [dir, countArg] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node scripts/seed-notes.mjs <data-folder> [count]");
  process.exit(1);
}
const count = Number(countArg ?? 1000);

const WORDS = (
  "meeting budget travel recipe design invoice garden python family music project review plan idea draft " +
  "client launch report summary notes coffee weekend market train flight hotel book article research " +
  "deadline follow up call email agenda decision risk feature release backup search folder tag"
).split(" ");
const TAGS = ["work", "ideas", "travel", "recipes", "q4", "personal", "reading"];
const folders = [
  { id: "notes", name: "Notes", parentId: null },
  { id: "work", name: "Work", parentId: null },
  { id: "projects", name: "Projects", parentId: "work" },
  { id: "personal", name: "Personal", parentId: null },
  { id: "recipes", name: "Recipes", parentId: null },
];

let seed = 42;
const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
const sentence = (n) => {
  const w = Array.from({ length: n }, () => WORDS[rand(WORDS.length)]);
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  return w.join(" ") + ".";
};
const text = (t) => [{ type: "text", text: t }];

mkdirSync(join(dir, "notes"), { recursive: true });
writeFileSync(join(dir, "folders.json"), JSON.stringify(folders));

const now = Date.now();
for (let i = 0; i < count; i++) {
  const id = randomUUID().replaceAll("-", "");
  const title = `${sentence(3 + rand(4)).slice(0, -1)} ${i + 1}`;
  const tags = rand(3) === 0 ? [TAGS[rand(TAGS.length)]] : [];
  const blocks = [{ type: "heading", attrs: { level: 1 }, content: text(title) }];
  const paragraphs = 3 + rand(10);
  for (let p = 0; p < paragraphs; p++) {
    if (rand(5) === 0) {
      blocks.push({
        type: "bulletList",
        content: Array.from({ length: 2 + rand(4) }, () => ({ type: "listItem", content: [{ type: "paragraph", content: text(sentence(4 + rand(6))) }] })),
      });
    } else {
      blocks.push({ type: "paragraph", content: text(Array.from({ length: 1 + rand(4) }, () => sentence(6 + rand(14))).join(" ")) });
    }
  }
  if (tags.length) blocks.push({ type: "paragraph", content: text(`#${tags[0]}`) });
  const body = blocks.slice(1).map((b) => JSON.stringify(b).match(/"text":"([^"]*)"/g)?.map((m) => m.slice(8, -1)).join(" ") ?? "").join(" ");
  const ts = new Date(now - rand(400) * 86_400_000 - rand(86_400_000)).toISOString();
  const note = {
    id,
    folderId: folders[rand(folders.length)].id,
    title,
    snippet: body.slice(0, 120),
    tags,
    pinned: i < 3,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    content: { type: "doc", content: blocks },
  };
  writeFileSync(join(dir, "notes", `${id}.json`), JSON.stringify(note));
}
console.log(`Wrote ${count} notes to ${dir}`);
