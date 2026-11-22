#!/usr/bin/env node
/* eslint-disable no-console -- CLI スクリプトなので進捗の表示に console を使う */
// WordPress（WXR）→ AstroPaper 用 Markdown 変換スクリプト
//
// 使い方（blog リポジトリのルートで）:
//   node scripts/wp2astro.mjs --xml <WXRファイル> --uploads <wp-content/uploads のコピー> \
//        [--out-drafts <下書きの出力先（リポジトリ外）>] [--report <レポートの出力先>]
//
// 出力:
//   src/content/posts/<slug>.md   公開済みの投稿
//   src/content/pages/<slug>.md   公開済みの固定ページ
//   src/assets/wp/YYYY/MM/<file>  記事から参照されている画像（位置情報などのメタデータを除去、長辺1600pxに縮小）
//   migration/redirects.json      旧スラッグ・旧URL → 新URL の対応表（CloudFront Function 用）
//   migration/urls.txt            公開URLの一覧（切り替え後の200確認用）
//   <report>                      手直しが必要な箇所の一覧（リポジトリ外に置く想定）
//   <out-drafts>/*.md             下書き（リポジトリ外に置く想定）

import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import sharp from "sharp";

// ---------- 引数 ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => {
    if (v.startsWith("--")) acc.push([v.slice(2), a[i + 1]]);
    return acc;
  }, [])
);
if (!args.xml || !args.uploads) {
  console.error("usage: node scripts/wp2astro.mjs --xml <file> --uploads <dir> [--out-drafts <dir>] [--report <file>]");
  process.exit(1);
}
const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "src/content/posts");
const PAGES_DIR = path.join(ROOT, "src/content/pages");
const ASSET_DIR = path.join(ROOT, "src/assets/wp");
const MIG_DIR = path.join(ROOT, "migration");
const DRAFTS_DIR = args["out-drafts"];
const REPORT = args.report || path.join(ROOT, "..", "wp-migration-report.md");
const SITE_HOSTS = ["blog.admon-networks.com", "tech-lablog.com", "www.tech-lablog.com", "admon-networks.com"];
const MAX_EDGE = 1600;

// ---------- XML 読み込み ----------
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  cdataPropName: false,
  parseTagValue: false,
  trimValues: false,
  isArray: name => ["item", "wp:postmeta", "category"].includes(name),
});
const channel = parser.parse(fs.readFileSync(args.xml, "utf8")).rss.channel;
const items = channel.item;
const text = v => (v == null ? "" : typeof v === "object" ? String(v["#text"] ?? "") : String(v));

const meta = it =>
  Object.fromEntries((it["wp:postmeta"] || []).map(m => [text(m["wp:meta_key"]), text(m["wp:meta_value"])]));

// 添付ファイル（アイキャッチの解決用）
const attachments = new Map();
for (const it of items) {
  if (text(it["wp:post_type"]) === "attachment") attachments.set(text(it["wp:post_id"]), text(it["wp:attachment_url"]));
}

const isPublished = it => text(it["wp:status"]) === "publish";
const docs = items.filter(it => ["post", "page"].includes(text(it["wp:post_type"])));
const published = docs.filter(isPublished);

// post_id → 新しいパス（内部リンクの /archives/96 や ?page_id=302 の解決用）
const idToPath = new Map(published.map(it => [text(it["wp:post_id"]), `/${text(it["wp:post_name"])}/`]));

// ---------- レポート ----------
const report = new Map(); // slug → [メッセージ]
const note = (slug, msg) => {
  if (!report.has(slug)) report.set(slug, []);
  report.get(slug).push(msg);
};

