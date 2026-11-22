/* eslint-disable no-console -- CLI スクリプトなので結果の表示に console を使う */
// 記事のタグの表記ゆれをまとめる。
// 使い方: node scripts/normalize-tags.mjs        （変更内容の表示だけ）
//         node scripts/normalize-tags.mjs --apply（実際に書き換える）
import fs from "node:fs";
import path from "node:path";

// 旧タグ → 新タグ
const TAG_MAP = {
  "ネットワーク/ Network": "ネットワーク",
  サーバ: "サーバー",
  "セキュリティ / Security": "セキュリティ",
  "無線 / Wireless": "無線",
  Wireless: "無線",
  IT就職: "IT転職",
  "IT就職・転職": "IT転職",
  BGP設定: "BGP",
  LAB: "検証環境",
  pppoe: "PPPoE",
};

const apply = process.argv.includes("--apply");
const dir = "src/content/posts";

for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".md"))) {
  const full = path.join(dir, file);
  const text = fs.readFileSync(full, "utf8");
  const m = text.match(/^(---\n[\s\S]*?\ntags:\s*)\[([\s\S]*?)\]/);
  if (!m) continue;

  const before = JSON.parse(`[${m[2].replace(/,\s*$/, "")}]`);
  const after = [...new Set(before.map(t => TAG_MAP[t] ?? t))];
  if (JSON.stringify(before) === JSON.stringify(after)) continue;

  console.log(`${file}\n  - ${before.join(", ")}\n  + ${after.join(", ")}`);
  if (apply) {
    const list = after.map(t => JSON.stringify(t)).join(", ");
    fs.writeFileSync(full, text.replace(m[0], `${m[1]}[${list}]`));
  }
}
if (!apply) console.log("\n（確認のみ。書き換えるには --apply を付けて実行）");
