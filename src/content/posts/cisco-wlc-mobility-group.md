---
title: "WLCモビリティグループとは？仕組み・設定・試験ポイントをわかりやすく解説"
description: "CCNP ENCORやCCNA試験のワイヤレス分野で出題されるWLCのモビリティグループについての解説です。"
pubDatetime: 2025-10-01T12:42:14.000Z
modDatetime: 2026-06-05T13:04:39.000Z
tags: ["CCNA", "CCNP ENCOR", "Cisco", "ネットワーク", "無線"]
ogImage: "../../assets/wp/2025/10/cisco-wlc-mobility-group-01.png"
---

## 概要

CCNAやCCNPでも出題されるWLCのモビリティグループについての解説です。

## モビリティグループとは

同一ネットワーク内で、同じグループ名を付与された複数台のWLCのグループのことです。  
※モビリティグループ名の大文字と小文字は区別される  
同一モビリティグループ内で、無線クライアントのローミングをシームレスに行うことができるようになります。

例) WLC-Tokyo-AとWLC-Osaka-Bがあり、モビリティ名がWLC-MobGroupとして設定されている。

この場合、上記の2台のWLCは同じモビリティグループに所属していることになります。

なお、一つのモビリティグループには最大24台のWLCを含めることができます。(2025年10月時点)

### モビリティグループの特徴

- シームレスなローミング
- WLC 間の情報同期・制御メッセージ交換
- WLCの冗長化のため使用されることもある

### モビリティグループを構成するための前提条件

①すべてのWLCの管理インターフェイス間で IP 接続ができる必要があります。

②モビリティ リストに登録されたコントローラ同士で、使っているソフトウェアのバージョンが異なると、レイヤ 2／レイヤ 3 のローミングが制限されることがあります。ローミング機能をしっかり使いたいなら、同じバージョンのコントローラどうし、またはバージョン 7 系で動いているコントローラどうしで揃える必要があります。

③モビリティ リストに含まれるすべてのコントローラは、同じ仮想インターフェイスの IP アドレスを設定しておく必要があります。これが揃っていないと、コントローラ間でクライアントの情報を正しく共有できず、ローミングがうまく動作しなくなることがあります。

④モビリティグループにコントローラを追加する際には、各コントローラの MAC アドレスと IP アドレスを事前に調べておく必要があります。設定時に“すべてのコントローラ間”で相互に通信できるよう、他のメンバーの MAC・IP 情報を使って設定を行うためです。

## 参考

[【Cisco公式】](https://www.cisco.com/c/ja_jp/support/docs/wireless/4400-series-wireless-lan-controllers/107188-mobility-groups-faq.html)[ワイヤレスLANコントローラ(WLC)モビリティグループに関するFAQを確認する](https://www.cisco.com/c/ja_jp/support/docs/wireless/4400-series-wireless-lan-controllers/107188-mobility-groups-faq.html)  
[【Cisco公式】Cisco Wireless Controller リリース 8.5 コンフィギュレーション ガイド-モビリティグループ](https://www.cisco.com/c/ja_jp/td/docs/wireless/controller/8-5/config-guide/b_cg85/b_cg85_chapter_010101.html)  
[【ネットワークエンジニアとして】Cisco Wireless LAN - High Availability](https://www.infraexpert.com/study/wireless41.html#google_vignette)
