---
title: "【CCNP学習】usernameコマンドで作成するユーザにパスワードポリシーを適用する方法"
description: "概要 CCNP ENCORの試験対策で機器にログインするユーザを作成し、パスワードポリシーを適用する方法を学んだので、 備忘も兼ねてまとめてます。 コマンドと解説 手順は下記の通り。 ①aaa newmodel コマンド…"
pubDatetime: 2025-09-23T07:38:36.000Z
modDatetime: 2025-10-02T15:18:00.000Z
tags: ["CCNP", "CCNP ENCOR", "Cisco", "セキュリティ", "ネットワーク", "ネットワーク/ Network"]
ogImage: "../../assets/wp/2025/09/image-4.png"
---

## 概要

CCNP ENCORの試験対策で機器にログインするユーザを作成し、パスワードポリシーを適用する方法を学んだので、  
備忘も兼ねてまとめてます。

## コマンドと解説

```text
(config)#aaa new-model
(config)#aaa common-criteria policy [ポリシー名]
(config-cc-policy) #max-length [パスワードの最大文字数]
(config-cc-policy) #min-length [パスワードの最小文字数]
(config-cc-policy) #lifetime {year | month | day | hours | minutes | seconds) {パスワード有効期間｝
(config)#username [ユーザ名] [privilege [レベル]] common-criteria-policy [ポリシー名] password [パスワード文字列]
```

手順は下記の通り。  
  
①aaa new-model コマンドで **AAAを有効化**  
②aaa common-criteria policy \[ポリシー名\] コマンドで **\[ポリシー名\]のパスワードポリシーを作成**  
③max-length \[パスワードの最大文字数\] コマンドで **設定できるパスワードの最大文字数を定義**  
④min-length \[パスワードの最大文字数\] コマンドで **設定できるパスワードの最小文字数を定義**  
⑤lifetime {year | month | day | hours | minutes | seconds) {パスワード有効期間｝ コマンドで **パスワードの有効期間を定義**  
⑥username \[ユーザ名\] \[privilege \[レベル\]\] common-criteria-policy \[ポリシー名\] password \[パスワード文字列\] コマンドで  
**ユーザを作成し、作成したポリシーを適用のうえ、パスワードの設定**  

## 補足や気づいたこと

criteriaは、「基準」という意味を持つ単語だそうで、クライテリアと読む。  
下記のコマンドを実行するとさらに細かいパスワードポリシーを定義できるようです。（おそらくCCNPではでない）

#### パスワード内の数字の数を指定

```text
(config-cc-policy)# numeric-count [数字]
```

\[数字\]に入力した数の数字を含めるようパスワードポリシーを定義

#### パスワード内の特殊文字の数を指定

```text
e(config-cc-policy)# special-case [数字]
```

\[数字\]に入力した数の特殊文字を含めるようパスワードポリシーを定義

#### 確認コマンド①**show aaa common-criteria policy name** \[ポリシー名\]

```text
# show aaa common-criteria policy name policyTest

Policy name: policyTest
Minimum length: 5
Maximum length: 15
Upper Count: 20
Lower Count: 20
Numeric Count: 3
Special Count: 4
Number of character changes 4
Valid forever. User tied to this policy will not expire.
```

ポリシーで定義されている最大文字数や最小文字数、有効期限が切れていないかなどを確認できる。  

## 参考

[Cisco IOS XE 15.2(6)E（Catalyst 2960-XR スイッチ）統合プラットフォーム コンフィギュレーション ガイド](https://www.cisco.com/c/ja_jp/td/docs/switches/lan/catalyst2960xr/software/15_2_6_e/configuration_guide/b_1526e_consolidated_2960xr_cg/b_1526e_consolidated_2960xr_cg_chapter_0111010.html#GUID-E534CBDE-E6CD-4651-8CA4-DA9D6EDA2740)

<a href="https://px.a8.net/svt/ejp?a8mat=45E95Q+7YYYCY+5P1E+5ZEMP" rel="nofollow">
<img border="0" width="320" height="100" alt="" src="https://www22.a8.net/svt/bgt?aid=250927838482&wid=001&eno=01&mid=s00000026573001005000&mc=1"></a>
<img border="0" width="1" height="1" src="https://www18.a8.net/0.gif?a8mat=45E95Q+7YYYCY+5P1E+5ZEMP" alt="">
