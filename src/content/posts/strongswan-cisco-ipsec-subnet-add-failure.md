---
title: "【strongSwan × Cisco】IPsec VPNでsubnet追加したら通信断した話 〜認証方式とCHILD SA再交渉の落とし穴〜"
description: "strongSwan×CiscoのIPsec VPN環境で、subnet追加後に通信断が発生した実例を解説。認証方式のズレとCHILD SA再交渉という見落としがちな落とし穴と、その切り分け・解決策をまとめました。"
pubDatetime: 2025-12-28T13:46:18.000Z
tags:
  [
    "AWS",
    "Cisco",
    "IPsec",
    "VPN",
    "クラウド",
    "サーバー",
    "セキュリティ",
    "トラブルシュート",
    "ネットワーク",
  ]
ogImage: "../../assets/wp/2025/12/strongswan-cisco-ipsec-subnet-add-failure-01.jpg"
---

## はじめに

自宅のネットワーク環境とAWSをIPsec VPNで接続して検証環境を作っていたところ、AWS側でサブネットを追加しただけでVPN通信が不安定になり、  
最終的に全断してしまう事象に遭遇しました。

一見すると「設定ミス」にも見えますが、  
実際の原因はstrongSwanとCisco機器の挙動の差、そしてIPsecの再交渉仕様にありました。

発生した事象について、記載します。

### 環境構成

- 自宅側：Cisco 891F (IKEv2 / PSK / crypto map)
- AWS側：EC2 + strongSwan (policy-based IPsec)
- 認証方式：事前共有鍵 (PSK)
- 接続形態：site-to-site VPN

### サブネット構成

- 自宅LAN :192.168.1.0/24
- AWS VPC :10.0.0.0/16
- AWS側追加LAN : 172.16.100.0/24

## 設定変更の内容（事象発生のトリガー）と発生した事象

strongSwan側で leftsubnetに172.16.100.0/24を追加しました。

### 設定変更の内容

#### 設定変更前

```text
leftsubnet=10.0.0.0/16
```

#### 設定変更後

```text
leftsubnet=10.0.0.0/16,172.16.100.0/24
```

### 発生した事象

設定変更をしIPsecを張りなおそうとしたところ、以下の事象が発生しました。

- 既存通信が不安定化
- 一部のsubnetが通信不可になる
- Cisco機器側で、show crypto ipsec sa でspiが0x0になる
- Cisco機器側で、send errorsが増加

#### Cisco側のログ　（確認コマンド：show crypto ipsec sa）

```text
local ident (addr/mask/prot/port): (192.168.1.0/255.255.255.0/0/0)
remote ident (addr/mask/prot/port): (172.16.100.0/255.255.255.0/0/0)

#pkts encaps: 0
#pkts decaps: 0
send errors 106
current outbound spi: 0x0(0)
```

#### strongSwan 側 (確認コマンド: sudo ipsec statusall)

```text
Security Associations (0 up, 0 connecting)
```

## 事象の原因は何だったのか

### 原因①：strongSwanの認証方式がズレていた(確認コマンド: sudo ipsec statusall)

諸々ログをみたりしながら原因を調べていた時に、ログの出力結果がどこかのタイミングで以下のように変わってしまっていました。

```text
uses public key authentication
```

#### \-解説-

もともと本構成ではPSK認証を想定していましたが、strongSwan 側で authby=psk を明示していなかったため、  
認証方式の選択が daemon の自動判断に委ねられていました。

strongSwan では証明書関連プラグイン（x509, pubkey 等）が有効な場合、利用可能な認証方式の中から pubkey 認証が選択されるケースがあるようです。

その結果、Cisco 側が PSK 固定であるにも関わらず、strongSwan 側が pubkey 認証を選択してしまい、  
IKE\_AUTH フェーズで認証方式の不整合が発生していました。

### 原因②：subnet追加によりtraffic selectorが変更されCREATE\_CHILD\_SAが再実行された

IKEv2 では、実際の暗号化通信は CHILD SA によって行われます。

