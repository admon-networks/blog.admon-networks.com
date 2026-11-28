---
title: "Cloudflare Pagesに海外から大量アクセス｜大半はボットか"
description: "Cloudflareのアカウント分析で米国を中心に海外アクセスが突出。原因は本番ではなくCloudflare Pagesのプレビュー環境（pages.dev）でした。4xxやHTTP/1.1の比率からボットと見た根拠と、課金への影響をまとめました。"
pubDatetime: 2026-11-30T21:00:00+09:00
draft: true
tags: ["Cloudflare", "Web", "クラウド", "トラブルシュート"]
ogImage: "../../assets/posts/eyecatch-cloudflare-pages-preview-bot-traffic.png"
---

Cloudflareのアカウント分析で、国別のリクエストの1位が米国（United States）の4.68kと、2位のフランス（659）の約7倍もありました。調べてみると、これは本番のブログへのアクセスではなく、Cloudflare Pagesで動かしているプレビュー環境（`*.pages.dev`）への海外アクセスでした。

4xxエラーの多さ、HTMLだけが取られている比率、HTTP/1.1の多さから、大半はボットによるアクセスだと私は見ています。ただし、アクセスしてきたパスやUser-Agentまでは見られていないので、これは推測です。静的サイトなので実害はなく、Cloudflare側でもAWS側でも課金は発生しません。

確認した環境と時期は次のとおりです。

| 項目                           | 内容                                               |
| ------------------------------ | -------------------------------------------------- |
| サイト                         | Astro（AstroPaper）の静的サイト                    |
| 本番                           | S3＋CloudFront（GitHub ActionsからOIDCでデプロイ） |
| プレビュー                     | Cloudflare Pages（PRのブランチを自動でビルド）     |
| Cloudflareのアカウント         | 無料アカウント。ドメインは登録していない（0件）    |
| Cloudflare Pagesをつないだ時期 | 2026年11月22〜23日ごろ                             |
| 確認した日                     | 2026年11月28日（集計期間は「過去7日間」）          |

プレビュー環境では下書きの記事も表示していて、`noindex`を付け、GA4のタグは出していません。本番のデプロイの仕組みは[OIDCとは？GitHub ActionsとAWS連携の仕組み](/github-actions-oidc-aws/)に書いています。

## 米国からのリクエストが4.68kと突出していた

Cloudflareのアカウント分析で、過去7日間の国別のリクエスト数は次のとおりでした。

| 国             | リクエスト |
| -------------- | ---------- |
| United States  | 4.68k      |
| France         | 659        |
| Netherlands    | 474        |
| Poland         | 456        |
| United Kingdom | 454        |
| Japan          | 438        |
| China          | 371        |
| Germany        | 348        |

<!-- TODO: 画像（ファイル名案：src/assets/posts/cloudflare-pages-preview-bot-traffic/country-requests-top8.png／アカウント分析の国別リクエスト。地図と上位8か国が写った画面。アカウント名・アカウントIDを塗りつぶす） -->

このブログは、再開してからのPVが300ほどで、アクセスは日本からが中心です（1年目のアクセスの記録は[【2025年振り返り】技術ブログ開始1年の変化｜月300PVの記録](/2025-tech-lab-1year-review/)にまとめています）。それにしてはリクエストが多すぎるうえに、ほとんどが米国からだったので、最初は攻撃を受けているのかと思いました。

いちばん心配したのは課金です。静的サイトにしていたので、乗っ取りの心配はそれほどしていませんでした。

リクエスト数のグラフを見ると、期間の最初の1〜2日はゼロで、そこからリクエストが出始めていました。前の期間比は+100%と表示されていました。

## 原因：本番ではなくプレビュー環境へのアクセスだった

### Cloudflareにドメインがなく、本番はCloudflareを通っていない

国やASN（Autonomous System Number：インターネット上のネットワークごとに割り当てられた番号）、パス、User-Agentで絞り込んで見る機能は、ドメイン（ゾーン）ごとの分析画面にあります（<a href="https://developers.cloudflare.com/support/analytics/essentials/understanding-cloudflare-site-analytics/" target="_blank" rel="noopener noreferrer">Cloudflare Docs：Understanding Cloudflare site analytics</a>）。どこから何を取りに来ているのかを見ようと、ドメインごとの分析を開こうとしたところ、Cloudflareにはドメインが1件も登録されていませんでした。

