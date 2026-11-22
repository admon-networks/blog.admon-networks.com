---
title: "非特権LXCに Loki を入れて S3 に書き込むまで｜設定ファイルを1行ずつ読み解く"
description: "Proxmox の非特権LXCに Loki 3.7 を入れ、S3 にチャンクを書き込むまでの記録です。config.yml の各項目をなぜその値にしたのか、GOMEMLIMIT が必要な理由、retention を効かせる設定、起動前の構文チェックまで解説します。"
pubDatetime: 2026-09-16T04:26:00.000Z
tags: ["AWS", "S3", "サーバ", "サーバー", "ネットワーク", "ネットワーク/ Network"]
ogImage: "../../assets/wp/2026/09/eyecatch-loki-lxc-s3-setup.png"
---

自宅ネットワークのログ基盤を作っています。

-   [Proxmox の非特権LXCで syslog 514番が開かない理由と対処法](/proxmox-unprivileged-lxc-rsyslog-514/)（rsyslog で syslog を受ける）
-   [Loki のログ保管に S3 を使う設計](/loki-s3-bucket-retention-cost/)（保管先の S3 を設計する）

今回はその続きで、**Loki を非特権LXCに入れて、S3 にチャンクが書き込まれるところまで**を扱います。

インストール自体は `apt install loki` で終わります。時間がかかるのは設定ファイルです。既定の `config.yml` は動作確認用のサンプルなので、ほぼ全面的に書き換えることになります。

この記事では、**なぜその値にしたのか**を1項目ずつ説明します。コピペで動く手順書より、後から自分で調整できる状態を目指しました。

> **記事中の値について** バケット名は `example-loki-logs` に置き換えています。構築の参考とされる場合はご自身の環境の値に読み替えてください。

## 前提

前回までで、以下ができている状態です。

| 項目 | 状態 |
| --- | --- |
| LXC | Debian 12、非特権、Nesting有効、メモリ4GB、ディスク16GB |
| rsyslog | 514/udp で受信、`/var/log/network/` に出力 |
| S3 バケット | 東京リージョン、SSE-S3、ライフサイクル180日 |
| IAM | 対象バケットのみに `Get/Put/Delete/List` を許可したユーザーとアクセスキー |

Loki の用語（チャンク、flush、WAL、ストリーム、ingester/querier/compactor）は [前回の記事](/loki-s3-bucket-retention-cost/) で整理しているので、そちらを先に読んでいただけると設定の意味が追いやすいと思います。

## インストール

### リポジトリの追加

```text
mkdir -p /etc/apt/keyrings

wget -q -O - https://apt.grafana.com/gpg.key \
  | gpg --dearmor > /etc/apt/keyrings/grafana.gpg

echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" \
  > /etc/apt/sources.list.d/grafana.list

apt update
```

前回の記事で Debian を選んだ理由のひとつが、**Grafana Labs の APT リポジトリが Debian・Ubuntu 共通**であることでした。ここでその判断が効いてきます。

`signed-by` で鍵ファイルを明示しているのは Debian 12 の作法です。古い記事にある `apt-key add` は非推奨になっており、使うと警告が出ます。

### Loki のインストール

```text
apt install -y loki
```

```text
Get:1 https://apt.grafana.com stable/main amd64 loki amd64 3.7.7 [46.8 MB]
```

**入ったのは 3.7.7 でした。** Loki は 2.x と 3.x で設定スキーマがかなり違うので、バージョンの確認は必須です。

```text
loki --version
```

```text
loki, version 3.7.7 (branch: release-3.7.x, revision: 7a40404f)
  go version:       go1.26.5
  platform:         linux/amd64
```

**インストール直後に、いったん止めます。**

```text
systemctl stop loki
```

既定の設定は `/tmp/loki` にデータを書く構成になっています。放置すると16GBの rootfs を使い始めるので、設定を差し替えるまでは動かさない方が安全です。

## パッケージが作ったものを確認する

設定を書く前に、何が置かれたかを把握します。ここを飛ばすと、後でパーミッション周りでハマります。

```text
cat /etc/systemd/system/loki.service
```

```text
[Unit]
Description=Loki service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=loki
ExecStart=/usr/bin/loki -config.file /etc/loki/config.yml
TimeoutSec = 120
Restart = on-failure
RestartSec = 2

[Install]
WantedBy=multi-user.target
```

