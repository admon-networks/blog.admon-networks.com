/* eslint-disable no-console -- CLI スクリプトなので結果の表示に console を使う */
// 公開する記事（draft: true ではない記事）に、
// TODO（<!-- TODO）や広告の目印（<!-- AD:）が残っていないかを確かめる。
// 見つかったら、ファイル名と行番号を出して終了コード1で終わる。
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const POSTS_DIR = "src/content/posts";
const PATTERNS = ["<!-- TODO", "<!-- AD:"];

function isDraft(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return false;
  return /^draft:\s*true\s*(#.*)?$/m.test(match[1]);
}

const files = (await readdir(POSTS_DIR, { recursive: true }))
  .filter(file => file.endsWith(".md"))
  .sort();

const problems = [];
for (const file of files) {
  const filePath = path.join(POSTS_DIR, file);
  const source = await readFile(filePath, "utf8");
  if (isDraft(source)) continue;

  source.split(/\r?\n/).forEach((line, index) => {
    for (const pattern of PATTERNS) {
      if (line.includes(pattern)) {
        problems.push(`${filePath}:${index + 1}: ${pattern}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(
    "公開する記事に TODO または広告の目印が残っています（draft: true を付けるか、取り除いてください）:"
  );
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`check-posts: ${files.length} 件の記事を確認しました（問題なし）`);