CHILD SA は traffic selector（どの subnet 間を通すか）単位で作成されるため、subnet を追加することは新しい CHILD SA を追加することと同義になります。

今回、leftsubnet に 172.16.100.0/24 を追加したことで、既存の IKE SA が存在していても CREATE\_CHILD\_SA が再実行されました。

しかし、原因①の通り認証方式がズレていたため、新規 CHILD SA の確立に失敗し、  
IKE SA は一見生きているように見えるものの、対応する CHILD SA が存在しない状態となっていました。

### 反省：切り分けを難しくした要因（自分のせいだが、自宅イニシエータのIPsec環境で、間違ってAWS側でipsec up を実行してしまった）

切り分けを進める過程で、AWS 側の strongSwan に対して \[ ipsec up home-to-aws \] を実行してしまいました。

しかし、本構成では自宅側（Cisco）がトラフィックトリガ型でIPsec VPN を張る設計となっており、  
AWS 側は auto=add による待ち受け動作が前提でした。

#### なぜこれが問題だったのか・・・

そもそも、本構成では、  
・AWS 側：待ち受け（auto=add）  
・自宅側：トラフィック発生時にトンネルを確立

という役割分担になっているため、  
AWS 側で ipsec up を実行する必要はありませんでした。

切り分け中に ipsec up を実行することで、既存の SA 状態をさらに不安定にし、  
事象を分かりにくくしてしまったようです。

#### 教訓

IPsec VPN の切り分けにおいて、「どちら側がトンネルを張る設計なのか」を意識せずに  
ipsec up を実行することは、状況を悪化させる可能性があると分かりました。

自宅環境だと思って、なめてかかり、痛い目にあいましたので、気をつけましょう。

## 解決策

上記を整理したうえで、strongSwan側に明示的に以下の設定を入れ、自宅側からIPsecに該当する通信を発生させることで復旧しました。

```text
authby=psk
leftauth=psk
rightauth=psk
```

## まとめ（さいごに）

- strongSwanでは、認証方式は必ず明示する
- subnet追加 = 「設定変更」ではなく「再交渉イベント」であることを理解する
- spi 0x0 / send errors はCHILD SA不成立のサインの可能性が高い・・・
- ipsec up は最終手段

今回の事象は、単なる設定ミスではなく、IPsec の仕様と実装差を理解していないと再現・説明できない問題でした。  
同じような構成で検証している方の切り分けの助けになれば幸いです。

## 参考

\- strongSwan Wiki – ipsec.conf Authentication  
[https://wiki.strongswan.org/projects/strongswan/wiki/IpsecConf#Authentication](< https://wiki.strongswan.org/projects/strongswan/wiki/IpsecConf#Authentication>)

\- strongSwan Wiki – IKEv2 Authentication  
[https://wiki.strongswan.org/projects/strongswan/wiki/IKEv2Authentication](< https://wiki.strongswan.org/projects/strongswan/wiki/IKEv2Authentication>)

\- strongSwan Wiki – Credentials  
[https://wiki.strongswan.org/projects/strongswan/wiki/Credentials](https://wiki.strongswan.org/projects/strongswan/wiki/Credentials)

\- strongSwan Wiki – Plugin List  
[https://wiki.strongswan.org/projects/strongswan/wiki/PluginList](https://wiki.strongswan.org/projects/strongswan/wiki/PluginList)

\- strongSwan GitHub Repository  
[https://github.com/strongswan/strongswan](https://github.com/strongswan/strongswan)

<script type="text/javascript">rakuten_design="slide";rakuten_affiliateId="4f8ece4a.5217c53c.4f8ece4b.90feb009";rakuten_items="ctsmatch";rakuten_genreId="0";rakuten_size="468x160";rakuten_target="_blank";rakuten_theme="gray";rakuten_border="off";rakuten_auto_mode="on";rakuten_genre_title="off";rakuten_recommend="on";rakuten_ts="1766929082635";</script><script type="text/javascript" src="https://xml.affiliate.rakuten.co.jp/widget/js/rakuten_widget.js?20230106"></script>
