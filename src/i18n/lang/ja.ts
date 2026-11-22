import type { UIStrings } from "../types";

export default {
  nav: {
    home: "ホーム",
    posts: "記事一覧",
    tags: "タグ",
    about: "プロフィール",
    archives: "アーカイブ",
    search: "検索",
  },
  post: {
    publishedAt: "公開日",
    updatedAt: "更新日",
    sharePostIntro: "この記事をシェアする：",
    sharePostOn: "{{platform}}でシェアする",
    sharePostViaEmail: "メールでシェアする",
    tagLabel: "タグ",
    backToTop: "ページの先頭へ",
    tableOfContents: "目次",
    goBack: "戻る",
    editPage: "このページを編集",
    previousPost: "前の記事",
    nextPost: "次の記事",
  },
  pagination: {
    prev: "前へ",
    next: "次へ",
    page: "ページ",
  },
  home: {
    socialLinks: "SNS",
    featured: "おすすめ記事",
    recentPosts: "最新の記事",
    allPosts: "すべての記事",
  },
  footer: {
    copyright: "Copyright",
    allRightsReserved: "All rights reserved.",
  },
  pages: {
    tagTitle: "タグ",
    tagDesc: "このタグが付いた記事の一覧",

    tagsTitle: "タグ",
    tagsDesc: "記事に付いているタグの一覧",

    postsTitle: "記事一覧",
    postsDesc: "これまでに書いた記事の一覧",

    archivesTitle: "アーカイブ",
    archivesDesc: "公開した記事を年月ごとにまとめた一覧",

    searchTitle: "検索",
    searchDesc: "記事を検索する",
  },
  a11y: {
    skipToContent: "本文へスキップ",
    skipTableOfContents: "目次をスキップ",
    openMenu: "メニューを開く",
    closeMenu: "メニューを閉じる",
    toggleTheme: "ライト／ダークモードを切り替える",
    searchPlaceholder: "記事を検索...",
    noResults: "見つかりませんでした",
    goToPreviousPage: "前のページへ",
    goToNextPage: "次のページへ",
  },
  notFound: {
    title: "404 ページが見つかりません",
    message: "ページが見つかりません",
    goHome: "トップページへ戻る",
  },
} satisfies UIStrings;
