---
title: "Ciscoルータで switchport が使えない理由とタグ VLAN の設定方法"
description: "Ciscoルータで switchport mode trunk を打つと Invalid input。ルータの物理ポートはL3のため、タグVLANはサブインターフェース+dot1Qで設定します。891Fなどスイッチポート内蔵機との違いも解説。"
pubDatetime: 2026-08-30T16:00:00.000Z
tags: ["CCNA", "CCNP ENCOR", "Cisco", "L2", "L3", "VLAN", "ネットワーク"]
ogImage: "../../assets/wp/2026/08/eyecatch-cisco-tag-vlan.png"
---

## タグVLANとは

IEEE 802.1Q で標準化された、**1本の物理リンクに複数のVLANを流すための仕組み**です。 Ethernet フレームの送信元MACアドレスの直後に 4バイトのタグを挿入し、「このフレームはVLAN 10のものだ」という識別子を持たせます。

タグの中身は以下の構成です。

| フィールド | サイズ | 内容                                      |
| ---------- | ------ | ----------------------------------------- |
| TPID       | 16bit  | `0x8100` 固定。802.1Qタグであることの目印 |
| PCP        | 3bit   | 優先度(CoS)。QoSで使う                    |
| DEI        | 1bit   | 廃棄適格フラグ                            |
| VID        | 12bit  | **VLAN ID**。0〜4095                      |

VID が 12bit なので理論値は 4096 個ですが、0 と 4095 は予約されているため、**実際に使えるのは 1〜4094** です。

タグが付いたフレームは、通常の 1518 バイトに 4バイト足されて 1522 バイトになります。これを「ベビージャイアントフレーム」と呼びます。近年の機器はほぼ標準で通しますが、古い機器や一部のメディアコンバータでは通らないことがあります。

### そもそもなぜ使うのか

理由はシンプルで、**物理ポートが足りないから**です。

Cisco のルータは、スイッチと違ってポート数が非常に少ない構成が一般的です。 たとえば ISR 4000 シリーズのベースモデルは L3 ポートが 3 つしかありません。ここに 5 つのセグメントを収容したい、となった時点で物理ポートでは詰みます。

タグ VLAN を使えば、**1本のケーブルで何本ものセグメントを運べます**。

具体的に登場する場面はこのあたりです。

- **ルータオンアスティック** L2スイッチしかない環境で、VLAN間ルーティングをルータに担わせる構成。VLAN 10 と VLAN 20 の間の通信を、ルータのサブインターフェース同士で折り返す
- **複数セグメントを持つ拠点ルータ** 業務用セグメント、ゲスト用セグメント、管理用セグメントを1本の上り回線に集約する
- **回線業者側との接続** フレッツの網終端やキャリアのL2サービスで、サービス種別ごとにVLAN IDが指定されるケース
- **検証環境** ケーブルを増やさずにトポロジを変えられるので、ラボ構成の自由度が上がる

逆に言うと、**物理ポートに余裕があるなら無理に使う必要はありません**。1本のリンクに集約するということは、そのリンクが単一障害点になるということでもあります。冗長化とセットで設計しましょう。

---

## 設定方法

### 大前提:ルータのポートに `switchport` は無い

まずここでつまずく人が多いポイントです。

Catalyst スイッチでタグ VLAN を扱うときは、こう書きます。

```text
interface GigabitEthernet1/0/1
 switchport mode trunk
```

**ルータではこれが使えません。** ルータの物理インターフェースはデフォルトでルーテッドポート(L3ポート)であり、`switchport` コマンド自体が存在しないためです。

```text
Router(config-if)# switchport mode trunk
                   ^
% Invalid input detected at '^' marker.
```

ルータでは代わりに、**サブインターフェース**を切って、そこに `encapsulation dot1Q` で VLAN ID を紐付けます。

### 基本の設定

物理インターフェース `GigabitEthernet0/0/0` に、VLAN 10 と VLAN 20 を流す例です。

```text
! 物理インターフェース
interface GigabitEthernet0/0/0
 no ip address
 no shutdown
!
! VLAN 10 用サブインターフェース
interface GigabitEthernet0/0/0.10
 description ### VLAN10 Office ###
 encapsulation dot1Q 10
 ip address 192.168.10.1 255.255.255.0
!
! VLAN 20 用サブインターフェース
interface GigabitEthernet0/0/0.20
 description ### VLAN20 Guest ###
 encapsulation dot1Q 20
 ip address 192.168.20.1 255.255.255.0
```

これだけです。あとは各サブインターフェースが独立した L3 インターフェースとして動きます。

### タグなし(native VLAN)を扱う場合

対向のスイッチが native VLAN でタグなしフレームを送ってくる場合、`native` キーワードを付けたサブインターフェースを用意します。

```text
interface GigabitEthernet0/0/0.1
 encapsulation dot1Q 1 native
 ip address 192.168.1.1 255.255.255.0
```

もう一つの書き方として、**物理インターフェースに直接 IP を振る**方法もあります。この場合、タグなしフレームは物理インターフェースで処理されます。

```text
interface GigabitEthernet0/0/0
 ip address 192.168.1.1 255.255.255.0
 no shutdown
```

