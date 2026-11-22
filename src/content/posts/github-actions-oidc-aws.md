---
title: "OIDCとは？GitHub ActionsとAWS連携の仕組み"
description: "GitHub ActionsからAWSへアクセスキーなしで認証できるOIDCの仕組みを解説。OIDCプロバイダーと信頼ポリシーの役割を、証明書認証のIPsecに例えて説明し、Terraformの最小構成も紹介します。"
pubDatetime: 2026-10-03T15:39:50.000Z
tags: ["AWS", "GitHub", "IT用語"]
ogImage: "../../assets/wp/2026/10/oidc-github-actions-aws-eyecatch.png"
---

GitHub Actions から AWS にデプロイする仕組みを作るとき、昔は IAM ユーザーのアクセスキーを GitHub の Secrets に登録する方法が定番でした。ただ、有効期限のない鍵を外部のサービスに預けておくのは、漏れたときのことを考えるとあまり気持ちのいいものではありません。

そこで今の主流になっているのが、**OIDC（OpenID Connect）**を使う方法です。鍵をどこにも保存せず、ワークフローが動くたびに、短時間だけ有効な認証情報をもらう仕組みです。

この記事では、GitHub Actions と AWS を OIDC でつなぐ仕組みを、登場人物と流れに分けて解説します。本業がネットワークエンジニアなので、途中で「証明書認証の IPsec」に例えた説明も入れています。ネットワーク寄りの人には、こちらのほうがピンとくるかもしれません。

**この記事でわかること**

-   OIDC とは何か、アクセスキー方式と何が違うのか
-   GitHub Actions が AWS のロールを引き受けるまでの流れ
-   「OIDC プロバイダー」と「信頼ポリシー」の役割の違い
-   Terraform で作る最小構成

## アクセスキー方式の何が問題なのか

アクセスキー方式では、IAM ユーザーのアクセスキーを GitHub の Secrets に保存し、ワークフローからそれを使って AWS にアクセスします。手軽ですが、OIDC 方式と比べると次のような違いがあります。

| 項目 | アクセスキー方式 | OIDC 方式 |
| --- | --- | --- |
| GitHub に保存する秘密情報 | アクセスキー（長期間有効） | なし |
| 認証情報の有効期限 | 削除するまで有効 | 1時間程度で自動的に失効 |
| 漏れたときの影響 | 気づいて無効化するまで使われ続ける | 短時間で失効し、決まった条件でしか発行されない |
| ローテーション | 定期的に手作業で必要 | 不要 |

OIDC 方式では、そもそも「盗まれる鍵」が GitHub 側に存在しません。これが一番大きな違いです。

## OIDCとは

OIDC（OpenID Connect）は、OAuth 2.0 の上に「相手が誰なのか」を証明する仕組みを足した認証の規格です。Web サービスでよく見る「Google でログイン」のようなボタンの裏側でも使われています。

中心になるのは**IDトークン**です。IDトークンは JWT（JSON Web Token）という形式のデータで、「誰についての情報か」「誰が発行したか」「誰に宛てたものか」などが書かれていて、発行者の秘密鍵で署名されています。受け取った側は、発行者の公開鍵で署名を検証することで、中身が改ざんされていないこと、本当にその発行者が出したものであることを確認できます。

GitHub Actions の場合は、GitHub が IDトークンの発行者になります。ワークフローのジョブごとに「このジョブは、○○リポジトリの main ブランチで動いています」という内容の IDトークンを発行し、AWS はそれを検証して信用する、という関係です。

## GitHub ActionsがAWSのロールを引き受けるまでの流れ

### 登場人物

| 登場人物 | 役割 |
| --- | --- |
| GitHub（`token.actions.githubusercontent.com`） | ジョブごとに IDトークンを発行する |
| IAM の OIDC プロバイダー | 「この発行者のトークンなら検証対象にする」という登録 |
| IAM ロールの信頼ポリシー | 「どの条件のトークンなら、ロールを引き受けてよいか」の定義 |
| STS（Security Token Service） | 条件を満たしたときに、一時的な認証情報を発行する |

### 4つのステップ

