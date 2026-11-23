---
title: "ASDMが起動しない原因はJava｜OpenJRE版への切り替え方"
description: "ASA 9.22でASDMが起動しない原因は、同梱のASDMがPCのJavaを使うOracle JRE版だったことでした。show asdm imageでの見分け方、2種類ある理由、invisible.vbsエラーの正体、OpenJRE版への切り替え手順をまとめました。"
pubDatetime: 2026-11-23T18:00:00+09:00
tags: ["Cisco", "ファイアウォール", "トラブルシュート", "ネットワーク"]
ogImage: "../../assets/posts/eyecatch-asa-asdm-openjre.png"
---

ASA 9.22にバージョンアップしたあと、ASDM（Adaptive Security Device Manager）が起動しなくなりました。ブラウザでASDMのページは開けるのに、Launcherを起動すると`javaw.exe が見つかりません`や`invisible.vbs が見つかりません`が出て、GUIが立ち上がりません。

原因は、ASAに同梱されているASDMが、**PC側にJavaが入っている前提のOracle JRE版**だったことでした。Javaを同梱した「OpenJRE版」（`asdm-openjre-xxxx.bin`）に切り替えると、PCにJavaを入れなくても起動しました。

| 確認すること                                     | 判定                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| ASAで`show asdm image`を実行し、ファイル名を見る | ファイル名に`openjre`が含まれていなければ、Oracle JRE版               |
| Oracle JRE版だった場合                           | PCにOracle JRE 8.0かOpenJRE 1.8.xが必要。なければこれが起動しない原因 |
| 対処                                             | `asdm-openjre`版をASAに置き、`asdm image`で切り替える                 |

ASAの再起動は不要で、通信にも影響しません。

## 検証した環境

| 項目         | 内容                                            |
| ------------ | ----------------------------------------------- |
| 機器         | Cisco Secure Firewall（ASAイメージで運用）      |
| ASA          | 9.22                                            |
| ASDM         | 7.22(1)                                         |
| 管理PC       | Windows                                         |
| ASA管理IP    | 192.0.2.1（ドキュメント用のアドレスに置き換え） |
| 作業した時期 | <!-- TODO: 確認（作業した年月） -->             |

## ASDMは「ASA側の配布元」と「PC側のアプリ」の2層でできている

手順の前に、ASDMの構造を整理しておきます。ここを誤解していると、「ページは開けるのに起動しない」という状態がなぜ起きるのかがわかりません。

ASDMは、ASAの中で動くWebアプリではありません。ASAの上にあるのは配布用のファイルで、実際にGUIとして動くのはPCにインストールされるJavaのデスクトップアプリです。

| 層     | 置き場所                            | 役割                                                                                        |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| 配布元 | ASAのflash（`disk0:/asdm.bin`など） | ASDMのイメージを持ち、HTTPSでLauncherとアプリ本体を配る（`http server enable`で有効になる） |
| 実体   | 管理PC                              | ASDM-IDM LauncherとJavaのアプリが動き、ASAに接続してGUIを表示する                           |

ブラウザで`https://192.0.2.1`を開いて「Install ASDM Launcher」が表示されるのは、配布元の層が正常に動いているということです。ネットワークの疎通、HTTPSでの管理アクセス、ASAのWebサーバー機能までは問題ありません。

一方で、起動するかどうかは実体の層、つまりPC側でJavaのアプリが動くかどうかで決まります。配布元が正常でも、PC側の実行環境がそろっていなければ起動しません。「ページは開けるのに起動しない」は、この2層の片方だけが壊れている状態として普通に起こります。

### ASA側を確認したコマンド

私の環境では、まずASA側を疑って次の3つを確認しました。いずれも特権EXECモード（`ciscoasa#`）で実行します。

```text
ciscoasa# show run http
ciscoasa# show asdm image
ciscoasa# dir disk0:
```

