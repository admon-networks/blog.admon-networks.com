---
title: "ChromebookでDNSを戻しても名前解決できない原因と対処法"
description: "DNSを8.8.8.8から内部DNSに戻したのに、内部の名前だけ引けない。digの出力を読んで切り分けたら、原因は「存在しない」という応答のキャッシュでした。ChromebookならWi-Fiの再接続で直ります。"
pubDatetime: 2026-09-25T14:35:55.000Z
tags: ["DNS", "トラブルシュート", "ネットワーク/ Network"]
ogImage: "../../assets/wp/2026/09/chromebook-dns-negative-cache-eyecatch.png"
---

## はじめに

前日、ChromebookのDNSを一時的に8.8.8.8にしていました。それをすっかり忘れたまま、翌日、自宅ラボの構築用サーバーにSSHしようとしたら、こう言われました。

```bash
$ ssh user@builder.home.example.com
ssh: Could not resolve hostname builder.home.example.com: Name or service not known
```

ここで「あ、8.8.8.8のままだった」と気づいて、内部DNSに戻しました。これで解決、と思ってもう一度SSHしたら、まだ同じエラーが出ます。

この記事では、digの出力を読みながら原因を切り分けた流れを書きます。先に言ってしまうと、原因は「否定応答のキャッシュ」でした。

## 環境

-   クライアント：Chromebook（Linux開発環境 / Crostini）
-   内部DNS：Pi-hole ＋ Unbound（`home.example.com` の内部ゾーンを持っている）
-   公開DNS：`example.com` は Route 53 で管理

## 結論

8.8.8.8のままSSHしたことで、内部にしかない名前を公開DNSに問い合わせてしまい、「そんな名前はない（NXDOMAIN）」という答えがChromebook側にキャッシュされていました。

DNSは「ある」という答えだけでなく、「ない」という答えもキャッシュします。残る時間はゾーンのSOAで決まり、Route 53の場合は最大900秒（15分）です。DNS設定を戻しても、このキャッシュが消えるまでは引けないままになります。

Chromebookなら、**Wi-Fiを切断して再接続すれば直ります**。

## 不思議だったこと：一部の名前は引ける

ややこしかったのは、同じ `home.example.com` の中でも、Web用の名前（`web.home.example.com`）は引けてSSHもできたことです。「DNSが壊れているわけではないのでは？」と、しばらく混乱しました。

種明かしをすると、この名前はRoute 53の公開ゾーンにもAレコードを登録していました（Aレコードなど、DNSの基本は[DNSとは？初心者向けに仕組み・Aレコード/AAAAレコード/CNAMEをわかりやすく解説](/dns/)で解説しています）。8.8.8.8に直接聞いてみると、プライベートIPがそのまま返ってきます。

```bash
$ dig +short web.home.example.com @8.8.8.8
192.168.10.1
```

つまり、「公開ゾーンにもある名前は引けて、内部にしかない名前だけ引けない」という状況でした。

## digで切り分ける

ChromebookのLinux環境にはdigが入っていなかったので、先に入れておきます。

```bash
$ sudo apt install dnsutils
```

### ① いつもどおり問い合わせる

内部DNSに戻したあとで、端末に設定されているDNSにそのまま聞いてみます。

```bash
$ dig builder.home.example.com

;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 16380
;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1

;; AUTHORITY SECTION:
example.com.        523     IN      SOA     ns-xxxx.awsdns-xx.co.uk. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400

;; SERVER: 100.115.92.193#53(100.115.92.193) (UDP)
;; WHEN: Fri Sep 25 22:28:06 JST 2026
```

見るところは4つです。

-   **status: NXDOMAIN**：「その名前はない」と言われています。
-   **AUTHORITY SECTION のSOAが awsdns**：ここがポイントでした。「ない」と答えたのは、Route 53の公開ゾーンです。Unboundの内部ゾーンから答えたのであれば、Route 53のSOAは出てきません。
-   **SERVER: 100.115.92.193**：ChromeOSのDNSプロキシです。Linux環境からの問い合わせはいったんここを通るので、この行から本当の問い合わせ先はわかりません。
-   **TTL**：43秒後にもう一度実行したら、523が480に減っていました。新しく問い合わせているなら、毎回同じ値から始まるはずです。減っていくのは、キャッシュされた答えを使い回しているサインです。

### ② 内部DNSに直接聞く

次に、端末の設定を無視して、内部DNSに直接聞いてみます。

```bash
$ dig builder.home.example.com @192.168.10.53

;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 54654
;; flags: qr aa rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; ANSWER SECTION:
builder.home.example.com. 3600 IN A 192.168.10.100
```

ちゃんと引けました。flagsの `aa` は「権威ある回答」という意味で、Unboundが自分の内部ゾーンから答えたことを示しています。内部DNSは無実でした。

### ③ 8.8.8.8の間に一度も引いていない名前を聞く

最後に、「端末がまだ公開DNSを見ている」のか、「キャッシュが残っているだけ」なのかを分けます。8.8.8.8にしていた間に一度も引いていない、内部にしかない名前を、端末の設定どおりに聞いてみました。

```bash
$ dig +short proxy.home.example.com
192.168.10.1
```

引けました。つまり、Chromebookはちゃんと内部DNSを使えていて、引けないのは8.8.8.8のときにキャッシュされた名前だけ、ということです。

## 対処：Wi-Fiを切断して再接続する

Chromebookの場合は、Wi-Fiを一度切断して再接続すれば、キャッシュが消えて引けるようになります。私もこれで直りました。

ほかにも、次の方法で解決できます。

-   **待つ**：最大でSOAのTTLの時間（Route 53なら15分）がたてば、自然に消えます。
-   **IPアドレスで入る**：とりあえず作業を進めたいなら、これが一番早いです。

## まとめ

-   DNSは「ない」という答えもキャッシュする。Route 53のゾーンなら最大15分残る
-   公開DNSのまま内部の名前を引くと、内部DNSに戻したあともしばらく引けない
-   Chromebookなら、Wi-Fiの切断・再接続で直る
-   digでは、status、AUTHORITYのSOA、SERVER、TTLの減り方の4点を見ると、「誰が」「いつの答えを」返しているかがわかる

## 関連記事

同じ「キャッシュが原因で名前解決がおかしくなる」話です。

[UnboundがSERVFAILを返す原因はinfraキャッシュだった](/unbound-servfail-infra-cache/)
