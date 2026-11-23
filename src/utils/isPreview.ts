/**
 * プレビュー用のビルド（Cloudflare Pages）かどうか。
 *
 * ビルド時の環境変数 `PUBLIC_PREVIEW=true` のときだけ true になる。
 * 本番（main から AWS へデプロイするビルド）ではこの変数を設定しないので、
 * 常に false になり、本番の動作は変わらない。
 */
export const isPreview = import.meta.env.PUBLIC_PREVIEW === "true";
