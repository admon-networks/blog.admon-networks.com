---
title: "CCNA合格体験記｜未経験1〜2か月で一発合格、2年後の振り返り"
description: "CCNAにネットワークの知識ほぼゼロから独学で、勉強期間1〜2か月・合計50〜100時間で一発合格した体験記です。Ping-tと白本の使い方、直前2週間の過ごし方、合格から約2年たって実務やCCNP ENCORで役立ったこと・使わなかったことをまとめました。"
pubDatetime: 2026-11-28T21:00:00+09:00
tags: ["CCNA", "Cisco", "資格", "ネットワーク", "未経験"]
ogImage: "../../assets/posts/eyecatch-ccna-pass-review.png"
draft: true
---

> [!NOTE]
> この記事には広告（アフィリエイトリンク）を含みます。

CCNA（Cisco Certified Network Associate）に、ネットワークの知識がほぼゼロの状態から、独学で一発合格しました。勉強期間は1〜2か月、勉強時間は合計で50〜100時間くらいです。受験したのは2024年の秋なので、合格から約2年たちました。

一番効いた教材はPing-tです。白本は最初に途中まで読み、あとは辞書がわりに使いました。

合格したあと、実務ではVLANやルーティングの基礎知識に助けられることが多かったです。一方で、合格してしばらくは「知識として知っている」で止まっていました。**もう一度勉強するなら、Ping-tの演習はそのままに、ラボをもっと丁寧にやります。**

## 受験の概要

| 項目                     | 内容                             |
| ------------------------ | -------------------------------- |
| 受験した時期             | 2024年秋                         |
| 受験した時点の立場       | IT企業に入社後                   |
| 受験前のネットワーク知識 | ほぼゼロ                         |
| 勉強のしかた             | 独学                             |
| 受験の形式               | テストセンター                   |
| 受験の回数               | 1回（一発合格）                  |
| 勉強期間                 | 1〜2か月                         |
| 勉強時間の合計           | 50〜100時間くらい                |
| 勉強した時間帯           | 通勤中、平日の夜、直前の詰め込み |

## CCNAを受けた背景

私は営業職からIT企業に転職しました。未経験からの転職の経緯は、[東京都デジタル人材育成支援事業の体験記](/tokyo-digital-jinzai-review/)に書いています。

入社した時点で、ネットワークの知識はほぼありませんでした。未経験なので、まず基礎を固めたい。CCNAを受けたのは、それが理由です。

試験の範囲は、Ciscoの<a href="https://www.cisco.com/c/ja_jp/training-events/training-certifications/certifications/associate/ccna.html" target="_blank" rel="noopener noreferrer">CCNA公式ページ</a>で確認できます。

## 使った教材

| 種類                 | 教材                        | 使い方                                         |
| -------------------- | --------------------------- | ---------------------------------------------- |
| Web問題演習          | Ping-t（有料版）            | 勉強の中心。間違えた問題を直前に解き直した     |
| 入門書               | 1週間でCCNAの基礎が学べる本 | 白本の前に、なんとなく理解を深めるために使った |
| 参考書               | 白本                        | 最初に途中まで読み、あとは辞書がわり           |
| 問題集               | 黒本                        | 重くて、あまり使わなかった                     |
| ネットワーク実習環境 | Packet Tracer               | 直前の2週間くらいで、設定の練習に使った        |

このほかに、動画も少し見ました。Packet Tracerは、Ciscoが提供しているネットワークのシミュレーターです。パソコンの上にルーターやスイッチを並べて、コマンドで設定できます。

白本（『シスコ技術者認定教科書 CCNA 完全合格テキスト＆問題集』）は、最初から最後まで読み通したわけではありません。知識がまっさらな時期に途中まで読んで、そのあとはPing-tで出てきた言葉や仕組みを引く辞書として使いました。