読み取れることが4つあります。

| 項目 | 値 | 意味 |
| --- | --- | --- |
| `User=loki` | 専用ユーザー | root で動いていない。良い既定値 |
| 設定ファイル | `/etc/loki/config.yml` | `loki.yaml` ではない |
| `Restart=on-failure` | 異常終了時のみ | S3 到達不能時に無限再起動しない |
| unit の場所 | `/etc/systemd/system/` | 通常の `/lib/systemd/system/` ではない |

**unit が `/etc/systemd/system/` に置かれているのは少し珍しいです。** ここは管理者用の領域なので、直接編集できてしまいます。

ただし、この記事では **drop-in を使います**。パッケージ更新時に上書きされる可能性が残るのと、rsyslog のときに `AmbientCapabilities` を drop-in で足したのと流儀を揃えたいためです。

次に、ユーザーとディレクトリを確認します。

```text
id loki
```

```text
uid=103(loki) gid=65534(nogroup) groups=65534(nogroup)
```

**ここが要注意です。** 専用の `loki` グループが作られておらず、`nogroup` に所属しています。

`nogroup`（GID 65534）は「所属グループがない」ことを示す汎用グループで、他のシステムユーザーも入りえます。つまり **`0640 root:loki` のような「グループで読ませる」設計ができません。**

後で認証情報ファイルを置くとき、`0600` にして所有者だけが読める形にする必要があります。

```text
ls -ld /var/lib/loki
```

```text
ls: cannot access '/var/lib/loki': No such file or directory
```

**データディレクトリは作られていません。** 既定設定が `/tmp/loki` を使うためです。自分で作ります。

## 既定の config.yml を読む

書き換える前に、何が書いてあるかを見ておきます。

```text
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096
  log_level: debug

common:
  path_prefix: /tmp/loki
  storage:
    filesystem:
      chunks_directory: /tmp/loki/chunks
      rules_directory: /tmp/loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2020-10-24
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h
```

（一部抜粋）

**そのまま使える部分もあります。**

`schema: v13` と `store: tsdb` は Loki 3.x の推奨構成なので、変更しません。`auth_enabled: false` もシングルテナント運用なら正しい設定です。

**問題がある部分はこちらです。**

| 箇所 | 既定値 | 問題 |
| --- | --- | --- |
| `path_prefix` | `/tmp/loki` | 再起動で消える。WAL がここにあるのは論外 |
| `object_store` | `filesystem` | S3 にする |
| `log_level` | `debug` | 平常運転でログが膨大になる |
| `from` | `2020-10-24` | 過去日付。運用開始日にすべき |
| retention | 設定なし | 無期限。180日の設計が反映されていない |
| `analytics` | 有効（既定） | 外部への送信。自宅環境では不要 |

## config.yml を書き換える

バックアップを取ってから差し替えます。

```text
cp /etc/loki/config.yml /etc/loki/config.yml.orig
```

以下が完成形です。項目ごとの説明は後述します。

```text
auth_enabled: false

server:
  http_listen_address: 0.0.0.0
  http_listen_port: 3100
  grpc_listen_port: 9096
  log_level: info

common:
  instance_addr: 127.0.0.1
  path_prefix: /var/lib/loki
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

storage_config:
  tsdb_shipper:
    active_index_directory: /var/lib/loki/tsdb-index
    cache_location: /var/lib/loki/tsdb-cache
    cache_ttl: 24h
  aws:
    s3: s3://ap-northeast-1/example-loki-logs
    s3forcepathstyle: false

schema_config:
  configs:
    - from: 2026-09-01
      store: tsdb
      object_store: aws
      schema: v13
      index:
        prefix: index_
        period: 24h

compactor:
  working_directory: /var/lib/loki/compactor
  retention_enabled: true
  retention_delete_delay: 2h
  delete_request_store: aws

limits_config:
  retention_period: 170d
  ingestion_rate_mb: 4
  ingestion_burst_size_mb: 8
  per_stream_rate_limit: 512KB
  per_stream_rate_limit_burst: 1MB
  max_streams_per_user: 100
  max_query_parallelism: 8
  split_queries_by_interval: 24h
  reject_old_samples: true
  reject_old_samples_max_age: 168h

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

analytics:
  reporting_enabled: false
```

