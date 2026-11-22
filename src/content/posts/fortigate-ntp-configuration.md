---
title: "FortiGateのNTPサーバーを指定する方法"
description: "FortiGateが時刻同期をするための設定について解説します。 デフォルトの設定では、インターネット上のFortiGuardサーバと同期を行う設定になっております。 CLIで設定を変更するまでは、GUIからサーバを変更…"
pubDatetime: 2025-01-21T15:36:33.000Z
modDatetime: 2025-12-28T02:05:54.000Z
tags: ["FortiGate", "セキュリティ", "ネットワーク", "ファイアウォール"]
ogImage: "../../assets/wp/2025/01/プレゼンテーション1.jpg"
---

FortiGateが時刻同期をするための設定について解説します。

デフォルトの設定では、インターネット上のFortiGuardサーバと同期を行う設定になっております。  
CLIで設定を変更するまでは、GUIからサーバを変更することができないため、  
FortiGuard以外のNTP同期先を指定する場合は、CLIで設定を行います。

```text
#config system ntp
#set type custom
#config ntpserver
#edit 1
#set server ntp.nict.jp
#end
#end

※"#"の左には機器に設定しているホスト名が表示されます
```

上記のset server コマンドには、FortiGateが参照するNTPサーバのFQDN、又はIPアドレスを指定します。

なお、FortiGateが参照するNTPサーバをcustomから「FortiGuard」に戻す場合は、以下のコマンドを実行します。

```text
#config system ntp
#set type fortiguard
#end

※"#"の左には機器に設定しているホスト名が表示されています。
```

<script type="text/javascript">rakuten_design="slide";rakuten_affiliateId="4f8ece4a.5217c53c.4f8ece4b.90feb009";rakuten_items="ctsmatch";rakuten_genreId="0";rakuten_size="468x160";rakuten_target="_blank";rakuten_theme="gray";rakuten_border="off";rakuten_auto_mode="on";rakuten_genre_title="off";rakuten_recommend="on";rakuten_ts="1766887475333";</script><script type="text/javascript" src="https://xml.affiliate.rakuten.co.jp/widget/js/rakuten_widget.js?20230106"></script>