1.  ワークフローが動くと、GitHub が IDトークンを発行する。リポジトリ名やブランチなどの情報が入っていて、GitHub の秘密鍵で署名されている
2.  ワークフロー（`aws-actions/configure-aws-credentials`）が、そのトークンを STS に提示して「このロールを引き受けたい」と依頼する（`AssumeRoleWithWebIdentity`）
3.  AWS が、トークンの署名を GitHub の公開鍵で検証し、宛先（`aud`）と、ロールの信頼ポリシーの条件（`sub` など）を確認する
4.  すべて通れば、STS が一時的な認証情報（初期値では1時間で失効）を返し、以降のステップはそれを使って AWS を操作する

### IDトークンの中身

実際の IDトークンには、次のような情報（クレーム）が入っています。主なものだけ抜粋しています。

```json
{
  "iss": "https://token.actions.githubusercontent.com",
  "aud": "sts.amazonaws.com",
  "sub": "repo:example-org/example-repo:ref:refs/heads/main",
  "repository": "example-org/example-repo",
  "repository_owner": "example-org",
  "ref": "refs/heads/main",
  "workflow": "Deploy"
}
```

| クレーム | 意味 |
| --- | --- |
| `iss` | 発行者。GitHub Actions なら `https://token.actions.githubusercontent.com` |
| `aud` | 宛先。AWS に渡すときは `sts.amazonaws.com` |
| `sub` | 主体。どのリポジトリの、どのブランチ（や環境）のジョブかを表す。信頼ポリシーで一番大事な条件 |

なお、`sub` の形式は、2026年7月15日以降に作成したリポジトリでは `repo:example-org@12345678/example-repo@987654321:ref:refs/heads/main` のように、オーナーとリポジトリの数値IDが付いた形式に変わっています。従来の形式のまま信頼ポリシーを書くと認証に失敗するので、詳しくは「[GitHub OIDCでAssumeRoleが失敗する原因と対処](/github-actions-oidc-sub-immutable-id/)」で解説しています。

## 証明書認証のIPsecで例えるとわかりやすい

ネットワークエンジニアなら、証明書認証の IPsec に置き換えるとイメージしやすいと思います。

| OIDC（GitHub Actions × AWS） | 証明書認証の IPsec |
| --- | --- |
| OIDC プロバイダーの登録 | 信頼する CA 証明書を入れる |
| GitHub が発行する IDトークン | 対向が提示する証明書 |
| トークンの署名の検証 | 証明書チェーンの検証 |
| 信頼ポリシーの `sub` 条件 | 対向の ID（証明書のサブジェクト）を限定する設定 |
| 一時的な認証情報 | 寿命付きの SA |

IPsec で CA 証明書を入れただけだと、その CA が発行した証明書を持っている相手なら、誰でもつながれてしまいます。だから普通は、対向の ID（サブジェクト）も指定して、つながってよい相手を絞りますよね。

OIDC もまったく同じです。GitHub の IDトークンは、世界中のどのリポジトリのワークフローでも発行されます。OIDC プロバイダーを登録しただけの状態は「GitHub が発行したトークンなら検証する」というだけで、「誰の」トークンなのかはまだ絞れていません。

**そのため、信頼ポリシーの `sub` 条件で、リポジトリとブランチを必ず絞ります。**ここを書かなかったり、ワイルドカードで緩くしすぎたりすると、他人のリポジトリからでもロールを引き受けられる状態になってしまいます。

## OIDCプロバイダーとIAMロールの役割分担

### OIDCプロバイダー：アカウントに1つ

OIDC プロバイダーは、発行者の URL ごとに、アカウントに1つだけ作ります。GitHub Actions 用なら、複数のリポジトリから使う場合でも1つで足ります。

これ自体は何の権限も与えません。あくまで「この発行者のトークンを検証の対象にする」という登録です。逆に、削除してしまうと、これを使っているすべてのワークフローが AWS に認証できなくなるので、Terraform で管理するなら削除防止を付けておくと安心です。

### IAMロール：用途ごとに作る

IAM ロールは、リポジトリや用途ごとに分けて作ります。ロールには、役割の違う2種類のポリシーがあります。

