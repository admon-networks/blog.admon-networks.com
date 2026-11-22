---
title: "ChromebookでEnte Authが黒い画面になる原因と対処法"
description: "ChromebookのLinuxでEnte Authが黒い画面になる原因と対処法を解説しています。キーリングの手動解除とGDK_BACKEND=x11の指定で解決します。"
pubDatetime: 2026-09-22T08:44:28.000Z
tags: ["セキュリティ", "セキュリティ / Security", "ツール", "トラブルシュート"]
ogImage: "../../assets/wp/2026/09/chromebook-ente-auth-black-screen.png"
---

2段階認証アプリの「Ente Auth」をChromebookのLinux環境（Crostini）にインストールしたところ、起動しても画面が真っ黒のまま、という問題に遭遇しました。この記事では、ログから原因を切り分けて解決するまでの手順を解説します。

結論から言うと、原因は次の2つでした。

-   **キーリングがロックされたまま**：gnome-keyringを入れ、起動前に手動で解除する
-   **画面表示の方式との相性**：`GDK_BACKEND=x11`を指定して起動する

## 環境

-   端末：Chromebook（x86\_64）
-   Linux環境：Debian 12（bookworm）
-   Ente Auth：v4.4.25（Linux用 .deb）

## Ente Authとは

[Ente Auth](https://ente.io/auth/)は、オープンソースの2段階認証（TOTP）アプリです。登録したコードはエンドツーエンドで暗号化されたうえでクラウドに同期されるため、スマホとPCの両方で同じコードを確認できます。コードのエクスポートにも対応しているので、将来ほかのアプリへ移行しやすいのも特徴です。

## インストール

Ente AuthのLinux版は、[GitHubのリリースページ](https://github.com/ente/ente/releases)で配布されています。注意点が2つあります。

-   **写真アプリと同じリポジトリで配布されている**：`ente-1.7.x-amd64.deb`のようなファイルは写真アプリの「Ente Photos」です。Ente Authのファイル名は`ente-auth-v〇〇-x86_64.deb`です。
-   **リポジトリ名が変わっている**：以前の`ente-io/ente`から`ente/ente`に変わっています。古い名前でAPIを呼ぶと転送（リダイレクト）が発生するため、curlには`-L`が必要です。

次のコマンドで、最新版のURLを取得してインストールします。

```bash
URL=$(curl -sL "https://api.github.com/repos/ente/ente/releases?per_page=100" | grep -oE 'https://[^"]+ente-auth-v[^"]+-x86_64\.deb' | head -n1)
echo "$URL"
curl -LO "$URL"
sudo apt install -y ./$(basename "$URL")
```

-   `curl -sL`：GitHubのAPIからリリース一覧を取得します。`-s`は進捗表示を消し、`-L`は転送先まで追いかけます。
-   `grep -oE`：一覧の中から、Ente AuthのLinux（x86\_64）用 .deb のURLだけを抜き出します。
-   `head -n1`：一覧は新しい順なので、先頭の1件（最新版）だけを取り出します。
-   `basename`：URLからファイル名の部分だけを取り出し、aptに渡します。

## 症状：起動すると画面が真っ黒になる

![ChromebookのLinux環境で起動したEnte Authのウィンドウが、真っ黒のまま何も表示されていない状態](../../assets/wp/2026/09/Screenshot-2026-09-22-17.38.38.png)

*起動直後の画面。ウィンドウは開くが、中身は真っ黒のまま表示されない*

インストール後、ランチャーから起動するとウィンドウは開くものの、中身が真っ黒のまま何も表示されませんでした。ランチャーから起動するとエラーが見えないため、ターミナルから直接起動してログを確認します。

```bash
enteauth
```

すると、次のようなエラーが出ていました（抜粋）。

```text
** (io.ente.auth): WARNING **: libsecret_error: Failed to unlock the keyring
[Configuration][SEVERE] Configuration init failed
⤷ error: PlatformException(Libsecret error, Failed to unlock the keyring, null, null)
```

`Failed to unlock the keyring`、つまり「キーリングのロックを解除できない」ことが原因で、アプリの初期化に失敗していることが分かります。

## 原因1：キーリングがロックされたまま

### キーリングとは

キーリングは、OSに組み込まれた「アプリ専用の金庫」です。アプリはログイン情報や暗号鍵を自分のファイルに平文で保存する代わりに、キーリングに預けます。中身はキーリングのパスワードで暗号化されています。macOSの「キーチェーン」や、Windowsの「資格情報マネージャー」と同じ役割で、Linuxでは[GNOME Keyring](https://wiki.archlinux.org/title/GNOME/Keyring)がよく使われます。

Ente Authは、同期用の暗号鍵などをこのキーリングに保存しようとします。

### なぜChromebookでは解除されないのか

通常のLinuxデスクトップでは、PCにログインしたときのパスワードでキーリングが自動的に解除されます。しかし、ChromebookのLinux環境はChromeOSの中で動くコンテナで、Linux側のログイン処理がありません。そのため、キーリングを解除する仕組みが働かず、アプリが鍵を保存できない状態になります。

### 対処：gnome-keyringを入れて手動で解除する

まず、キーリングのサービス本体をインストールします。

```bash
sudo apt install -y gnome-keyring libsecret-1-0
```

-   `gnome-keyring`：キーリングのサービス本体です。
-   `libsecret-1-0`：アプリがキーリングとやり取りするためのライブラリです。

続いて、パスワードを入力してキーリングを解除します。キーリングがまだ存在しない場合は、ここで入力したパスワードで新しく作成されます。

```bash
read -rsp "キーリングのパスワード: " PW; echo
echo -n "$PW" | gnome-keyring-daemon --replace --unlock --components=secrets
unset PW
enteauth
```

-   `read -rsp "..." PW`：パスワードを画面に表示せずに入力させ、変数`PW`に保存します。コマンドに直接パスワードを書くと履歴に残るため、この方法を使います。
-   `echo -n "$PW" | gnome-keyring-daemon ...`：パスワードをキーリングのサービスに渡します。`-n`で末尾の改行を付けないようにしています。
-   `--replace`：動いているサービスを置き換えて起動し直します。
-   `--unlock`：受け取ったパスワードでキーリングを解除します。
-   `--components=secrets`：パスワード保管の機能だけを起動します。
-   `unset PW`：用が済んだ変数からパスワードを消します。

なお、`read -rsp`の`"..."`の部分は、画面に表示する案内文です。ここにパスワードを書いてしまうと、画面やコマンド履歴に残ってしまうので注意してください。パスワードは、コマンドを実行したあとに表示される案内文に続けて入力します。

これでログから`libsecret_error`が消え、ログイン画面の生成まで進むようになりました。

## 原因2：画面表示の方式との相性

キーリングの問題は解決したものの、今度は画面が黒いまま点滅するようになりました。ログにエラーはなく、アプリ自体は動いているので、画面の描画に問題があると考えられます。

ChromebookのLinux環境は、ChromeOSの画面にLinuxアプリを表示するために独自の仕組みを使っています。Linuxの画面表示にはWayland（新しい方式）とX11（従来の方式）がありますが、Ente Auth（Flutter製）はWaylandで表示すると正しく描画されないことがあります。そこで、X11で表示するように指定して起動します。

```bash
GDK_BACKEND=x11 enteauth
```

-   `GDK_BACKEND=x11`：画面表示の方式をX11に切り替える環境変数です。コマンドの前に書くと、そのコマンドの実行時だけ有効になります。

これで、正常にログイン画面が表示されました。環境によっては、GPUを使わずCPUで描画させる`LIBGL_ALWAYS_SOFTWARE=1`を併用すると改善する場合もあります。

## 起動用スクリプトにまとめる

キーリングはLinux環境を再起動するたびにロックされます。毎回コマンドを打つのは手間なので、解除から起動までをスクリプトにまとめます。

```bash
mkdir -p ~/.local/bin
cat > ~/.local/bin/ente <<'EOF'
#!/bin/bash
read -rsp "キーリングのパスワード: " PW; echo
echo -n "$PW" | gnome-keyring-daemon --replace --unlock --components=secrets > /dev/null
unset PW
GDK_BACKEND=x11 enteauth
EOF
chmod +x ~/.local/bin/ente
```

-   `cat > ファイル <<'EOF' ... EOF`：`EOF`で挟んだ内容をファイルに書き込みます。`'EOF'`とクォートで囲むと、`$PW`などが書き込み時に展開されず、文字どおり保存されます。
-   `> /dev/null`：キーリングの起動メッセージを非表示にします。
-   `chmod +x`：スクリプトに実行権限を付けます。

`~/.local/bin`にPATHが通っていれば、次回からは次のコマンドだけで起動できます。

```bash
ente
```

## 補足：キーリングのパスワードは空にしない

キーリングのパスワードを空にすれば解除の手間はなくなりますが、Ente Authの暗号鍵が暗号化されずにディスクへ保存されることになります。2段階認証のコードを扱うアプリなので、パスワードは設定しておくことをおすすめします。設定したパスワードは、パスワードマネージャーなどに保管しておきましょう。

Linux版の設定が手間に感じる場合は、ChromebookでPlayストアからAndroid版を入れる方法や、ブラウザからWeb版（auth.ente.io）でコードを確認する方法もあります。

## まとめ

ChromebookのLinux環境でEnte Authが黒い画面になる場合は、次の2点を確認してください。

-   ログに`Failed to unlock the keyring`が出ている場合は、gnome-keyringを入れて手動で解除する
-   エラーはないのに黒い画面や点滅が続く場合は、`GDK_BACKEND=x11`を指定して起動する

今回のように、GUIアプリが正しく起動しないときは、まずターミナルから起動してログを見るのが切り分けの第一歩です。エラーメッセージから原因の方向性が分かれば、対処もぐっと絞り込めます。