## 各項目の意味

### server

```text
http_listen_address: 0.0.0.0
```

全インターフェースで待ち受けます。Alloy は各ホスト上で動いて Loki に push するので、**自分以外のホストからの接続を受ける必要がある**ためです。

到達制御は Loki 側ではなく、UTM とルータで行います。[基本設計書](/home-network-basicdesign/) で「制御点を一箇所にまとめる」方針にしており、rsyslog の記事で Proxmox のファイアウォールを無効にしたのと同じ判断です。

**制御点が2つあると、繋がらないときに両方を見る羽目になります。**

```text
log_level: info
```

既定の `debug` から下げました。`debug` のままだと、起動のたびに内部モジュールの待ち合わせログが何十行も流れます。**ログ基盤自身がログを量産するのは筋が悪い**ので、平常運転では `info` にします。

### common

```text
instance_addr: 127.0.0.1
```

これはリング（クラスタ内で誰がどの役割かを調整する仕組み）用のアドレスで、**HTTP の待ち受けとは別物**です。単一ノードなので `127.0.0.1` のままにします。

```text
path_prefix: /var/lib/loki
```

`/tmp` から変更します。ここが WAL の置き場所になるので、**再起動で消える場所に置いてはいけません。**

`common.storage` のブロックは削除しました。`storage_config` で明示的に書くためです。両方書くと、どちらが効いているのか分からなくなります。

### storage\_config

```text
  aws:
    s3: s3://ap-northeast-1/example-loki-logs
```

**アクセスキーをここに書いていません。** 書くこともできますが、環境変数があればそちらが使われます。AWS SDK の標準的な挙動です。

設定ファイルは Git に入れたくなる性質のものなので、**鍵とは分離しておく**方が事故が減ります。

```text
    cache_ttl: 24h
```

S3 から取得したインデックスのローカルキャッシュを、24時間で破棄します。キャッシュは消えても S3 から取り直すだけなので、ディスクを圧迫させない方が優先です。

### schema\_config

```text
    - from: 2026-09-01
```

**ここは慎重に決める必要があります。**

`from` は「この日付以降のデータをこのスキーマで扱う」という宣言です。**運用開始後に変更すると、過去データが読めなくなります。**

既定値は `2020-10-24` でしたが、`object_store` を `filesystem` から `aws` に変えるので、同じ `from` のままでは整合が取れません。**データが1件もない今なら、丸ごと書き換えて問題ありません。**

今日の日付ではなく少し前にしているのは、タイムゾーンの扱いで境界をまたいだときの面倒を避けるためです。

### compactor

```text
  retention_enabled: true
```

**これを `true` にしないと、`retention_period` を書いても何も起きません。** 削除を担当するのは compactor なので、compactor 側で有効化する必要があります。

```text
  retention_delete_delay: 2h
```

削除対象と判定してから、実際に消すまでの猶予です。**設定ミスで大量削除が始まったときに、気づいて止める余地を残します。**

### limits\_config

```text
  retention_period: 170d
```

S3 のライフサイクル（180日）より10日短くしています。

理由は削除の順序です。**S3 が先に消すと、インデックスには存在するのに実体がないチャンクが生まれ、検索がエラーになります。** Loki を先に消させ、S3 のライフサイクルは取りこぼしの掃除役に回す、という役割分担です。

詳しい理屈は [前回の記事](/loki-s3-bucket-retention-cost/) に書いています。

```text
  ingestion_rate_mb: 4
  per_stream_rate_limit: 512KB
  max_streams_per_user: 100
```

**流量の上限です。** 機器がログループに入って大量送信を始めたときの防波堤になります。

`per_stream_rate_limit` があると、**1台の暴走が基盤全体を巻き込みません。** 該当ストリームだけが制限され、他は通常どおり流れます。

`max_streams_per_user: 100` は、ラベル設計を誤ってストリームが爆発したときの保険です。10ホスト × 数ジョブなら十分に収まる数字にしています。

```text
  max_query_parallelism: 8
  split_queries_by_interval: 24h
```

**検索側の制限です。** Loki は長期間のクエリを分割して並列実行しますが、メモリ4GBの環境では並列度を上げすぎると querier が持っていきます。

`split_queries_by_interval: 24h` で1日単位に分割し、同時実行を8本までに抑えています。

