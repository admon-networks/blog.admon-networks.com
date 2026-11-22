/* eslint-disable no-console -- CLI スクリプトなので結果の表示に console を使う */
// 意味のないファイル名（日本語・ChatGPT-Image・image-1 など）の画像を
// 「記事のスラッグ-連番」に変え、記事の中の参照も書き換える。
// 使い方: node scripts/rename-images.mjs        （変更内容の表示だけ）
//         node scripts/rename-images.mjs --apply（実際に変更する）
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const CONTENT_DIRS = ["src/content/posts", "src/content/pages"];
const ASSET_ROOT = "src/assets/wp";
// 名前を変える対象：ASCII 以外を含む名前、または意味のない定型の名前
const NEEDS_RENAME =
  /[^\x20-\x7e]|^(image(-\d+)?|img_\d+|ChatGPT-Image.*|[0-9a-f]{8}-[0-9a-f]{4}-.*)\.[a-z]+$/i;
const REF = /\.\.\/\.\.\/assets\/wp\/[^)"\s]+/g;

const files = CONTENT_DIRS.flatMap(d =>
  fs.readdirSync(d).filter(f => /\.mdx?$/.test(f)).map(f => path.join(d, f))
);

// 画像ごとに「どの記事から参照されているか」を集める（出現順）
const owners = new Map();
for (const file of files) {
  for (const ref of fs.readFileSync(file, "utf8").match(REF) ?? []) {
    const rel = ref.replace("../../assets/wp/", "");
    if (!owners.has(rel)) owners.set(rel, new Set());
    owners.get(rel).add(path.basename(file).replace(/\.mdx?$/, ""));
  }
}

// 新しい名前を決める
const renames = new Map(); // 旧パス → 新パス（assets/wp からの相対）
const counters = new Map();
for (const [rel, slugs] of owners) {
  const base = path.basename(rel);
  if (!NEEDS_RENAME.test(base)) continue;
  const slug = [...slugs][0];
  if (slugs.size > 1) console.warn(`! 複数の記事で使用: ${rel}（${[...slugs].join(", ")}）`);
  let next;
  do {
    const n = (counters.get(slug) ?? 0) + 1;
    counters.set(slug, n);
    next = path.join(path.dirname(rel), `${slug}-${String(n).padStart(2, "0")}${path.extname(base).toLowerCase()}`);
  } while (fs.existsSync(path.join(ASSET_ROOT, next)));
  renames.set(rel, next);
  console.log(`${rel}\n  → ${next}`);
}

if (apply) {
  for (const [from, to] of renames) {
    fs.renameSync(path.join(ASSET_ROOT, from), path.join(ASSET_ROOT, to));
  }
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const out = text.replace(REF, ref => {
      const rel = ref.replace("../../assets/wp/", "");
      return renames.has(rel) ? `../../assets/wp/${renames.get(rel)}` : ref;
    });
    if (out !== text) fs.writeFileSync(file, out);
  }
  console.log(`\n${renames.size} 件の画像の名前を変更しました`);
} else {
  console.log(`\n${renames.size} 件が対象（確認のみ。変更するには --apply を付けて実行）`);
}