どちらでも動きますが、**サブインターフェース側に `native` を付ける書き方を推奨します**。設定を読んだときに「どのVLANがnativeなのか」が config 上で明示されるためです。物理インターフェースにIPを振る書き方は、慣れていない人が見ると意図が読み取れません。

### 設定時の注意点

**1\. 物理インターフェースの `no shutdown` を忘れない**

サブインターフェースは物理インターフェースに従属します。物理が down のままだと、サブインターフェース側をいくら設定しても up しません。地味に一番ハマります。

**2\. サブインターフェース番号は VLAN ID と揃える**

技術的には一致していなくても動作します。

```text
interface GigabitEthernet0/0/0.999
 encapsulation dot1Q 10          ← これでも動く
```

ただし**運用上は揃えるべき**だと考えます。障害対応中に `show ip interface brief` を見て、`.999` が VLAN 10 だと即座に判断できる人はいません。慣例に従いましょう。

**3\. 対向スイッチ側の設定も必要**

ルータ側だけ設定しても通りません。スイッチ側もトランクにします。

```text
interface GigabitEthernet1/0/1
 switchport trunk encapsulation dot1q    ← 機種により不要
 switchport mode trunk
 switchport trunk allowed vlan 1,10,20
 switchport trunk native vlan 1
 spanning-tree portfast trunk
```

`switchport trunk encapsulation dot1q` は、ISL をサポートしていた古い機種でのみ必要です。最近の Catalyst では dot1q 固定のため、このコマンド自体がありません。

---

## 確認コマンド

### `show vlans`

**ルータでタグ VLAN を確認する専用コマンド**です。スイッチの `show vlan` とは別物なので注意してください(複数形の `s` が付きます)。

```text
Router# show vlans

Virtual LAN ID:  10 (IEEE 802.1Q Encapsulation)

   vLAN Trunk Interface:   GigabitEthernet0/0/0.10

   Protocols Configured:   Address:              Received:        Transmitted:
           IP              192.168.10.1               1523                1489

   Other                                                 0                  12

   1535 packets, 187420 bytes input
   1501 packets, 176332 bytes output
```

VLAN ID・紐付いたサブインターフェース・IPアドレス・パケットカウンタが一度に見られます。 **「設定は入っているのに通信できない」ときは、まずこのコマンドで input/output のカウンタが増えているかを見ます。** input が 0 なら対向スイッチのトランク設定を、output だけ増えているなら戻りの経路を疑う、という切り分けができます。

---

## ハマりどころ

### native VLAN 不一致

ルータ側で `dot1Q 1 native`、スイッチ側で `native vlan 99` としてしまうケース。 CDP が有効ならログに警告が出ます。

```text
%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on GigabitEthernet0/0/0 (1), with Switch GigabitEthernet1/0/1 (99).
```

警告が出るだけで通信自体は「なんとなく」動いてしまうことがあるため、放置されがちです。設計と実装がズレている状態なので、必ず直しましょう。

### allowed vlan への入れ忘れ

スイッチ側の `switchport trunk allowed vlan` に VLAN を追加し忘れるパターン。 追加時は `add` を付けないと**リストが上書きされて既存VLANが全部落ちます**。

```text
! ✕ 危険:既存の設定が消える
switchport trunk allowed vlan 30

! ○ 正しい:追記される
switchport trunk allowed vlan add 30
```

本番環境でこれをやると即座に通信断です。私は必ず投入前に `show interfaces trunk` で現状を控えます。

### MTU

タグの 4バイト分、フレームサイズが増えます。通常のイーサネットでは意識不要ですが、上位に IPsec や GRE がある場合はフラグメント設計に効いてきます。 インターフェース MTU(`mtu`)とIP MTU(`ip mtu`)は別コマンドなので、混同しないよう注意してください。

---

## 補足:スイッチポート内蔵ルータの場合

Cisco 891F のように、ルータでありながらスイッチポートを内蔵している機種があります。 この場合、スイッチポート側では通常の `switchport mode trunk` が使えます。VLAN 間のルーティングは SVI(`interface Vlan10`)で行います。

```text
vlan 10,20
!
interface FastEthernet0
 switchport mode trunk
 switchport trunk allowed vlan 1,10,20
!
interface Vlan10
 ip address 192.168.10.1 255.255.255.0
!
interface Vlan20
 ip address 192.168.20.1 255.255.255.0
```

**同じ筐体でも、ポートによって設定方法が変わります。** 「ルーテッドポートならサブインターフェース、スイッチポートなら SVI」と覚えておくと迷いません。どちらのポートなのかは `show ip interface brief` や機器のデータシートで確認できます。

---

## まとめ

| やりたいこと               | 設定                                         |
| -------------------------- | -------------------------------------------- |
| ルーテッドポートでタグVLAN | サブインターフェース + `encapsulation dot1Q` |
| タグなしを受ける           | `encapsulation dot1Q X native`               |
| 確認                       | `show vlans`                                 |
| スイッチポート内蔵機       | `switchport mode trunk` + SVI                |

覚えることは多くありませんが、`switchport` が使えないという一点だけ引っかかりやすいポイントです。ルータのポートはデフォルトで L3、と押さえておけば迷いません。
