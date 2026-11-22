---
title: "【DHCP】OfferとACKがキャプチャできない原因｜Meraki MR36"
description: "DHCPのキャプチャでOfferとACKが見えない原因を解説。Discoverのbroadcast flagが0だとサーバはユニキャストで返すため、同一VLANの別ポートでは観測できません。Meraki MR36で遭遇した事例と切り分け手順をまとめました。"
pubDatetime: 2026-09-08T21:30:00.000Z
tags: ["Cisco", "Meraki", "トラブルシュート", "ネットワーク", "ネットワーク/ Network", "無線"]
ogImage: "../../assets/wp/2026/09/dhcp-offer-not-captured-eyecatch.png"
---

## この記事の結論

先に答えを書いておきます。

**APなど自分のPC以外の機器のDHCPをキャプチャしたとき**、DiscoverとRequestしか見えないことがあります。このとき、サーバが応答していないとは限りません。

Discoverの `flags` が `0x0000`（broadcast flag = 0）だと、サーバはOfferとACKをその機器のMACアドレス宛にユニキャストで返します。ユニキャストはスイッチが該当ポートにしか転送しないので、**ポートミラーリングをしていない状態で同じVLANの別ポートにPCを挿しても、届きません。**

もちろん本当に無応答というケースもあります。どちらなのかは、Discoverの `flags` とRequestの有無で判断できます。

Meraki MR36の構築時にたまたま遭遇したので、記録として残しておきます。

## この記事で扱う範囲

-   OfferとACKがキャプチャに出てこない仕組み
-   Wiresharkでの `flags` の見方
-   応答がないのか、見えていないだけなのかの判断

## 状況：bad-gatewayのSSIDが出ていた

本番導入前に、ローカルで組んだ環境でMeraki MR36を起動しました。まだインターネットには出していません。

起動後、APのLEDがオレンジ点灯のままになり、こんなSSIDをブロードキャストしていました。

```text
<SSID_name>-bad-gateway
```

Merakiのドキュメントによると、これはAPに設定されたデフォルトゲートウェイが15回連続でARPリクエストに応答しなかったときに出るものです。対処としては、APのIPアドレス設定とデフォルトゲートウェイへの到達性を確認するよう案内されています。