```text
  reject_old_samples: true
  reject_old_samples_max_age: 168h
```

7日より古いタイムスタンプのログを拒否します。

[rsyslog 構築時の記事](/proxmox-unprivileged-lxc-rsyslog-514/)で**送信元サーバーのタイムゾーンがUTCのままで、9時間ずれたログが記録された**件がありました。9時間程度ならこの設定でも通りますが、年単位でずれたログが混入するのは防げます。

### analytics

```text
analytics:
  reporting_enabled: false
```

Loki は既定で、匿名の利用統計を Grafana Labs に送信します。自宅環境では不要なので止めます。

## 認証情報を分離する

```text
cat > /etc/loki/s3.env <<'EOF'
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EOF

chown loki:nogroup /etc/loki/s3.env
chmod 0600 /etc/loki/s3.env
```

**`<<'EOF'` とクォート付きにしています。** シークレットに `$` が含まれていた場合、クォートなしだとシェルが変数として展開してしまうためです。

**`0600` にしているのは、`loki` のグループが `nogroup` だったからです。** 冒頭で確認したとおり専用グループがないので、「グループで読ませる」設計が使えません。所有者だけが読める形にします。

## データディレクトリ

```text
mkdir -p /var/lib/loki
chown loki:nogroup /var/lib/loki
chmod 0750 /var/lib/loki
```

## systemd の drop-in

```text
mkdir -p /etc/systemd/system/loki.service.d

cat > /etc/systemd/system/loki.service.d/override.conf <<'EOF'
[Service]
EnvironmentFile=/etc/loki/s3.env
Environment=GOMEMLIMIT=2500MiB
RestartSec=30
EOF

systemctl daemon-reload
```

### GOMEMLIMIT がなぜ必要か

**ここが今回いちばん重要な設定かもしれません。**

rsyslog の記事で、LXC の `free -h` が割り当てどおり 4.0Gi と表示されることを確認しました。lxcfs が `/proc/meminfo` をコンテナ視点の値に差し替えているからです。

**ところが、Go のランタイムは cgroup のメモリ制限を自動では読みません。**

Go の GC は「ヒープが前回の2倍になったら回収する」という動き方をします。上限を知らないと、**4GB の制限に近づいていることに気づかないまま GC を先延ばしにします。** 結果、OOM Killer に殺されます。

`GOMEMLIMIT` は Go 1.19 で追加された環境変数で、**この値に近づくと GC を積極的に走らせる**ようになります。ハードリミットではなく「そろそろ回収しろ」という指示です。

2500MiB にしたのは、4GB のうち残りを OS とページキャッシュに残すためです。

### RestartSec を伸ばす

既定の2秒から30秒にしました。

**S3 に到達できない状態だと、Loki は起動に失敗します。** 2秒間隔で再起動を繰り返すと、journal がエラーで埋まります。30秒あれば、一時的な障害なら回復を待てますし、恒久的な問題なら落ち着いて調査できます。

## 起動前の構文チェック

**Loki には設定を検証するオプションがあります。** rsyslog の `-N1` に相当するものです。

```text
runuser -u loki -- /usr/bin/loki -config.file /etc/loki/config.yml -verify-config
```

```text
level=info caller=main.go:109 msg="config is valid"
```

**`loki` ユーザーで実行しているのがポイントです。** root で通っても `loki` で通らない、という事態を避けられます。

> **`sudo` は入っていません。** Debian の LXC テンプレートは最小構成なので、root 運用前提で `sudo` が省かれています。代わりに `runuser` を使います。util-linux に含まれており最初から入っています。
> 
> `--` は「ここから先はコマンド本体」という区切りで、`-config.file` が `runuser` のオプションと誤解されるのを防ぎます。

## 起動と確認

```text
systemctl start loki
systemctl is-active loki
```

```text
active
```

### 待ち受けの確認

```text
ss -tlnp | grep -E '3100|9096'
```

```text
LISTEN 0 4096 *:9096 *:* users:(("loki",pid=12251,fd=7))
LISTEN 0 4096 *:3100 *:* users:(("loki",pid=12251,fd=6))
```

[rsyslog 構築](/proxmox-unprivileged-lxc-rsyslog-514/)のときに `0.0.0.0:514` を確認したのと同じ確認です。

### 起動状態の確認

```text
curl -s http://localhost:3100/ready
```

