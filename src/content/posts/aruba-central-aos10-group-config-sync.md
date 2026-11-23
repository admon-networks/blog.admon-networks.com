---
title: "Aruba Centralでconfigが同期しない｜APがAOS 8"
description: "Aruba CentralでAOS 10のグループに入れたAPのconfigが同期せず、SSIDが反映されませんでした。AOS 8.x出荷のAPがAOS 10へアップグレードされて解決した経緯と、公式ドキュメントで確かめた仕様、確認ポイントをまとめます。"
pubDatetime: 2026-11-23T18:00:00+09:00
tags: ["Aruba", "トラブルシュート", "ネットワーク", "無線"]
ogImage: "../../assets/posts/eyecatch-aruba-central-aos10-group-config-sync.png"
---

Aruba Central（HPE Aruba Networkingのクラウド型のネットワーク管理サービス）で、configが同期しないAPがありました。グループはAOS 10で作り、APは出荷時のAOS 8.xのまま、そのグループにアサインしていました。ホスト名は変わったのに、SSIDなどの設定はAPに反映されませんでした。

私の環境では、**APがAOS 10系にアップグレードされたあと、configが反映されるようになりました。** 「グループはAOS 10なのに、APがAOS 8のままでconfigが同期しない」という状態なら、まずAPのファームウェアがAOS 10に上がっているかを確かめてください。

> [!NOTE] この記事について
> 同期しなかった本当の原因は、特定できていません。ファームウェアの世代の違いが原因だったのか、アップグレードが終わる前の一時的な状態だったのかは確かめておらず、私が確認できたのは「アップグレードのあとに解決した」ところまでです。仕様の説明は、Arubaの公式ドキュメントで確認できた範囲にとどめています。

## 検証した環境

| 項目                             | 内容                                               |
| -------------------------------- | -------------------------------------------------- |
| 管理                             | Aruba Central                                      |
| グループ                         | AOS 10（グループの作成時にAOS 10系を選択）         |
| AP                               | <!-- TODO: 確認（APの型番） -->                    |
| APの出荷時のファームウェア       | AOS 8.x <!-- TODO: 確認（具体的なバージョン） -->  |
| アップグレード後のファームウェア | AOS 10系 <!-- TODO: 確認（具体的なバージョン） --> |
| Centralのバージョン              | <!-- TODO: 確認（Centralのバージョン） -->         |
| 作業した時期                     | <!-- TODO: 確認（作業した年月） -->                |

## 症状：ホスト名は変わったが、SSIDが反映されなかった

Aruba Centralでは、グループを作るときに、AOS 10系とAOS 8系のどちらで管理するかを選べます。私はAOS 10を選びました。

一方で、手元のAPは出荷時のAOS 8.xのままでした。このAPを、AOS 10のグループにアサインしました。APがCentralにつながる前に、所属するグループを決めておく形のアサイン（プリプロビジョニング）です。

その結果、configが同期しませんでした。

| 設定     | APへの反映       |
| -------- | ---------------- |
| ホスト名 | 反映された       |
| SSIDなど | 反映されなかった |

<!-- TODO: 確認（同期しないことをCentralのどの画面で確認したか、エラー表示の有無） -->

ホスト名だけが反映され、SSIDが反映されなかった理由はわかっていません。

## 対処：APがAOS 10にアップグレードされたら解決した

AOS 10のグループにアサインしたAPは、そのままAOS 10系へアップグレードできました。アップグレードのあと、configが同期しない問題は解決しました。

<!-- TODO: 確認（アップグレードが自動で始まったのか、手動で行ったのか） -->
<!-- TODO: 確認（解決までにかかった時間） -->

## 原因：断定はできていない

私が観察できたのは、次の2つだけです。

- APがAOS 8.xの間は、ホスト名以外のconfigが反映されなかった
- AOS 10にアップグレードされたあとは、問題が解決した

この2つから考えられる説明は、少なくとも2つあります。

1. AOS 10のグループの設定を、AOS 8.xのAPがそのまま受け取れなかった（ファームウェアの世代の違い）
2. アップグレードが終わる前の、一時的な状態を見ていた

どちらなのかは確かめていません。