<div style="border:1px solid #dfdfd9;border-radius:10px;padding:22px;background:#fafaf7;margin:32px 0;">
<p style="margin:0 0 6px;font-size:0.78em;letter-spacing:.08em;color:#2056c7;font-weight:700;">辞書がわりに手元に置くなら</p>
<p style="margin:0 0 12px;font-weight:700;font-size:1.08em;line-height:1.6;">シスコ技術者認定教科書 CCNA 完全合格テキスト＆問題集 第2版（白本）</p>
<p style="margin:0 0 16px;font-size:0.95em;line-height:1.9;">私は知識がまっさらな時期に途中まで読み、Ping-tの演習に移ってからは、問題で出てきた言葉や仕組みを引く辞書がわりに使いました。問題演習を中心に進めるときも、手元に置いておくと調べ物に使えます。</p>
<table border="0" cellpadding="0" cellspacing="0"><tr><td><div style="border:1px solid #95a5a6;border-radius:.75rem;background-color:#FFFFFF;width:280px;margin:0px;padding:5px;text-align:center;overflow:hidden;"><table><tr><td style="width:128px"><a href="https://hb.afl.rakuten.co.jp/ichiba/59e14a95.c9d9180b.59e14a96.28511920/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fbook%2F18222286%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIxMjh4MTI4IiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;"><img src="https://hbb.afl.rakuten.co.jp/hgb/59e14a95.c9d9180b.59e14a96.28511920/?me_id=1213310&item_id=21599532&pc=https%3A%2F%2Fthumbnail.image.rakuten.co.jp%2F%400_mall%2Fbook%2Fcabinet%2F1034%2F9784798191034_1_135.jpg%3F_ex%3D128x128&s=128x128&t=picttext" border="0" style="margin:2px" alt="『シスコ技術者認定教科書 CCNA 完全合格テキスト＆問題集 第2版』の表紙" title="[商品価格に関しましては、リンクが作成された時点と現時点で情報が変更されている場合がございます。]"></a></td><td style="vertical-align:top;width:136px;display: block;"><p style="font-size:12px;line-height:1.4em;text-align:left;margin:0px;padding:2px 6px;word-wrap:break-word"><a href="https://hb.afl.rakuten.co.jp/ichiba/59e14a95.c9d9180b.59e14a96.28511920/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fbook%2F18222286%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIxMjh4MTI4IiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;">シスコ技術者認定教科書 CCNA 完全合格テキスト＆問題集［対応試験］200-301 第2版 （EXAMPRESS） [ SAK University 東京イノベーションキャンパス 林口 裕志 ]</a><br><span >価格：4,620円（税込、送料無料)</span> <span style="color:#BBB">(2026/11/28時点)</span></p></td></tr></table></div><br><p style="color:#000000;font-size:12px;line-height:1.4em;margin:5px;word-wrap:break-word"></p></td></tr></table>
</div>

黒本も持っていましたが、正直なところ、重くてあまり使いませんでした。

## 勉強の進め方

### 最初は入門書でなんとなくつかみ、白本を途中まで読んだ

知識がまっさらだったので、白本に入る前に、『1週間でCCNAの基礎が学べる本』でなんとなく理解を深めました。そのあと白本を読み始めましたが、最後までは読んでいません。途中まで読んで、言葉や仕組みが少し頭に入ったところで、Ping-tに切り替えました。

### 中盤はPing-tに切り替え、白本は辞書にした

ここからはPing-tが勉強の中心です。問題を解いて、わからないところが出てきたら白本で引く。この繰り返しでした。

Ping-tが一番効いた理由は、2つあります。ひとつは、問題を解くと覚えられることです。もうひとつは、間違えたところを、学び直そうと思えることです。

<!-- AD: Ping-t（アフィリエイトがある場合のみ。なければこの目印を削除し、リンクも貼らない） -->

### 直前の2週間は、間違えた問題と苦手分野に絞った

試験の前の2週間くらいは、やることを3つに絞りました。

- Ping-tで間違えた問題だけを解き直す
- 白本で、苦手なところを読み直す
- Packet Tracerで、設定の練習をする

勉強した時間帯は、通勤中と平日の夜が中心でした。直前は詰め込みです。

### 苦手だった分野

苦手だったのは、次の分野です。

- STP（Spanning Tree Protocol）
- OSPF（Open Shortest Path First）・ルーティング
- 無線・セキュリティ・自動化

無線のうち、WLC（Wireless LAN Controller）まわりの仕組みは、このブログで[CAPWAPの仕組みとセッション確立の手順](/capwap/)、[LAPがWLCを見つける仕組み](/lap-wlc-discovery-process/)、[WLCのモビリティグループ](/cisco-wlc-mobility-group/)としてまとめています。

## 受験当日と結果

試験当日はかなり緊張しました。。。

問題文では、いわゆる「Cisco語」がわかりにくかったです。英語の原文を訳した、独特な日本語のことです。記憶で書いているので実際の表記とは違うかもしれませんが、たとえばVLANを「仮想LAN」とするような、変に訳された用語が出てきました。

時間は20分くらい余りました。シミュレーション問題は、思っていたより基礎的で驚きました。試験の内容に関わるので、何を問われたかは書きません。

試験が終わったとき、画面に「Pending」と表示されたような気がします。記憶があいまいですが、そのときは「ダメだったかもしれない」と思いました。帰りの電車では、ずっと結果を確認していました。合格の結果が出たのは、その日の夜か、翌日の夜です。

未経験からチャレンジしたこともあって、落ちたかもしれないという気持ちが強かったので、合格がわかったときは率直に嬉しかったです。

## 合格から約2年、実務で役立ったこと・使わなかったこと

