# blog.admon-networks.com

本業ネットワークエンジニアの admon が、ネットワーク・サーバー・クラウドの検証やトラブルシュートを記録する技術ブログ「Admonネットワーク」のソースです。

- サイト：https://blog.admon-networks.com/
- 構成：Astro（AstroPaper）で静的サイトを生成し、S3 + CloudFront で配信
- インフラ：[admon-networks/public-infra](https://github.com/admon-networks/public-infra) の `infra/blog` で Terraform 管理

## ライセンス

- **コード**（テーマ・スクリプト・設定）：MIT License（[LICENSE](./LICENSE)）。テーマは [AstroPaper](https://github.com/satnaing/astro-paper) をもとにしています
- **記事の文章と画像**（`src/content/` と `src/assets/wp/` など）：© admon. All rights reserved. 無断での転載・複製はご遠慮ください