// ---------- ユーティリティ ----------
const decode = s =>
  s
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
const stripTags = s => s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
const JP = /[぀-ヿ一-鿿]/;
const CMD =
  /^\s*([#$>%]|(config|set|show|edit|end|next|exit|no|interface|ip|ipv6|router|sudo|apt|dnf|systemctl|aws|dig|nslookup|ping|curl|cat|ls|cd|git|terraform|docker|ipconfig|netsh|request|commit|load)\b)/;

// プレースホルダ（turndown に触らせたくない Markdown をここに退避する）
const stash = [];
const keep = md => `<p>@@STASH${stash.push(md) - 1}@@</p>`;
const unstash = md => md.replace(/@@STASH(\d+)@@/g, (_, i) => stash[Number(i)]);

const fence = (code, lang = "text", file = "") => {
  code = code.replace(/\n+$/, "");
  const ticks = code.includes("```") ? "````" : "```";
  const metaStr = file ? ` file="${file.replace(/\s+/g, "")}"` : "";
  return `${ticks}${lang}${metaStr}\n${code}\n${ticks}`;
};
const LANG_MAP = { plain: "text", undefined: "text", "": "text", sh: "bash", shell: "bash", conf: "text" };
const GENERIC_NAMES = new Set(["text", "plain", "bash", "shell", "hcl", "terraform", "json", "yaml", "nginx", "log", "output"]);

// ---------- 画像 ----------
const imageJobs = new Map(); // 出力先 → 入力元
function resolveUpload(url, slug) {
  const m = url.match(/\/wp-content\/uploads\/(\d{4})\/(\d{2})\/([^?#"]+)/);
  if (!m) return null;
  const [, y, mo, raw] = m;
  const name = decodeURIComponent(raw);
  const original = name.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1").replace(/-scaled(\.[a-z0-9]+)$/i, "$1");
  for (const cand of [original, name]) {
    const src = path.join(args.uploads, y, mo, cand);
    if (fs.existsSync(src)) {
      const outName = cand.replace(/\.(heic|heif)$/i, ".jpg");
      const dest = path.join(ASSET_DIR, y, mo, outName);
      imageJobs.set(dest, src);
      return dest;
    }
  }
  note(slug, `画像が見つからない: ${y}/${mo}/${name}`);
  return null;
}
const relFrom = (fromDir, abs) => {
  const r = path.relative(fromDir, abs).split(path.sep).join("/");
  return r.startsWith(".") ? r : `./${r}`;
};

// ---------- 本文の前処理（ブロック単位） ----------
function preprocess(html, slug, outDir) {
  let h = html.replace(/\r\n/g, "\n");

  // 削除するブロック
  const dropBlocks = [
    "jetpack/sharing-buttons",
    "post-featured-image",
    "post-navigation-link",
    "post-date",
    "spacer",
  ];
  for (const b of dropBlocks) {
    const re = new RegExp(`<!-- wp:${b}[\\s\\S]*?(\\/-->|<!-- \\/wp:${b} -->)`, "g");
    h = h.replace(re, "");
  }
  h = h.replace(/<!-- wp:jetpack\/sharing-button [\s\S]*?\/-->/g, "");
  if (/<!-- wp:block \{"ref":\d+\} \/-->/.test(h)) {
    note(slug, "再利用ブロック（シェア依頼など）を削除しました");
    h = h.replace(/<!-- wp:block \{"ref":\d+\} \/-->/g, "");
  }

  // Highlighting Code Block
  h = h.replace(
    /<!-- wp:loos-hcb\/code-block( \{[\s\S]*?\})? -->[\s\S]*?<pre class="prism[^"]*?lang-([a-z0-9_+-]+)[^"]*"[^>]*><code>([\s\S]*?)<\/code><\/pre>[\s\S]*?<!-- \/wp:loos-hcb\/code-block -->/g,
    (_, json, lang, code) => {
      let opts = {};
      try {
        opts = json ? JSON.parse(json) : {};
      } catch {}
      const l = LANG_MAP[opts.langType ?? lang] ?? opts.langType ?? lang;
      let file = opts.fileName || "";
      if (!file && opts.langName && !GENERIC_NAMES.has(String(opts.langName).toLowerCase())) file = opts.langName;
      return keep(fence(decode(code), l, file));
    }
  );

  // コードブロック（標準）
  h = h.replace(
    /<!-- wp:code[\s\S]*?-->\s*<pre class="wp-block-code"[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>\s*<!-- \/wp:code -->/g,
    (_, code) => keep(fence(decode(stripTags(code))))
  );

  // 整形済みブロック：文章なら段落、コマンドならコード
  h = h.replace(
    /<!-- wp:preformatted[\s\S]*?-->\s*<pre class="wp-block-preformatted[^"]*"[^>]*>([\s\S]*?)<\/pre>\s*<!-- \/wp:preformatted -->/g,
    (_, inner) => {
      const t = decode(stripTags(inner));
      const lines = t.split("\n").filter(l => l.trim());
      const isCode = !JP.test(t) ? lines.length > 0 && !/^\s*-\s/.test(lines[0]) : lines.some(l => CMD.test(l) && !JP.test(l));
      if (isCode) return keep(fence(t));
      return `<p>${inner.replace(/\n/g, "<br>")}</p>`;
    }
  );

  // VK アラート → コールアウト
  h = h.replace(
    /<!-- wp:vk-blocks\/alert[\s\S]*?-->\s*<div class="[^"]*vk_alert[^"]*alert-(\w+)[^"]*"><div class="vk_alert_content">([\s\S]*?)<\/div><\/div>\s*<!-- \/wp:vk-blocks\/alert -->/g,
    (_, kind, inner) => {
      const type = { info: "NOTE", success: "TIP", warning: "WARNING", danger: "CAUTION" }[kind] || "NOTE";
      return `<blockquote data-callout="${type}">${inner}</blockquote>`;
    }
  );

  // VK ボーダーボックス → タイトル付きコールアウト
  h = h.replace(
    /<!-- wp:vk-blocks\/border-box[\s\S]*?-->\s*<div class="wp-block-vk-blocks-border-box[^"]*">[\s\S]*?class="vk_borderBox_title">([\s\S]*?)<\/(?:h\d|p)><\/div><div class="vk_borderBox_body">([\s\S]*?)<\/div><\/div>\s*<!-- \/wp:vk-blocks\/border-box -->/g,
    (_, title, inner) => {
      const body = inner.trim();
      if (!stripTags(body).trim()) return ""; // シェアボタンだけの箱は削除
      return `<blockquote data-callout="NOTE" data-title="${stripTags(title).trim()}">${body}</blockquote>`;
    }
  );

  // ポチップ → リンク
  h = h.replace(/<!-- wp:pochipp\/linkbox (\{[\s\S]*?\}) \/-->/g, (_, json) => {
    try {
      const o = JSON.parse(json);
      const url = o.amazon_affi_url || o.amazon_detail_url || o.rakuten_detail_url || "";
      note(slug, `ポチップをリンクに置き換え: ${o.title}`);
      return url ? `<p><a href="${url}" rel="nofollow sponsored">${o.title}</a>${o.info ? `（${o.info}）` : ""}</p>` : "";
    } catch {
      return "";
    }
  });

  // ショートコード
  h = h.replace(/<!-- wp:shortcode -->([\s\S]*?)<!-- \/wp:shortcode -->/g, (_, sc) => {
    note(slug, `ショートコードを置き換えが必要: ${sc.trim()}`);
    return `<p>TODO: ${sc.trim().replace(/[\[\]]/g, "")}</p>`;
  });

  // カスタムHTML（アフィリエイトなど）はそのまま残す
  h = h.replace(/<!-- wp:html -->([\s\S]*?)<!-- \/wp:html -->/g, (_, raw) => {
    const kind = /rakuten_widget/.test(raw) ? "楽天ウィジェット（script）" : /a8\.net/.test(raw) ? "A8バナー" : "カスタムHTML";
    note(slug, `${kind}をHTMLのまま残しました（表示とCSPの確認が必要）`);
    return keep(raw.trim());
  });

  // 画像
  h = h.replace(/<img\b[^>]*>/g, tag => {
    const src = (tag.match(/src="([^"]+)"/) || [])[1] || "";
    const alt = decode((tag.match(/alt="([^"]*)"/) || [])[1] || "");
    if (!/\/wp-content\/uploads\//.test(src)) return tag; // 外部画像（A8 など）はそのまま
    const dest = resolveUpload(src, slug);
    if (!dest) return "";
    if (!alt) note(slug, `alt が空の画像: ${path.basename(dest)}`);
    return `<img src="${relFrom(outDir, dest)}" alt="${alt.replace(/"/g, "&quot;")}">`;
  });

  // style 属性・不要な装飾タグを除去
  h = h.replace(/\sstyle="[^"]*"/g, "");
  h = h.replace(/<\/?(mark|span)\b[^>]*>/g, "");
  h = h.replace(/\sclass="(wp-|has-|is-)[^"]*"/g, "");

  // 内部リンク
  h = h.replace(/href="(https?:\/\/([^/"]+)([^"]*))"/g, (all, url, host, rest) => {
    if (!SITE_HOSTS.includes(host)) return all;
    let p = rest || "/";
    const arch = p.match(/^\/archives\/(\d+)/) || p.match(/[?&](?:p|page_id)=(\d+)/);
    if (arch) {
      if (idToPath.has(arch[1])) return `href="${idToPath.get(arch[1])}"`;
      note(slug, `解決できない内部リンク: ${url}`);
      return all;
    }
    if (p.startsWith("/wp-content/uploads/")) return all;
    if (!/\.[a-z0-9]+$/i.test(p.split(/[?#]/)[0]) && !/\/($|[?#])/.test(p)) p = p.replace(/^([^?#]*)/, "$1/");
    return `href="${p}"`;
  });

  // ブロックコメントを除去
  h = h.replace(/<!-- \/?wp:[\s\S]*?-->/g, "");
  return h;
}

// ---------- HTML → Markdown ----------
const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});
td.use(gfm);
td.keep(["details", "summary", "script", "iframe"]);
td.addRule("figcaption", {
  filter: "figcaption",
  replacement: c => (c.trim() ? `\n\n*${c.trim()}*\n\n` : ""),
});
td.addRule("callout", {
  filter: node => node.nodeName === "BLOCKQUOTE" && node.getAttribute("data-callout"),
  replacement: (content, node) => {
    const type = node.getAttribute("data-callout");
    const title = node.getAttribute("data-title");
    const head = `> [!${type}]${title ? ` ${title}` : ""}`;
    const body = content
      .trim()
      .split("\n")
      .map(l => (l ? `> ${l}` : ">"))
      .join("\n");
    return `\n\n${head}\n${body}\n\n`;
  },
});

function toMarkdown(html, slug, outDir) {
  const pre = preprocess(html, slug, outDir);
  let md = td.turndown(pre);
  md = unstash(md);
  md = md.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  if (/^# /m.test(md.replace(/(`{3,})[\s\S]*?\1/g, ""))) note(slug, "本文に h1 があります（タイトルと重複するので h2 に下げるのがおすすめ）");
  return md;
}

// ---------- frontmatter ----------
const yamlStr = s => JSON.stringify(s); // JSON 文字列は YAML として有効
const iso = gmt => (gmt && !gmt.startsWith("0000") ? new Date(gmt.replace(" ", "T") + "Z").toISOString() : null);

function describe(it, md, slug) {
  const m = meta(it);
  let d = (m._yoast_wpseo_metadesc || text(it["excerpt:encoded"])).trim();
  if (!d) {
    const plain = md
      .replace(/```[\s\S]*?```/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[#>*_`|-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    d = plain.slice(0, 110) + (plain.length > 110 ? "…" : "");
    note(slug, "description を本文の冒頭から自動生成しました（自分の言葉に直すのがおすすめ）");
  }
  return d;
}

function terms(it) {
  const set = new Set();
  for (const c of it.category || []) {
    const name = decode(text(c)).trim();
    if (name && name !== "未分類" && name.toLowerCase() !== "uncategorized") set.add(name);
  }
  return [...set];
}

// ---------- 変換 ----------
fs.mkdirSync(POSTS_DIR, { recursive: true });
fs.mkdirSync(PAGES_DIR, { recursive: true });
fs.mkdirSync(MIG_DIR, { recursive: true });

const redirects = {};
const urls = [];
let nPost = 0,
  nPage = 0,
  nDraft = 0;

for (const it of docs) {
  const type = text(it["wp:post_type"]);
  const status = text(it["wp:status"]);
  const id = text(it["wp:post_id"]);
  let slug = decodeURIComponent(text(it["wp:post_name"])) || `post-${id}`;
  const title = decode(text(it.title)).trim();
  const html = text(it["content:encoded"]);

  if (status !== "publish") {
    if (status === "trash" || !DRAFTS_DIR) continue;
    fs.mkdirSync(DRAFTS_DIR, { recursive: true });
    const md = td.turndown(html.replace(/<!-- \/?wp:[\s\S]*?-->/g, ""));
    fs.writeFileSync(path.join(DRAFTS_DIR, `${slug.replace(/[\\/]/g, "_")}.md`), `# ${title}\n\n${md}\n`);
    nDraft++;
    continue;
  }

  const outDir = type === "post" ? POSTS_DIR : PAGES_DIR;
  const md = toMarkdown(html, slug, outDir);
  const m = meta(it);
  const fm = [`title: ${yamlStr(title)}`];

  if (type === "post") {
    fm.push(`description: ${yamlStr(describe(it, md, slug))}`);
    const pub = iso(text(it["wp:post_date_gmt"])) || new Date(text(it["wp:post_date"]).replace(" ", "T") + "+09:00").toISOString();
    const mod = iso(text(it["wp:post_modified_gmt"]));
    fm.push(`pubDatetime: ${pub}`);
    if (mod && new Date(mod) - new Date(pub) > 24 * 3600 * 1000) fm.push(`modDatetime: ${mod}`);
    const tags = terms(it);
    fm.push(`tags: [${(tags.length ? tags : ["others"]).map(yamlStr).join(", ")}]`);
    if (m._thumbnail_id && attachments.has(m._thumbnail_id)) {
      const dest = resolveUpload(attachments.get(m._thumbnail_id), slug);
      if (dest) fm.push(`ogImage: ${yamlStr(relFrom(outDir, dest))}`);
    }
    nPost++;
  } else {
    const d = (m._yoast_wpseo_metadesc || "").trim();
    if (d) fm.push(`description: ${yamlStr(d)}`);
    nPage++;
  }

  fs.writeFileSync(path.join(outDir, `${slug}.md`), `---\n${fm.join("\n")}\n---\n\n${md}`);
  urls.push(`/${slug}/`);

  // 旧スラッグ・旧形式URL → 新URL
  for (const pm of it["wp:postmeta"] || []) {
    if (text(pm["wp:meta_key"]) === "_wp_old_slug") {
      const old = decodeURIComponent(text(pm["wp:meta_value"]));
      if (old && old !== slug) redirects[`/${old}/`] = `/${slug}/`;
    }
  }
  redirects[`/archives/${id}/`] = `/${slug}/`;
}

// ---------- 画像のコピー（メタデータ除去・縮小） ----------
let nImg = 0;
for (const [dest, src] of imageJobs) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // sharp はデフォルトで EXIF（位置情報など）を出力しない
  await sharp(src)
    .rotate() // EXIF の向きを反映してから捨てる
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .toFile(dest);
  nImg++;
}

fs.writeFileSync(path.join(MIG_DIR, "redirects.json"), JSON.stringify(redirects, null, 2) + "\n");
fs.writeFileSync(path.join(MIG_DIR, "urls.txt"), urls.sort().join("\n") + "\n");

const lines = ["# WordPress 移行レポート", "", `投稿 ${nPost} / 固定ページ ${nPage} / 画像 ${nImg} / 下書き ${nDraft}`, ""];
for (const [slug, msgs] of [...report].sort()) {
  lines.push(`## ${slug}`, ...[...new Set(msgs)].map(x => `- ${x}`), "");
}
fs.writeFileSync(REPORT, lines.join("\n"));
console.log(`投稿 ${nPost} / 固定ページ ${nPage} / 画像 ${nImg} / 下書き ${nDraft}`);
console.log(`レポート: ${REPORT}`);