| コマンド          | 何を見るか                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `show run http`   | running-configのうち`http`で始まる行だけを表示する。`http server enable`と、管理アクセスを許可する`http <ネットワーク> <マスク> <インターフェイス>`の行があるかを見る |
| `show asdm image` | ASAがASDMとして配布しているイメージのファイル名を表示する                                                                                                             |
| `dir disk0:`      | flash（`disk0:`）のファイル一覧とサイズを表示する。イメージが存在するか、サイズが不自然に小さくないかを見る                                                           |

結果は、管理アクセスの許可あり、配布イメージは`disk0:/asdm.bin`、`asdm.bin`はflashに存在してサイズも正常でした。

```text
ciscoasa# show asdm image

Device Manager image file, disk0:/asdm.bin
```

ファイル破損の線は薄く、この時点でASA側は問題なしと判断しました。

## show asdm imageのファイル名で、自分の環境がどちらか判定できる

ASDMのイメージには、ファイル名の異なる2種類があります。

| ファイル名                 | 中身          | PC側のJava             |
| -------------------------- | ------------- | ---------------------- |
| `asdm-7221-xx.bin`         | Oracle JRE版  | 別途インストールが必要 |
| `asdm-openjre-7221-xx.bin` | OpenJRE同梱版 | 不要                   |

そして、**ASAのパッケージにバンドルされるのはOracle JRE版だけです。** OpenJRE版を使うには、自分でCisco.comから入手してASAにコピーし、`asdm image`で指定する必要があります。この点はCisco公式のASDMのリリースノートに書かれていて、ASDM 7.12のころからほぼ同じ文面が載り続けています。

なので、判定は1行で済みます。

> [!TIP] 自己診断
> `show asdm image`のファイル名に`openjre`が含まれていなければ、Oracle JRE版です。PCにOracle JRE 8.0かOpenJRE 1.8.xを入れていない限り、それが起動しない原因です。

私の環境の`disk0:/asdm.bin`も、ファイル名に`openjre`を含まないOracle JRE版でした。

## Oracle JRE版とOpenJRE版がある理由はJavaのライセンス

なぜCiscoは同じASDMを2種類用意しているのか。技術的な都合ではなく、Javaのライセンスの事情から生まれた分岐です。

### Javaは仕様の名前で、実装は複数ある

「Java」は言語と実行環境の仕様（規格）の名前で、それを実装したものが複数あります。

- OpenJDK：オープンソースの実装。無償で使える
- Oracle JDK／JRE：Oracleの製品版

Java 11以降のOracle JDKはOpenJDKのソースをベースにしていて、中身はほぼ同じです。違うのはサポートとライセンスです。JRE（Java Runtime Environment）はJavaのプログラムを動かすための実行環境、JDK（Java Development Kit）はそこに開発ツールを加えたものです。ASDMを動かすだけならJREで足ります。

### 2019年に有償化されたのは「Oracle版のJava」

2019年1月、OracleはJava SEのライセンスを変更し、商用利用を有償のサブスクリプションにしました。

よく「Javaが有償化された」と言われますが、正確には「Oracle版が有償化された」です。無償で使える実装はもともとありました。ただ、ASDMのようにOracle JREを前提にしたソフトウェアにとっては、利用者がOracle Javaを気軽に入れられなくなった、という影響が残りました。

### 再配布できるかどうかが「同梱」できるかを分けた

ここが2種類ある理由の核心です。

| 実装       | 再配布                                       | ASDMでの扱い                                                                        |
| ---------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Oracle JRE | 再配布できない                               | Ciscoが同梱できないので、`asdm.bin`は「PCのどこかにあるJavaを探しに行く」作りになる |
| OpenJDK    | GPL＋Classpath例外のライセンスで再配布できる | ランタイムごと`.bin`に詰め込める。これが`asdm-openjre-xxxx.bin`                     |

Classpath例外は、GPLのライブラリとリンクしたプログラムでも、プログラム側にGPLを強制しないという例外条項です。これがあるので、Ciscoは自社のアプリとOpenJDKのランタイムをまとめて配れます。

つまり、Oracle JRE版は「Javaを持ってこられないので、PCにあるものを使わせてもらう」作り、OpenJRE版は「Javaごと持ってくる」作りです。

### ASAにOracle JRE版がバンドルされる理由（考察）

