---
title: "Cisco LAP がWLCを見つける仕組みを解説｜DHCP Option43〜DNSまで全手順"
description: "概要 CCNAやCCNPの試験で頻出の、LAP（WLC管理による無線AP）のWLC探索に関する説明記事です。 この内容はCAPWAPセッションを確立する前に行われるLAPがWLCを探索する方法についてまとめております。 …"
pubDatetime: 2025-09-29T15:24:42.000Z
modDatetime: 2026-06-05T13:02:21.000Z
tags: ["CCNA", "CCNP", "CCNP ENCOR", "Cisco", "Wireless", "ネットワーク", "ネットワーク/ Network", "無線", "無線 / Wireless"]
ogImage: "../../assets/wp/2025/09/ChatGPT-Image-2025年9月30日-00_23_41.png"
---

## 概要

CCNAやCCNPの試験で頻出の、LAP（WLC管理による無線AP）のWLC探索に関する説明記事です。  
この内容はCAPWAPセッションを確立する前に行われるLAPがWLCを探索する方法についてまとめております。

## WLCの検出方法

### 前提条件

LAPがWLCを検出するには、IPアドレスをDHCPまたはスタティックで設定しておく必要があります。

### 方法①：DHCP オプション43

DHCPオプション43は、DHCPのオプション機能の一つです。  
このオプションはLAPにWLCのIPv4アドレスを通知するために使用されます。  
この方法は大規模環境でよく用いられます。（例：本社WLCに全国の支社APを接続するケース）

### 方法②：DHCP オプション53

DHCPオプション53もDHCPオプション機能の一つです。  
このオプションは、LAPにWLCのIPv6アドレスを通知するために使用されます。  
DHCPオプション53も、大規模環境で多く用いられます。

### 方法③：DNSディスカバリ

LAPがDNSを利用してWLCのIPアドレスを解決するための仕組みです。  
起動したAPは、あらかじめ決められたホスト名をDNSに問い合わせ、返ってきたIPアドレスを使ってWLCに接続します。  
ドメイン名「CISCO-CAPWAP-CONTROLLER.localdomain」を照会し、アドレス解決を試みます。  
DNSディスカバリは、同一サイトでWLCのアドレス解決を行う場合によく使用されます。  
  
DNSについては、別記事で解説しておりますので、よろしければご覧ください。  
[**DNSとは？初心者向けに仕組み・Aレコード/AAAAレコード/CNAMEをわかりやすく解説**](/dns/)  

### 方法④：**レイヤ3ブロードキャスト**

LAPが起動時に、ブロードキャスト（255.255.255.255宛）でWLC探索の問い合わせを投げる方法です。  
同じサブネット内にいるWLCがそのリクエストを受け取り、自身の存在をAPに知らせます。  
この方法は、小規模サイトでよく使用されます。

### 方法⑤：**スタティック設定**

APに対して 「このWLCに必ず接続しなさい」 と手動で指定する方法です。  
CLIコマンドでWLCのホスト名とIPアドレスを直接入力することで、  
APはブロードキャストやDNS探索をせず、最初から指定されたWLCにJoinしにいきます。

### 方法⑥：モビリティディスカバリ

APが過去に接続していたWLCの情報を記憶しており、その情報をもとに再びWLCを探索する仕組み です。  
特にモビリティグループ（Mobility Group）を構成している場合、APはグループ内のWLC候補をキャッシュしていて、再起動時や再接続時に優先的に利用します。

## 試験対策まとめ（CCNA/CCNP向け）

### 押さえておくべきポイント

-   LAPがWLCを検出する方法は 5つある
-   試験でよく問われるのは「どの方法がどの環境で使われるか」
-   DHCPオプション43とDNSディスカバリ（使用されるドメイン名は何？）に関する問題が頻出

### 暗記のコツ

-   「DHCP → 大規模、DNS → 同一サイト、Broadcast → 小規模、Static → テスト環境、Mobility → 再接続」
-   環境規模やシチュエーションを紐づけて覚えると整理しやすい

### おすすめ参考書籍

![](https://tshop.r10s.jp/booxstore/cabinet/01138/bk4798175390.jpg?downsize=200:*)

[Cisco CCNP Enterpriseコア試験ENCOR〈350-401〉完全合格テキスト&問題集 シスコ技術者認定教科書／林口裕志／川島拓郎／中道賢【3000円以上送料無料】](https://a.r10.to/h5BWLx)

![](https://tshop.r10s.jp/booxstore/cabinet/01263/bk4798191035.jpg?downsize=200:*)

  
[Cisco CCNA完全合格テキスト&問題集〈対応試験〉200-301 シスコ技術者認定教科書／林口裕志／井原慶亮／中道賢【3000円以上送料無料】](https://a.r10.to/h5iR9k)

## 参考コンテンツ

[【Cisco公式】Lightweight アクセスポイントの DHCP オプション 43 の設定](https://www.cisco.com/c/ja_jp/support/docs/wireless-mobility/wireless-lan-wlan/97066-dhcp-option-43-00.html)  
[【Cisco公式】Lightweight アクセス ポイントに関する FAQ](https://blog.admon-networks.com/?page_id=302)  
[【Cisco公式】Catalyst 9800 WLC を使用した AP 参加プロセスの理解](https://www.cisco.com/c/ja_jp/support/docs/wireless/catalyst-9120axe-access-point/221056-understand-the-ap-join-process-with-the.html)

<a href="https://px.a8.net/svt/ejp?a8mat=45E95Q+7YYYCY+5P1E+5Z6WX" rel="nofollow">
<img border="0" width="100" height="60" alt="" src="https://www25.a8.net/svt/bgt?aid=250927838482&wid=001&eno=01&mid=s00000026573001004000&mc=1"></a>
<img border="0" width="1" height="1" src="https://www15.a8.net/0.gif?a8mat=45E95Q+7YYYCY+5P1E+5Z6WX" alt="">

[自分らしく働けるエンジニア転職を目指すなら【strategy career】](https://px.a8.net/svt/ejp?a8mat=45E95Q+7YYYCY+5P1E+5YJRM)  
![](https://www19.a8.net/0.gif?a8mat=45E95Q+7YYYCY+5P1E+5YJRM)

次の記事:[【図解】CAPWAPとは？Cisco APとWLCのセッション確立手順をわかりやすく解説](/capwap/)