<!-- TODO: 画像（ファイル名案：src/assets/posts/cloudflare-pages-preview-bot-traffic/domains-list-empty.png／Cloudflareのドメイン一覧が0件（データなし）の画面。アカウント名・アカウントIDを塗りつぶす） -->

本番のブログはS3＋CloudFrontで配信していて、Cloudflareを通っていません。旧ドメインからの転送もCloudFrontで動かしていて、その構成は[CloudFrontで旧ドメインを新ドメインへ301リダイレクト](/cloudfront-functions-legacy-domain-redirect/)に書きました。

**つまり、アカウント分析の数字は、本番ではなくプレビュー環境（`*.pages.dev`）へのリクエストでした。**

### Pagesのメトリクスが0件なのは、Functionsを使っていないから

Pagesのプロジェクトの画面にもメトリクスがありますが、こちらは0件でした。このメトリクスは、Pages Functions（Pagesでサーバー側の処理を動かす機能）の実行を数えるものです（<a href="https://developers.cloudflare.com/pages/functions/metrics/" target="_blank" rel="noopener noreferrer">Cloudflare Docs：Pages Functions metrics</a>）。このブログはFunctionsを使っていない静的サイトなので、アクセスがあっても0のままです。

<!-- TODO: 画像（ファイル名案：src/assets/posts/cloudflare-pages-preview-bot-traffic/pages-metrics-zero.png／Pagesのプロジェクトのメトリクスが0件の画面。アカウント名・アカウントID・Pagesのプロジェクト名とURLを塗りつぶす） -->

### 大半はボットと見ている（推測）

アクセスのログは見られないので、アカウント分析を下までスクロールして、エラー・HTTPのバージョン・TLSのバージョン・コンテンツタイプの内訳を確認しました。数字は次のとおりです（過去7日間）。

| 項目                  | 数字                                     |
| --------------------- | ---------------------------------------- |
| 4xxエラー             | 1.46k（42.10%）                          |
| 5xxエラー             | 0                                        |
| HTTPのバージョン      | HTTP/1.1 1.73k／HTTP/2 1.43k／HTTP/3 297 |
| TLSのバージョン       | TLSv1.3 3.11k／none 266／TLSv1.2 83      |
| コンテンツタイプ      | html 2.28k／webp 671／css 117／js 98     |
| 暗号化したリクエスト  | 3.19k（92.30%）                          |
| 暗号化した帯域        | 39.57MB（99.12%）                        |
| キャッシュ リクエスト | 0                                        |

<!-- TODO: 画像（ファイル名案：src/assets/posts/cloudflare-pages-preview-bot-traffic/errors-and-http-versions.png／アカウント分析のエラー（4xx・5xx）と、ネットワークのHTTPバージョンの画面。アカウント名・アカウントIDを塗りつぶす） -->

<!-- TODO: 画像（ファイル名案：src/assets/posts/cloudflare-pages-preview-bot-traffic/tls-versions-and-content-types.png／アカウント分析のネットワークのTLSバージョンとコンテンツタイプの画面。アカウント名・アカウントIDを塗りつぶす） -->

<!-- TODO: 画像（ファイル名案：src/assets/posts/cloudflare-pages-preview-bot-traffic/security-encrypted-requests.png／アカウント分析のセキュリティ（暗号化したリクエスト・暗号化した帯域）の画面。アカウント名・アカウントIDを塗りつぶす） -->

<!-- TODO: 確認（「キャッシュ リクエスト：0」について本文で触れるか。触れる場合、0をどう受け止めたか） -->

この数字から、大半は人ではなくボットのアクセスだと見ています。根拠は4つあります。

1つ目は、4xxエラーが42%あることです。普通にブログを読んでいるだけなら、404のようなエラーはほとんど出ません。

2つ目は、HTMLに対してCSSとJavaScriptが少ないことです。HTMLが2.28kあるのに、CSSは117、JSは98しかありません。人がブラウザーでページを開けば、HTMLと一緒にCSSやJSも読み込まれるはずです。