参考：[アクセスポイントのデフォルト SSID を使用してローカルステータスページへアクセスできないときのトラブルシューティング](https://documentation.meraki.com/Wireless/Translated_Documents/Using_the_Cisco_Meraki_Device_Local_Status_Page_jp)

まずはIPアドレス設定のほう、つまりDHCPでちゃんとアドレスを取れているのかを確認することにしました。Merakiはクラウド管理型なので、外に出るまでダッシュボードには現れません。手元で見るしかない状況です。

そこで同じVLANのアクセスポートにPCを挿して、Wiresharkでキャプチャしました。時間もなかったので最小構成です。ポートミラーリングは組んでいません。**同じVLANなら見えるだろう**というくらいの感覚でした。

## 見えたもの

Discoverが飛んで、Requestが飛ぶ。それだけです。

OfferもACKも一切出てきません。この見え方だと、DHCPサーバが応答していないように見えます。

ただ、よく考えるとおかしい。**Offerを受け取っていないクライアントは、Requestに進めません。** DHCPはDiscover → Offer → Request → ACKの順で進むので、Requestが出ている時点でOfferは届いているはずです。

つまり「応答がない」のではなく「応答が見えていない」だけ、ということになります。

## Discoverのflagsを見る

Discoverパケットを選択して、Wiresharkのdetailsペインを開きます。

```text
Dynamic Host Configuration Protocol (Discover)
    Message type: Boot Request (1)
    ...
    Bootp flags: 0x0000 (Unicast)
        0... .... .... .... = Broadcast flag: Unicast
```

`0x0000` でした。broadcast flagが立っていない状態です。

このフラグは、クライアントが「ユニキャストで返してもらって構いません」と申告するためのものです。立っていれば `0x8000` になり、サーバはブロードキャストで返します。

今回は立っていなかったので、サーバはOfferとACKをMR36のMACアドレス宛にユニキャストで返送していました。ユニキャストのフレームはスイッチがMACアドレステーブルを引いてAP接続ポートにだけ転送するので、こちらのPCには届きません。

| パケット | 宛先 | 同一VLANの別ポートから見えるか |
| --- | --- | --- |
| Discover | ブロードキャスト | ○ |
| Offer | クライアントMAC宛ユニキャスト | × |
| Request | ブロードキャスト | ○ |
| ACK | クライアントMAC宛ユニキャスト | × |

DiscoverとRequestだけが見えるのは、この2つがブロードキャストだからです。

なお、Requestの中には Option 54（DHCP Server Identifier）と Option 50（Requested IP Address）が入っています。どのサーバがどのアドレスを提示したかは、ここを見れば分かります。Offerが写っていなくても、必要な情報はだいたい読めます。

## flagの値は機器による

broadcast flagはRFC 2131で定義されていますが、値を決めるのはクライアント側です。IP未設定の状態で自分宛のユニキャストを受け取れる実装なら0、受け取れない実装なら1にする、という自己申告になっています。

なので機器やOSによって値が変わります。Windowsのように1を立てるものもあれば、ネットワーク機器のように0のままのものもあります。

細かい傾向まで覚える必要はないと思っていて、**Offerが見えなかったらDiscoverのflagsを見る**、という手順だけ押さえておけば十分です。

同じ手順でキャプチャしても対象機器が変われば見え方が変わるので、環境側の問題だと勘違いしやすいポイントでもあります。

## 全部見たいならSPANが必要

ユニキャストで返っている以上、同一VLANの別ポートにPCを挿す方式では原理的に取れません。OfferとACKも見たいなら、対象機器の接続ポートをミラーします。

Catalystなら2行です。

```text
monitor session 1 source interface [ キャプチャ対象のインターフェース ]
monitor session 1 destination interface [ キャプチャ用PCを接続するインターフェース ]
```

sourceが対象機器の接続ポート、destinationがキャプチャ用PCの接続ポートです。

とはいえ今回のように「IPが取れているか知りたい」だけなら、Requestが出ているかどうかで判断できます。SPANまで組む必要があるかは、確認したい内容次第です。

## その後：インターネットに繋げたら解消した

DHCPは正常に動いていました。bad-gatewayは受け取ったデフォルトゲートウェイに到達できないという意味なので、DHCPの成否とは別の話です。

その後、お試しでインターネットにも出られるように環境を変えてみたところ、bad-gatewayは解消しました。

なぜこれで直ったのか、仕様として明示されているものは見つけられていません。ただ、クラウド管理型の機器はインターネットに繋がらないと何もできないことがあります。ローカルだけで閉じた構成のまま切り分けを続けていたのが、そもそも遠回りだったのかもしれません。

同じ事象に遭遇した人の参考になれば。

## まとめ

今回の内容は、大きく2つです。

**1\. DHCPのOfferとACKが見えないときは、Discoverの `flags` を見る**

`0x0000` ならユニキャストで返っているだけなので、同一VLANの別ポートからは見えません。Requestが出ていればOfferは届いています。全パケットが必要なら、対象機器の接続ポートをSPANしてください。

**2\. クラウド管理型の機器は、インターネットに出られないと動かないことがある**

今回はローカルだけで完結させようとしていましたが、インターネットに繋げたら解消しました。同じような構成で詰まったときは、一度外に出してみると早いかもしれません。

「応答が返ってこない」と「応答が見えていない」は別物です。機器を疑う前に、自分がどの位置から何を見ているかを確認すると、切り分けが速くなります。

## 参考

-   [RFC 2131 - Dynamic Host Configuration Protocol](https://datatracker.ietf.org/doc/html/rfc2131)（broadcast flagの定義は2.2章および4.1章）
-   [RFC 2132 - DHCP Options and BOOTP Vendor Extensions](https://datatracker.ietf.org/doc/html/rfc2132)（Option 50 / Option 54の定義）
-   [アクセスポイントのデフォルト SSID を使用してローカルステータスページへアクセスできないときのトラブルシューティング - Cisco Meraki Documentation](https://documentation.meraki.com/Wireless/Translated_Documents/Using_the_Cisco_Meraki_Device_Local_Status_Page_jp)