ここからは、合格から約2年たった今の振り返りです。

### 役立ったのはVLANとルーティングの基礎

実務では、VLAN（Virtual LAN）とルーティングの基礎知識に助けられることが多かったです。

### STPやHSRPは、しばらく使わなかった

反対に、STPやHSRP（Hot Standby Router Protocol）は、実務でしばらく使いませんでした。

STPは、関わった案件がL3中心のものが多く、あえてSTPを使わずに済む設計の案件が多かったからです。HSRPは、簡単な案件がしばらく続き、機器を冗長化しないシングル構成が多かったからです。

### CCNP ENCORには、CCNAの知識がそのまま使えた

その後に勉強したCCNP ENCOR（CCNP Enterpriseのコア試験）では、ルーティングやSTPなどは、CCNAを少し深くした程度でした。CCNAで覚えたことが、そのまま使えました。

自動化は、もっと難しかった記憶があります。ENCORで出てくる自動化の道具については、[Ansible・Chefなどの違いをまとめた記事](/cisco-ccnp-encor-ansible-chef-etc/)を書いています。

### ネスペには、CCNAより実務のほうがつながった

ネットワークスペシャリスト試験（ネスペ）の勉強につながったのは、CCNAよりも、実務での設計や作業の経験でした。ネスペの勉強のしかたは、[ネスペ2026のCBT受験記](/nespe-2026-review/)にまとめています。

### もう一度やるなら、ラボをもっと丁寧にやる

もう一度CCNAを勉強するなら、Ping-tの演習はそのままやります。ただ、ラボはもっと丁寧にやります。合格しても、しばらくは「知識として知っている」で止まっていたからです。

具体的には、白本やPing-tで出てきた構成を実際に組んでみて、`show`コマンドで状態を見ながら理解を深めます。

## これからCCNAを受ける人へ

CCNAは、ネットワークを体系的に理解する手段として有効でした。私はネットワークの知識がほぼゼロの状態から、1〜2か月で合格まで届きました。

<div style="border:1px solid #dfdfd9;border-radius:10px;padding:22px;background:#fafaf7;margin:32px 0;">
<p style="margin:0 0 6px;font-size:0.78em;letter-spacing:.08em;color:#2056c7;font-weight:700;">白本の前の1冊に</p>
<p style="margin:0 0 12px;font-weight:700;font-size:1.08em;line-height:1.6;">1週間でCCNAの基礎が学べる本 第3版</p>
<p style="margin:0 0 16px;font-size:0.95em;line-height:1.9;">私は白本に入る前に、なんとなく理解を深めるためにこの本を使いました。ネットワークの知識がほぼゼロから始める人が、白本などの参考書に入る前に全体をつかむ1冊として使えます。</p>
<table border="0" cellpadding="0" cellspacing="0"><tr><td><div style="border:1px solid #95a5a6;border-radius:.75rem;background-color:#FFFFFF;width:280px;margin:0px;padding:5px;text-align:center;overflow:hidden;"><table><tr><td style="width:128px"><a href="https://hb.afl.rakuten.co.jp/ichiba/5a127c35.477c9ea7.5a127c36.2eddcb19/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fvaboo%2Fva0731501429u20%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIxMjh4MTI4IiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;"><img src="https://hbb.afl.rakuten.co.jp/hgb/5a127c35.477c9ea7.5a127c36.2eddcb19/?me_id=1273418&item_id=18396373&pc=https%3A%2F%2Fthumbnail.image.rakuten.co.jp%2F%400_mall%2Fvaboo%2Fcabinet%2Fitems%2Fbk0125%2Fim250303581278.jpg%3F_ex%3D128x128&s=128x128&t=picttext" border="0" style="margin:2px" alt="『1週間でCCNAの基礎が学べる本 第3版』の表紙" title="[商品価格に関しましては、リンクが作成された時点と現時点で情報が変更されている場合がございます。]"></a></td><td style="vertical-align:top;width:136px;display: block;"><p style="font-size:12px;line-height:1.4em;text-align:left;margin:0px;padding:2px 6px;word-wrap:break-word"><a href="https://hb.afl.rakuten.co.jp/ichiba/5a127c35.477c9ea7.5a127c36.2eddcb19/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fvaboo%2Fva0731501429u20%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIxMjh4MTI4IiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;">【中古】1週間でCCNAの基礎が学べる本 第3版/インプレス/宮田かおり（単行本（ソフトカバー））</a><br><span >価格：2,205円（税込、送料無料)</span> <span style="color:#BBB">(2026/11/28時点)</span></p></td></tr></table></div><br><p style="color:#000000;font-size:12px;line-height:1.4em;margin:5px;word-wrap:break-word"></p></td></tr></table>
</div>

取る意義はあるので、ぜひ頑張ってみてください。
