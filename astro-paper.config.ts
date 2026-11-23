import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://blog.admon-networks.com/",
    title: "Admonネットワーク",
    description: "本業ネットワークエンジニアの admon が、ネットワーク・サーバー・クラウドの検証やトラブルシュートを記録する技術ブログ",
    author: "admon",
    profile: "https://blog.admon-networks.com/profile/",
    ogImage: "default-og.png",
    lang: "ja",
    timezone: "Asia/Tokyo",
    dir: "ltr",
  },
  posts: {
    perPage: 10,
    perIndex: 5,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: false,
    },
    search: "pagefind",
    toc: true,
  },
  socials: [
    { name: "github", url: "https://github.com/admon-networks" },
    { name: "x",      url: "https://x.com/admon_networks" },
  ],
  shareLinks: [
    { name: "x",        url: "https://x.com/intent/post?url=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "mail",     url: "mailto:?subject=See%20this%20post&body=" },
  ],
});