-   **信頼ポリシー**：誰がこのロールを引き受けられるか（OIDC の条件を書く場所）
-   **権限ポリシー**：引き受けたあと、何ができるか

権限ポリシーは、そのワークフローに必要な操作だけに絞ります。たとえば、S3 に静的サイトを `aws s3 sync --delete` で反映するだけなら、必要なのは一覧の取得（`s3:ListBucket`）、アップロード（`s3:PutObject`）、削除（`s3:DeleteObject`）の3つです。

## Terraformで作る最小構成

ここまでの内容を、S3 にデプロイするワークフロー用の構成として Terraform で書くと、次のようになります。リポジトリ名やバケット名はダミーです。

### OIDCプロバイダー

```hcl
resource "aws_iam_openid_connect_provider" "github_actions" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # 削除すると、これを使うすべてのワークフローが認証できなくなる
  lifecycle {
    prevent_destroy = true
  }
}
```

`url` は GitHub Actions の IDトークンの発行者、`client_id_list` は宛先（`aud`）です。`aws-actions/configure-aws-credentials` は `sts.amazonaws.com` を宛先にしたトークンを使うので、この値にします。

以前はサーバー証明書の指紋（`thumbprint_list`）の指定が必要でしたが、現在の AWS プロバイダー（v6）では省略しても作成できます。

### デプロイ用のIAMロール

```hcl
# 誰がこのロールを引き受けられるか（信頼ポリシー）
data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    # STS 宛てに発行されたトークンだけを受け付ける
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # 指定したリポジトリの main ブランチからだけ引き受けられる
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:example-org/example-repo:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "example-site-deploy"
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

# ロールで何ができるか（aws s3 sync --delete に必要な最小限）
data "aws_iam_policy_document" "deploy" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::example-bucket"]
  }

  statement {
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::example-bucket/*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
```

信頼ポリシーでは、`aud` と `sub` の2つを `StringEquals`（完全一致）で確認しています。`sub` の値は、2026年7月15日以降に作ったリポジトリだと ID 付きの形式になる点に注意してください。

権限ポリシーでは、一覧の取得はバケット自体の ARN、アップロードと削除はバケットの中身（`/*`）の ARN が対象になります。対象の書き方が違うので、statement を分けています。

Terraform の state の保存先など、基本的な設定は「[TerraformのS3 Backendの解説記事](/terraform-s3-backend-tfstate/)」で解説しています。

### ワークフロー側の設定

```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  id-token: write # OIDC のトークンを発行するために必要
  contents: read  # リポジトリを checkout するために必要

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: ${{ vars.AWS_ROLE_ARN }}
          aws-region: ap-northeast-1

      - run: aws s3 sync . "s3://example-bucket" --delete --exclude ".git/*" --exclude ".github/*"
```

ワークフロー側で必須なのは、`permissions` の `id-token: write` です。これがないと、ジョブが IDトークンを発行してもらえず、AWS に認証できません。`contents: read` は、コードを checkout するための権限です。

`role-to-assume` には、作成した IAM ロールの ARN を指定します。ロールの ARN は秘密情報ではないので、Secrets ではなくリポジトリの Variables に登録しておくと、ログで値を確認しやすくて便利です。ARN を知られても、信頼ポリシーの条件を満たさないワークフローからは引き受けられません。

## まとめ

-   OIDC を使うと、GitHub に長期間有効なアクセスキーを置かずに AWS を操作できる
-   GitHub が IDトークンを発行し、AWS が署名と条件を確認して、一時的な認証情報を渡す
-   OIDC プロバイダーは「発行者を信頼する」登録、信頼ポリシーは「誰を通すか」の定義。IPsec でいう CA 証明書と対向 ID の関係
-   信頼ポリシーの `sub` 条件は必須。リポジトリとブランチまで絞る

2026年7月以降に作ったリポジトリで認証に失敗する場合は、`sub` の形式の変更が原因かもしれません。「[GitHub OIDCでAssumeRoleが失敗する原因と対処](/github-actions-oidc-sub-immutable-id/)」で、原因の切り分け方と対処法をまとめています。