3つ目は、HTTP/1.1が約半分を占めていることです。今のブラウザーは、ほぼHTTP/2かHTTP/3を使います。

4つ目は、TLSのバージョンが「none」のものが266件あることです。これは`https://`ではなく`http://`で来ているリクエストです。

何を狙ったアクセスなのかはわかっていません。PHPやWordPressを狙うスキャナーが混じっているかもしれませんが、パスを確認できていないので、確かめようがありません。

ボットがプレビュー環境を見つけてきた経路も推測です。このブログのリポジトリは公開していて、PRにプレビューのURLを貼っています。`pages.dev`のURLは誰でもアクセスできるので、こうした場所からボットが見つけてきているのだと考えています。

### わかっていないこと

アクセスしてきたパス・User-Agent・ASNの内訳は、ドメインを登録していない無料アカウントでは見られませんでした。そのため、ボットだという見立ては、ここまでに書いた比率からの推測にとどまります。

もう1つ、件数の食い違いが残っています。国別では米国だけで4.68kあるのに、TLSのバージョンの内訳を足した全体は約3.46k（3.11k＋266＋83）で、数字が合いません。理由は確かめていないので、ここは未解明のままです。

## 対処：今回は設定を変えず、確認だけにした

今回は確認だけで、設定は何も変えていません。プレビュー環境には、そのうち制限をかけるつもりですが、まだやっていません。

<!-- TODO: 確認（プレビュー環境にどんな制限をかける予定か。書く場合、方法と時期） -->

## 検証：5xxは0件で、課金も発生していない

アクセスの多さに驚いたものの、サイトへの影響と課金を確かめると、問題はありませんでした。

| 確認したこと               | 結果                                                     |
| -------------------------- | -------------------------------------------------------- |
| サーバーエラー（5xx）      | 0件                                                      |
| 帯域                       | 暗号化した分で39.57MB（全体の99.12%）                    |
| Cloudflare Pagesの課金     | 静的ファイルへのリクエストは、無料プランでも無料・無制限 |
| 本番（CloudFront）への影響 | このアクセスは届いていない                               |

5xxは0件で、サイトは問題なく応答していました。帯域も、過去7日間で40MBに届かない程度です。

Cloudflare Pagesでは、静的ファイルへのリクエストは無料プランでも無料・無制限です（<a href="https://developers.cloudflare.com/pages/functions/pricing/" target="_blank" rel="noopener noreferrer">Cloudflare Docs：Pages Functions pricing</a>）。本番のCloudFrontには、このアクセスは届いていません。参考までに、CloudFrontの従量課金の無料枠は、毎月1TBのデータ転送、1,000万リクエスト、CloudFront Functionsの200万回の呼び出しです（<a href="https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/" target="_blank" rel="noopener noreferrer">Amazon CloudFront の料金</a>）。

## まとめ：比べる相手が違っていた

私は、本番のGA4のPV（約300）と、プレビュー環境のCloudflareのリクエスト数を比べて驚いていました。そもそも比べる相手が違っていました。GA4のPVは、本番でページのタグが動いたページビューの数です。一方、Cloudflareのアカウント分析のリクエスト数は、プレビュー環境に届いた画像やCSSも含めたリクエストの数で、プレビュー環境にはGA4のタグも入れていません。

もう1つの収穫は、ログがなくても、HTTPのバージョン・TLSのバージョン・コンテンツタイプの比率から、ボットらしさが見えてきたことです。パスやUser-Agentが見られない無料アカウントでも、ここまでは絞り込めました。

Cloudflareのアカウント分析で海外からのアクセスが突出していたら、次の順に確かめると切り分けやすいです。

- Cloudflareにドメインを登録しているか。登録していなければ、本番のアクセスは含まれていない
- Pagesのメトリクスが0件でも、Functionsを使っていない静的サイトなら正常
- 4xxの比率、HTMLとCSS・JSの比率、HTTP/1.1とTLSなし（none）の件数を見て、人のアクセスらしいかを判断する
- 課金は、Pagesの静的ファイルなら無料・無制限

それにしても、プレビュー環境が意外とこんなにリクエストを受けていたんだ、というのが正直な感想です。