最初はこう返ります。

```text
Ingester not ready: waiting for 15s after being ready
```

**これはエラーではありません。** ingester が起動してから一定時間は、安定するまで待つ仕様です。少し待つと `ready` になります。

### ログの確認

```text
journalctl -u loki -n 30 --no-pager
```

注目すべき行が3つありました。

```text
msg="Loki started" startup_time=2.879450042s
```

全モジュールの起動が完了しています。

```text
caller=table_manager.go:136 index-store=tsdb-2026-09-01 msg="uploading tables"
```

**インデックスのアップロード処理です。** `tsdb-2026-09-01` という名前は、`schema_config` の `from: 2026-09-01` と `index.prefix` から導出されています。**設定が反映されていることが確認できます。**

```text
msg="waiting 10m0s for ring to stay stable and previous compactions to finish before starting compactor"
```

compactor が10分の待機に入っています。retention の削除処理はこの後で始まります。

## S3 に書き込まれるか確認する

**起動しただけでは S3 は空のままです。** この時点で確認しても何も見えません。

```text
aws s3 ls s3://example-loki-logs/ --recursive
```

```text
（何も出ない）
```

**Loki はログを受け取っていないので、書き出すものがないからです。** ここで「S3 連携が失敗している」と早合点しないよう注意が要ります。

### ログを1件 push する

```text
NOW=$(date +%s)000000000

curl -s -w '%{http_code}\n' -X POST http://localhost:3100/loki/api/v1/push \
  -H "Content-Type: application/json" \
  -d "{
    \"streams\": [{
      \"stream\": {\"job\": \"manual-test\", \"host\": \"SV-LOG-01\"},
      \"values\": [[\"${NOW}\", \"loki push test from curl\"]]
    }]
  }"
```

```text
204
```

**204 が返れば受理されています。** 本文は返りません。

タイムスタンプは**ナノ秒単位の UNIX 時刻を文字列で**渡す必要があります。`date +%s` が秒なので、末尾に9桁のゼロを付けています。

### 強制的に flush する

チャンクはすぐには S3 に行きません。`max_chunk_age`（2時間）か `chunk_idle_period`（30分）を待つためです。確認のために強制します。

```text
curl -s -X POST http://localhost:3100/flush
```

```text
caller=flush.go:305 component=ingester msg="flushing stream" user=fake
fp=2604b9a74c5896b5 num_chunks=1 total_comp="53 B" forced=1
labels="{host=\"SV-LOG-01\", job=\"manual-test\", service_name=\"manual-test\"}"
```

**`user=fake` はエラーではありません。** `auth_enabled: false` のシングルテナント運用では、テナントIDに `fake` が使われます。S3 のキーもこのプレフィックスで始まります。

**`service_name` は自分で指定していないラベルです。** Loki 3.x が `job` から自動生成しています。Alloy のラベル設計をするときに関係してくるので、覚えておく価値があります。

### S3 を確認する

```text
aws s3 ls s3://example-loki-logs/ --recursive
```

```text
2026-09-12 14:41:49  414  fake/2604b9a74c5896b5/1a096112c58:1a096112c58:7ee34e17
```

**書き込まれました。**

キーの構造はこうなっています。

| 部分 | 意味 |
| --- | --- |
| `fake` | テナントID |
| `2604b9a74c5896b5` | ストリームのフィンガープリント（ラベルの組み合わせから導出） |
| `1a096112c58:1a096112c58` | チャンクの開始・終了時刻（16進） |
| `7ee34e17` | チェックサム |

flush ログの `fp=2604b9a74c5896b5` と一致しています。**ログに出たチャンクが、そのまま S3 のオブジェクトになったことが追跡できます。**

サイズが 414 バイトなのは、53バイトのログ本体にチャンクのヘッダとメタデータが付くためです。**前回の記事でコスト試算の前提にした「小さいオブジェクトが大量に生まれる」構造が、実物として確認できました。**

### 検索する

```text
curl -s -G http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={job="manual-test"}' \
  --data-urlencode "start=$(( $(date +%s) - 600 ))000000000" \
  --data-urlencode "end=$(date +%s)000000000"
```

```text
{"status":"success","data":{"resultType":"streams","result":[{"stream":{...},
"values":[["1789224103000000000","loki push test from curl"]]}], ...
```

**受信・書き込み・検索がすべて通りました。**