> [!NOTE]
> ここからは私の考察です。Ciscoは、バンドルするのがOracle JRE版である理由を明記していません。

- OpenJRE版が登場したのはASA 9.12(2)／ASDM 7.12(2)のころです。それ以前はASDMが1種類しかなく、あとから追加されたOpenJRE版がオプションの扱いのまま据え置かれているのだと思われます
- CLIだけで運用する現場や、Oracle Javaのライセンスを持っている企業、FMC（Secure Firewall Management Center）などで管理していてASDMを使わない構成も普通にあります。そうした利用者にとっては、どちらがバンドルされていても困りません

ただ、利用者の側から見ると、Oracle Javaを導入しづらくなった今、デフォルトのまま使える人のほうが少数派だと思います。仕様と実態がずれている状態です。

## 起動しなかったときに出たエラーと原因

ここからは、実際に起きた症状を順に整理します。最終的な原因は前の章のとおりですが、途中のエラーにもそれぞれ理由がありました。

### javaw.exe が見つかりません：PCにJavaがない

Launcherをインストールして起動すると、最初に出たのはこのエラーでした。

```text
javaw.exe が見つかりません
```

`javaw.exe`は、コンソールウィンドウを開かずにJavaのアプリを動かすための実行ファイルです。管理PCのコマンドプロンプトで確認すると、Javaがインストールされていませんでした。

```bat
C:\> java -version
'java' は、内部コマンドまたは外部コマンド、
操作可能なプログラムまたはバッチ ファイルとして認識されていません。
```

`java -version`は、PATHが通っているJavaのバージョンを表示するコマンドです。このエラーは「`java`という名前の実行ファイルがPATHのどこにも見つからない」という意味なので、Javaが入っていないか、入っていてもPATHが通っていないかのどちらかです。

Oracle JRE版のASDMは、PCにあるJavaを探しに行きます。PCにJavaがなければ、Launcherは起動するアプリを見つけられません。

このとき私はTemurin（Eclipse Adoptiumが配布しているOpenJDK）の17を入れ、`java -version`は通るようになりました。

> [!WARNING]
> あとから気づいたのですが、CiscoがASDMの動作要件としているのはOracle JRE 8.0かOpenJRE 1.8.xです。Java 17はサポート対象外でした。「Javaなら新しいほうがいい」とは限りません。

### invisible.vbs が見つかりません：ショートカットの作業フォルダーが空

Javaを入れたあと、今度はこのエラーが出ました。

```text
Windows Script Host

スクリプト ファイル "C:\WINDOWS\system32\invisible.vbs" が見つかりません。
```

デスクトップにできたASDM Launcher（Cisco ASDM-IDM Launcher）のショートカットのプロパティを開くと、リンク先はこうなっていました。

```text
C:\Windows\System32\wscript.exe invisible.vbs run.bat
```

一見すると壊れているように見えますが、**これはCiscoの標準の、正しい形です。** Ciscoのコミュニティでも、リンク先をこの形に直すのが正解として共有されています。

| 部分                              | 意味                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| `C:\Windows\System32\wscript.exe` | Windows Script Host。VBScriptを実行するWindows標準のプログラム |
| `invisible.vbs`                   | wscript.exeに実行させるスクリプト（1つ目の引数）               |
| `run.bat`                         | invisible.vbsに渡す引数                                        |

<!-- TODO: 確認（invisible.vbsとrun.batの中身。run.batがasdm-launcher.jarをjavaで起動している、invisible.vbsがrun.batを画面を出さずに実行している、と書けるか） -->

ファイルの実体は、ASDMの既定のインストール先にありました。

```text
C:\Program Files (x86)\Cisco Systems\ASDM\
  invisible.vbs
  run.bat
  asdm-launcher.jar
```

