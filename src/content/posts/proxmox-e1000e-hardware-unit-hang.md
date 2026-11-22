---
title: "Proxmoxで通信が止まる原因はe1000eのHardware Unit Hangだった"
description: "Proxmoxで、リンクはUpなのに通信だけが止まる。原因はIntel I219系NIC（e1000e）の「Detected Hardware Unit Hang」でした。M720qでの実例をもとに、該当するかの確認方法と、TSO/GSO/GROを無効化する対策を解説します。"
pubDatetime: 2026-09-18T15:25:12.000Z
tags: ["Proxmox", "サーバー", "トラブルシュート"]
ogImage: "../../assets/wp/2026/09/eyecatch-proxmox-e1000e-hardware-unit-hang-v2.png"
---

### 結論

ThinkCentre M720qのオンボードNIC（Intel I219-V）で、e1000eドライバの「Detected Hardware Unit Hang」が発生していました。NICの送信処理が固まり、**リンクはUpのまま通信だけが止まる**状態です。

対策として、NICのオフロード機能（TSO/GSO/GRO）を無効化しました。

### 環境

| 項目     | 内容                       |
| -------- | -------------------------- |
| 機器     | Lenovo ThinkCentre M720q   |
| 仮想基盤 | Proxmox VE                 |
| NIC      | Intel I219-V（オンボード） |
| ドライバ | e1000e                     |
| 用途     | DNSサーバーなどをLXCで稼働 |

### 発生した事象

きっかけは、家族から「Wi-Fiが落ちた」と言われたことです。

確認すると、無線そのものは生きていて、名前解決ができない状態でした。DNSサーバーを動かしているM720qに到達できなくなっていたのです。

ところが、M720qのケーブルは挿さったまま、リンクランプも点いていました。物理的には何も問題がないように見える状態です。

### ログの確認

Proxmoxのシェルでカーネルログを確認しました。

```text
journalctl -k | grep -i -E "e1000e|unit hang"
```

```text
Sep 18 18:47:42 pve01 kernel: e1000e 0000:00:1f.6 eno1: Detected Hardware Unit Hang:
Sep 18 18:47:44 pve01 kernel: e1000e 0000:00:1f.6 eno1: Detected Hardware Unit Hang:
（中略：約2秒おきに同じメッセージが続く）
Sep 18 19:21:38 pve01 kernel: e1000e 0000:00:1f.6 eno1: Detected Hardware Unit Hang:
Sep 18 19:21:39 pve01 kernel: e1000e 0000:00:1f.6 eno1: NIC Link is Down
Sep 18 19:21:44 pve01 kernel: e1000e 0000:00:1f.6 eno1: NIC Link is Up 1000 Mbps Full Duplex, Flow Control: Rx/Tx
```

約2秒おきに同じメッセージが出続け、約34分後にリンクが一度落ちて復帰しています。この34分間、M720qは外部と通信できていませんでした。

### 該当するかの確認

同じ症状かどうかは、物理NICのドライバがe1000eかどうかで確認できます。

#### インターフェース名の確認

物理NICの名前は環境によって異なります（`eno1`、`enp0s31f6` など）。以降のコマンドの `eno1` は、自分の環境の名前に置き換えてください。

```text
ip -br link
```

`vmbr0` などのブリッジではなく、物理NICの名前を使います。Proxmoxでは、`/etc/network/interfaces` の `bridge-ports` に書かれているものが物理NICです。

#### ドライバの確認

```text
ethtool -i eno1
```

```text
driver: e1000e
（以下略）
```

`driver` が `e1000e` で、前述のログが出ていれば該当します。

#### NICの型番の確認

```text
lspci | grep -i ethernet
```

`I219-V` や `I219-LM` と表示されれば、今回と同じI219系のNICです。

### 原因：NICの送信処理が止まっていた

#### 送信の仕組み

OSは、送りたいデータを**送信キュー**に積みます。NICはそこから順番に取り出して、ケーブルへ送り出します。

e1000eドライバは、NICが送信を進めているかを常に見張っています。キューが一定時間まったく進まないと「NICが固まった」と判断し、このメッセージを出します。つまりHardware Unit Hangは、**送信キューが詰まって動かない**ことを意味します。

#### なぜリンクはUpのままなのか

リンクとNICの送信処理は、別の仕組みだからです。