統計部分にこんな値が含まれています。

```text
"totalChunksDownloaded":1, "chunksDownloadTime":87476
```

チャンクを1つ取得しています。`GetObject` の経路が生きていることの確認になります。

## メモリの実測

記事の前提として「稼働後に実消費を見て削る」と書いていたので、最初の実測値を記録しておきます。

```text
systemctl show loki -p MemoryCurrent --value | numfmt --to=iec
free -h
```

```text
56M
               total        used        free      shared  buff/cache   available
Mem:           4.0Gi       113Mi       3.3Gi        88Ki       635Mi       3.9Gi
Swap:          512Mi          0B       512Mi
```

| 項目 | 値 |
| --- | --- |
| Loki プロセス | 56 MB |
| コンテナ全体 | 113 MiB / 4.0 GiB |
| Swap | 未使用 |

**割り当ての2.8%です。** 当初の見積もり「Loki 500MB〜1GB」を大きく下回りました。

ただし、**ログが1件しかない状態の数字です。** 実際にログが流れ始めると ingester がチャンクを保持し、長期間の検索では querier が伸びます。削るのはまだ早いので、基準値として記録するにとどめます。

[rsyslog の記事](/proxmox-unprivileged-lxc-rsyslog-514/)で確認した「Debian 12 standard の素の消費 51MB」と比べると、**Loki を載せて約60MB増えた**ことになります。

## ハマりどころ

### Proxmox の Web コンソールで長い設定を貼るのは厳しい

100行を超える YAML を貼ったところ、画面表示が崩れました。

```text
EOFeporting_enabled: falsege: 168h
```

**これは描画だけの問題で、入力自体は正しく届いていました。** ヒアドキュメントは入力をそのまま受け取るので、端末のエコー表示が崩れても中身には影響しません。

確認方法はこれです。

```text
wc -l /etc/loki/config.yml
tail -5 /etc/loki/config.yml
cat -A /etc/loki/config.yml | head -20
```

`cat -A` は制御文字を可視化します。**行末が `$` だけで終わっていれば正常**で、`^M$` が見えたら改行コードに CR が混入しています。

とはいえ、**SSH を入れた方が確実です。** ブラケットペーストモードの制御文字が混入して、こんなエラーが出ることもありました。

```text
-bash: $'\E[200~id': command not found
```

* * *

## まとめ

| やりたいこと | 対応 |
| --- | --- |
| インストール直後の事故を防ぐ | `apt install` 後すぐ `systemctl stop`。既定は `/tmp` に書く |
| WAL を消えない場所に置く | `path_prefix` を `/var/lib/loki` に |
| S3 を使う | `schema_config` の `object_store: aws` + `storage_config.aws` |
| 認証情報を分離する | `EnvironmentFile` で drop-in から読ませ、`0600` に |
| OOM を避ける | **`GOMEMLIMIT` を明示**。Go は cgroup の制限を自動で読まない |
| retention を効かせる | `retention_enabled: true` と `retention_period` の**両方**が必要 |
| 起動前に検証する | `runuser -u loki -- loki -verify-config` |
| S3 連携を確認する | push → `/flush` → `aws s3 ls`。起動しただけでは書き込まれない |

今回いちばん引っかかったのは、**`loki` ユーザーのグループが `nogroup` だった**ことでした。

パッケージが専用グループを作ってくれる前提でパーミッション設計を考えていたので、`0640 root:loki` のつもりが成立しません。結果として `0600` にしたのですが、これは\*\*「後から Alloy を別ユーザーで動かすとき、同じ問題が起きる」\*\*ことも意味します。

rsyslog の記事で `/var/log/network/*.log` を `0640 root:adm` に揃えたのは、Alloy を adm グループで読ませるためでした。その伏線が、次の記事で回収されることになります。

**GOMEMLIMIT の話も、知らなければ確実に踏んでいたところです。** `free -h` が 4.0Gi と正しく見えているので、てっきりプロセス側も認識していると思い込んでいました。lxcfs が見せているのは `/proc/meminfo` であって、Go のランタイムはそこを見ていない。**「値が正しく見えている」ことと「プログラムがそれを使っている」ことは別**だと、あらためて確認した形です。

次は Alloy を入れて、rsyslog が出力したファイルを Loki に送り込むところをやっていきます。