ファイルは正しい場所にあるのに、Windowsは`C:\WINDOWS\system32\`を探しに行っている。つまり「ファイルが壊れている」のではなく、「探す場所が違う」状態です。

原因は相対パスの解決のされ方にあります。リンク先の`invisible.vbs`と`run.bat`はフォルダーを含まない相対パスで、相対パスはショートカットの「作業フォルダー」を基準に解決されます。Windowsのスクリプト実行では、作業ディレクトリは「スクリプトが置かれた場所」ではなく「起動された場所」になります。作業フォルダーが空だと、wscript.exe自身の居場所である`System32`が基準になり、`C:\WINDOWS\system32\invisible.vbs`を探してしまいます。

対処は、ショートカットのプロパティの「作業フォルダー」に、ASDMのインストール先を設定することです。

```text
"C:\Program Files (x86)\Cisco Systems\ASDM"
```

パスに空白が含まれるので、ダブルクォーテーションで囲みます。

## OpenJRE版に切り替える手順

ここまでのエラーは個別に対処できますが、根本はOracle JRE版がPCのJavaに依存していることです。OpenJRE版に切り替えれば、PC側のJavaの有無やバージョンを気にする必要がなくなります。

### 1. asdm-openjre版を入手する

Cisco.comのソフトウェアダウンロードから、ASAで使っているASDMと同じバージョンの`asdm-openjre-7221-xx.bin`を入手します。ダウンロードには契約が必要です。

### 2. ASAのflashへ転送する

TFTPサーバーにファイルを置き、ASAから取りに行きます。

```text
ciscoasa# copy tftp://<TFTPサーバー>/asdm-openjre-7221-xx.bin disk0:
```

| 部分                                             | 意味                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `copy`                                           | ファイルをコピーするコマンド。`copy <コピー元> <コピー先>`の順に書く |
| `tftp://<TFTPサーバー>/asdm-openjre-7221-xx.bin` | コピー元。TFTPサーバーのアドレスとファイル名を指定する               |
| `disk0:`                                         | コピー先。ASAのflash                                                 |

実行すると、コピー元のアドレスや保存先のファイル名を確認されます。表示された内容でよければ、そのままEnterで進めます。

TFTPのほかに、SCPやFTPでも転送できます。TFTPは認証も暗号化もないので、管理用のネットワークの中だけで使ってください。

<!-- AD: USB-シリアル（RJ45）コンソールケーブル -->

### 3. 転送できたかを確認する

```text
ciscoasa# dir disk0:
```

`asdm-openjre-7221-xx.bin`が一覧にあり、サイズがダウンロードしたファイルと一致しているかを確認します。

### 4. 使うイメージを切り替えて保存する

```text
ciscoasa# configure terminal
ciscoasa(config)# asdm image disk0:/asdm-openjre-7221-xx.bin
ciscoasa(config)# end
ciscoasa# write memory
```

| コマンド                                     | 意味                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `configure terminal`                         | グローバルコンフィギュレーションモードに入る                                                             |
| `asdm image disk0:/asdm-openjre-7221-xx.bin` | ASDMとして配布するイメージを指定する。指定できるのは1つだけで、前の指定（`disk0:/asdm.bin`）は置き換わる |
| `end`                                        | 設定モードを抜けて、特権EXECモードに戻る                                                                 |
| `write memory`                               | running-configをstartup-configに保存する。保存しないと、再起動したときに元のイメージの指定に戻る         |

元の`asdm.bin`は消さずに残しておくと、`asdm image disk0:/asdm.bin`の1行で元に戻せます。

### 5. 切り替わったかを確認する

```text
ciscoasa# show asdm image
```

表示されるファイル名が`disk0:/asdm-openjre-7221-xx.bin`になっていれば、切り替わっています。

### 6. PCのLauncherを入れ直す

PCに入っている既存のASDM Launcherをアンインストールし、ブラウザで`https://192.0.2.1`を開いて、表示される「Install ASDM Launcher」からLauncherをインストールし直します。

### 切り替えの影響範囲

| 項目                         | 影響                         |
| ---------------------------- | ---------------------------- |
| ASAの再起動                  | 不要                         |
| 通過している通信             | 影響なし                     |
| ファイアウォールとしての動作 | 影響なし                     |
| 変わるもの                   | ASDMとして何を配布するかだけ |

