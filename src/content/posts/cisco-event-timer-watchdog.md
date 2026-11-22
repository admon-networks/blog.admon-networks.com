---
title: "Event Timer Watchdogコマンド簡易解説"
description: "概要 Cisco機器で設定する event timer watchdogについてまとめました。 （CCNPの学習をしていてコマンド構文を毎回忘れてしまうため備忘録として・・・） コマンド構文 (configapplet)…"
pubDatetime: 2025-09-21T10:40:41.000Z
modDatetime: 2025-10-02T15:14:51.000Z
tags: ["CCNP", "Cisco", "ネットワーク", "ネットワーク/ Network"]
ogImage: "../../assets/wp/2025/09/image.png"
---

## 概要

Cisco機器で設定する event timer watchdogについてまとめました。  
（CCNPの学習をしていてコマンド構文を毎回忘れてしまうため備忘録として・・・）

## コマンド構文

(config-applet)モードで下記のコマンドを実行します。

```text
Router(config-applet)#event timer watchdog time [秒数]
```

event timer watchdog time \[秒数\]と入力すると、指定した秒数毎にコマンドを実行してくれます。

上の例だと60秒ごとに特定のコマンドが実行されます。

## 設定例

```text
Router(config)#event manager applet TEST
Router(config-applet)#event timer watchdog time 30
Router(config-applet)#action 1.0 puts "Test"
Router(config-applet)#end
```

TESTという名前のEEMアプレットを作成し、30秒ごとにTestと表示するEEMを作成

## おまけ

watchdogは番犬という意味だそうです。  
timer cron cron-entryというコマンドを実行すると指定した日時をトリガーにコマンドを実行するように設定することも可能です。