| 項目     | 役割                    | 今回の状態 |
| -------- | ----------------------- | ---------- |
| リンク   | ケーブルの電気的な接続  | 正常（Up） |
| 送信処理 | NICがパケットを送り出す | 停止       |

リンクは「つながっているか」しか見ていません。そのためケーブルやスイッチを確認しても異常は見つからず、原因の特定を難しくしていました。

#### なぜ送信処理が止まるのか

I219系のNICには、特定の条件で送信処理が止まる既知の問題があります。引き金として多く報告されているのが **TSO（TCP Segmentation Offload）** です。

TSOは、大きなデータをパケットの大きさに分割する処理を、CPUではなくNICに任せる機能です。本来はCPUの負荷を下げるための機能ですが、I219ではこの処理の途中で固まることがあります。

この問題はM720q固有ではありません。Intel NUCやThinkCentre M920qなど、I219系のNICを載せたミニPCでも同じ症状が報告されています。中古ミニPCでProxmoxを動かしている場合は、機種を問わず起こりうる問題です。

### 対策：オフロードを無効化する

分割などの処理をNICに任せず、OS（CPU）側で行うようにします。NICの仕事を減らして、固まる原因を取り除く考え方です。

| 機能 | 内容                                                |
| ---- | --------------------------------------------------- |
| TSO  | 送信時のデータ分割をNICで行う                       |
| GSO  | 送信時のデータ分割を、NICに渡す直前まで遅らせて行う |
| GRO  | 受信した複数のパケットをまとめて処理する            |

主な引き金はTSOですが、TSOだけでは収まらなかったという報告もあります。関連する3つをまとめて無効化しました。

#### 設定

`ethtool` の設定は再起動で消えるため、`/etc/network/interfaces` に書いて、インターフェースが上がるたびに適用されるようにします。

```text
iface eno1 inet manual
        post-up /sbin/ethtool -K eno1 tso off gso off gro off
```

設定するのはブリッジ（vmbr0）ではなく、問題が起きている物理NIC（eno1）です。

```text
ifreload -a
ethtool -k eno1 | grep -E "tcp-segmentation-offload|generic-segmentation|generic-receive"
```

```text
tcp-segmentation-offload: off
generic-segmentation-offload: off
generic-receive-offload: off
```

3つとも `off` になれば反映完了です。

#### スクリプトを使う方法もある

この問題の回避策としては、コミュニティが公開しているスクリプト（Proxmox VE Helper-Scripts）も知られています。オフロードを無効化するsystemdサービスを自動で作成するものです。

今回はスクリプトを使わず、`/etc/network/interfaces` に直接書きました。何をどこまで無効化したかを自分で把握し、ネットワーク設定と同じ場所で管理するためです。

#### 副作用

分割などの処理をCPUが担うため、CPU負荷はわずかに上がります。ただし自宅の1Gbps程度の通信量では、体感できる差はありません。

### 経過観察

執筆時点では、対策後にHardware Unit Hangは再発していません。

再発に気付けるよう、Proxmoxホストのカーネルログはログサーバーへ転送しています。確認は次のコマンドで行います。日時は、対策を入れた時刻に置き換えてください。

```text
journalctl -k --since "2026-09-18 19:22" | grep "Unit Hang"
```

何も表示されなければ、再発していません。

なお、今回の影響が大きくなったのは、名前解決をこの1台に集約していたためでもあります。DNSの冗長化は、[自宅ネットワーク基本設計書](/home-network-basicdesign/)の「今後の予定」に記載しています。

### 解決しなかった場合

**しばらくはこの対策で様子を見ます。これで解決しなかった場合は、別記事にまとめる予定です。**

なお、TSO/GSO/GROがすでに無効になっているのに、同じ症状が出たという報告もあります。この3つの無効化だけでは収まらない可能性もあるため、次の対策も検討しています。

- 他のオフロード機能も無効化する
- NICの省電力機能（EEE）を無効化する
- USBやPCIeの別NICへ切り替える

### まとめ

- リンクがUpでも、NICの送信処理が止まると通信はできない
- 原因は、e1000eドライバで動くI219-Vの送信処理の停止だった
- M720qに限らず、I219系NICを載せたミニPC全般で起こりうる
- オフロードを無効化してNICの仕事を減らし、`post-up` で永続化した