`asdm image`が変えるのは、2層のうち配布元の層だけです。ファイアウォールとしての処理には関わりません。

### 切り替えた結果

PCにJavaを入れなくても、ASDMが起動するようになりました。

Oracle JRE版で出ていた`invisible.vbs が見つかりません`も、OpenJRE版に切り替えてLauncherを入れ直した環境では再現しませんでした。これは私の環境で観測した結果です。Launcherのパッケージの構成の違いが理由ではないかと考えていますが、確かめてはいません。

## ASDMが起動しないときによくある誤解

### ArrayIndexOutOfBoundsExceptionはLauncherが壊れている証拠ではない

切り分けの途中で、Launcherのjarファイルを直接実行しました。

```bat
C:\> java -jar asdm-launcher.jar
Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException
```

`java -jar <ファイル>`は、jarファイルに書かれたメインのクラスを実行するコマンドです。ここでは引数を何も渡していません。

この例外は、**引数なしで実行したときに出るもの**で、Launcherが壊れている証拠にはなりません。`ArrayIndexOutOfBoundsException`は、配列の範囲外の要素を読もうとしたときに出る例外です。プログラムが受け取るはずの引数を読もうとして、引数がないので範囲外になった、と読むのが自然です。

ここで「壊れている」と判断して再インストールを繰り返すと、時間を溶かします。私も誤判定しかけました。

### 新しいJavaを入れれば動くわけではない

`javaw.exe が見つかりません`が出ると、とりあえず最新のJavaを入れたくなります。ですが、Oracle JRE版のASDMが要件としているのはOracle JRE 8.0かOpenJRE 1.8.xです。私が入れたTemurin 17も対象外でした。

### ブラウザだけでは起動できない

ASDM 7.18以降は、Java Web Start（ブラウザからJavaのアプリを起動する仕組み）のサポートが終わっています。Launcherのインストールが必須で、ブラウザの中で完結させる逃げ道はありません。

### invisible.vbsのショートカットは壊れていない

`wscript.exe invisible.vbs run.bat`というリンク先は、見慣れないので壊れているように見えます。ですが、これがCiscoの標準の形です。直すのはリンク先ではなく作業フォルダーです。

<!-- AD: Cisco ASAの参考書 -->

## まとめ：ASA更改の手順書にOpenJRE版への差し替えを入れておく

- ASDMは、ASA側の配布元とPC側のアプリの2層でできている。ブラウザでページが開けても、PC側の実行環境がなければ起動しない
- `show asdm image`のファイル名に`openjre`がなければOracle JRE版。PCにOracle JRE 8.0かOpenJRE 1.8.xが必要
- ASAにバンドルされるのはOracle JRE版だけ。Oracle JREは再配布できず、OpenJDKは再配布できる、というライセンスの違いが2種類ある理由
- `invisible.vbs が見つかりません`は、ショートカットの作業フォルダーが空なのが原因。リンク先は正しい
- `java -jar asdm-launcher.jar`の`ArrayIndexOutOfBoundsException`は、引数なしで実行したときに出るもので、破損の証拠ではない

ASAのバージョンアップや機器の更改では、新しいイメージに同梱されているのはOracle JRE版です。手順書の段階で、`asdm-openjre`版の入手・転送・`asdm image`での切り替えを作業項目に入れておけば、作業後に「ASDMが起動しない」で足止めされずに済みます。ASAの再起動も通信への影響もない作業なので、手順書に入れておく負担は大きくありません。

## 参考リンク

- [Release Notes for Cisco Secure Firewall ASDM, 7.22(x) - Cisco](https://www.cisco.com/c/en/us/td/docs/security/asdm/7_22/release/notes/rn722.html)
- [Troubleshoot ASDM Launch Problems - Cisco](https://www.cisco.com/c/en/us/support/docs/security/secure-firewall-asdm/222646-troubleshoot-asdm-launch-problems.html)
- [Troubleshoot ASDM License, Upgrade and Compatibility Problems - Cisco](https://www.cisco.com/c/en/us/support/docs/security/secure-firewall-asdm/222645-troubleshoot-asdm-license-upgrade-and-c.html)