公式の移行ガイド（[Migrating Aruba Central managed Instant APs to AOS 10](https://arubanetworking.hpe.com/techdocs/aos/aos10/migrate/aps/iap-central/)）では、APをAOS 10のグループへ移すと、CentralがAPをAOS 10にアップグレードし、そのあとで移動先のグループの設定がAPに適用される流れになっています。この流れからは、AOS 10のグループの設定は、APがAOS 10で動いていることを前提にしていると考えられます。ただし、AOS 8.xのAPがAOS 10のグループにいる間に、どの設定が反映されてどの設定が反映されないのかを説明した記述は、見つけられませんでした。

## 仕様の整理：2つの「AOS 10へのアップグレード」を分けて考える

調べている途中で、「AOS 8のAPはAOS 10に上げられない」という話と、「AOS 10のグループに入れたAPは上げられた」という私の経験が、食い違っているように見えました。これは、別の場面の話を混同していたのが原因でした。

### AOS 8のグループに紐づいたAPは、そのグループのままではAOS 10にできない

すでにAOS 8（Instant）のグループで管理しているAPを、AOS 10に上げようとすると、問題があってできない。私はそう理解していました。

現行の公式ドキュメントで確認できたのは、次の点です。

- AOS 10へ移行するときは、新しくAOS 10のグループを作る。Instant 8.xの設定を持つ既存のグループや、それを複製したグループは使わない（[Preparing Central for AOS 10 migration](https://arubanetworking.hpe.com/techdocs/aos/aos10/migrate/preparation/)）
- Instant AP用のグループを、AOS 10用のグループに直接変換することはできない（[FAQ - migrating to AOS 10](https://arubanetworking.hpe.com/techdocs/aos/aos10/migrate/faq/)）
- Centralで管理しているInstant APは、仮想コントローラー（VC：Virtual Controller）やAPを「Move Devices」でAOS 10のグループへ移すと、CentralがAOS 10にアップグレードする（[Migrating Aruba Central managed Instant APs to AOS 10](https://arubanetworking.hpe.com/techdocs/aos/aos10/migrate/aps/iap-central/)）
- 移行の前には、移行元のAOS 8側の最低バージョンや、AOS 10に対応していない機種がクラスターに含まれていないことなど、前提条件がある（同上）

AOS 8のグループに入れたままAOS 10に上げる手順は用意されておらず、AOS 10のグループへ移すことが前提になっている、と読めます。

> [!NOTE] 以前のドキュメントの記述
> Aruba Centralの以前のドキュメント（2.5.5。現在はアーカイブ）の「Group Management for AOS 10.x」には、「ArubaOS 8.xのグループに追加したAPは、AOS 10.xにアップグレードできない」という記述がありました。現行の移行ガイドは、グループを移すことでアップグレードする手順になっています。アーカイブの記述を、そのまま今の仕様として読まないほうがよさそうです。

### AOS 10のグループにアサインしたAPは、AOS 10にアップグレードできた

私がやったのは、こちらです。出荷時にAOS 8.xだったAPを、最初からAOS 10のグループにアサインしました。このAPは、AOS 10系へ普通にアップグレードできました。

公式の準備ガイドでは、移行先のAOS 10のグループで、ファームウェアコンプライアンス（グループ内のAPのファームウェアを指定したバージョンにそろえる設定）を有効にし、AOS 10のバージョンを選んでおくよう案内されています（[Preparing Central for AOS 10 migration](https://arubanetworking.hpe.com/techdocs/aos/aos10/migrate/preparation/)）。

<!-- TODO: 確認（自分のAOS 10のグループで、ファームウェアコンプライアンスを設定していたか） -->

### 2つを並べると

|                          | AOS 8のグループに紐づいたAP                            | AOS 10のグループにアサインしたAP |
| ------------------------ | ------------------------------------------------------ | -------------------------------- |
| APのいるグループ         | AOS 8（Instant）                                       | AOS 10                           |
| AOS 10へのアップグレード | そのグループのままではできない。AOS 10のグループへ移す | できた                           |
| 根拠                     | 公式の移行ガイド                                       | 私の作業結果                     |

「AOS 8のAPはAOS 10に上げられない」のではなく、「AOS 8のグループに入れたままでは上げられない」と分けて考えると、2つの話は食い違いません。

## 同じ状態になったときの確認ポイント

グループはAOS 10なのに、APのconfigが同期しないときは、次の順で確かめると切り分けやすくなります。

1. APのファームウェアが、AOS 8のままかどうか。グループの世代（AOS 10）と、APが動いているファームウェアの世代が合っているかを見ます。私の環境では、AOS 10に上がったあとに解決しました
2. AOS 10のグループのファームウェアコンプライアンス。公式の準備ガイドでは、AOS 10のバージョンを指定しておくよう案内されています
3. 移行の前提条件。AOS 8側の最低バージョンや、AOS 10に対応した機種かどうかを、[公式の移行ガイド](https://arubanetworking.hpe.com/techdocs/aos/aos10/migrate/aps/iap-central/)で確認します
4. アップグレードのあとに、SSIDなどが反映されたか。ホスト名だけでなく、SSIDのように反映されていなかった設定を見直します

APがもともとAOS 8のグループで管理されていた場合は、話が変わります。そのグループのままAOS 10に上げようとせず、新しく作ったAOS 10のグループへ移す手順を、公式の移行ガイドで確認してください。

<!-- AD: 無線LANの解説書 -->

## まとめ

- AOS 10のグループに、出荷時のAOS 8.xのままのAPをアサインしたところ、ホスト名は変わったが、SSIDなどのconfigは反映されなかった
- APがAOS 10系にアップグレードされたあと、問題は解決した。原因が世代の違いなのか、アップグレード前の一時的な状態なのかは特定していない
- 「AOS 8のグループに紐づいたAPを、そのままAOS 10に上げる」ことと、「AOS 10のグループにアサインしたAPを、AOS 10に上げる」ことは別の話。前者は公式の移行ガイドでも、AOS 10のグループへ移す手順になっている
- configが同期しないときは、まずAPのファームウェアがグループの世代（AOS 10）に合っているかを確かめる

## 参考にした公式ドキュメント

- [Migrating Aruba Central managed Instant APs to AOS 10](https://arubanetworking.hpe.com/techdocs/aos/aos10/migrate/aps/iap-central/)
- [Preparing Central for AOS 10 migration](https://arubanetworking.hpe.com/techdocs/aos/aos10/migrate/preparation/)
- [FAQ - migrating to AOS 10](https://arubanetworking.hpe.com/techdocs/aos/aos10/migrate/faq/)
