---
title: "GitHub OIDCでAssumeRoleが失敗する原因と対処"
description: "GitHub ActionsのOIDCで「Not authorized to perform sts:AssumeRoleWithWebIdentity」になる原因と対処法。2026年7月以降に作成したリポジトリはsubにIDが入る形式に変わっています。"
pubDatetime: 2026-10-03T15:52:17.000Z
tags: ["GitHub", "セキュリティ", "トラブルシュート"]
ogImage: "../../assets/wp/2026/10/github-oidc-assumerole-eyecatch.png"
---

GitHub Actions から AWS に OIDC で認証する設定をしたのに、ワークフローを実行すると次のエラーで失敗しました。

```text
Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity
```

IAM ロールも OIDC プロバイダーも作ってあるし、信頼ポリシーもネットの記事どおりに書いた。それなのに通らない……という状態です。

結論から言うと、原因は OIDC トークンの `sub` の形式でした。**2026年7月15日以降に作成した GitHub のリポジトリでは、`sub` にオーナーとリポジトリの数値IDが入る形式に変わっています。**信頼ポリシーをこの形式に合わせれば解決します。

この記事では、原因を切り分けた手順と、トークンの中身を確認する方法、信頼ポリシーの直し方を解説します。OIDC の仕組みそのものは「[OIDCとは？GitHub ActionsとAWS連携の仕組み](/github-actions-oidc-aws/)」で解説しています。

## 結論：subの形式が変わっている

| 形式       | `sub` の値（main ブランチの場合）                                      |
| ---------- | ---------------------------------------------------------------------- |
| 従来の形式 | `repo:example-org/example-repo:ref:refs/heads/main`                    |
| 新しい形式 | `repo:example-org@12345678/example-repo@987654321:ref:refs/heads/main` |

`@` の後ろの数字が、オーナー（ユーザーまたは組織）とリポジトリの ID です。信頼ポリシーの `sub` 条件を、新しい形式の値に変えれば認証が通ります。

## 発生した環境と症状

| 項目                           | 内容                                                |
| ------------------------------ | --------------------------------------------------- |
| リポジトリ                     | 2026年10月に新しく作成したプライベートリポジトリ    |
| 認証                           | `aws-actions/configure-aws-credentials@v5`          |
| IAM の管理                     | Terraform（AWS プロバイダー v6）                    |
| 信頼ポリシーの `sub`（失敗時） | `repo:example-org/example-repo:ref:refs/heads/main` |

Configure AWS credentials のステップで、冒頭のエラーになって失敗します。アクションが失敗後に何度か再試行するため、エラーが出るまでに1分以上かかりました。

## 原因の切り分け

`Not authorized to perform sts:AssumeRoleWithWebIdentity` は、AWS がロールの引き受けを拒否したときのエラーです。主な原因は次の2つなので、確認しやすい順に見ていきます。

1.  ロールが存在しない、または `role-to-assume` に渡している ARN が間違っている
2.  信頼ポリシーの条件と、実際のトークンの中身が合っていない

ちなみに、ワークフローの `permissions` に `id-token: write` がない場合や、`role-to-assume` が空の場合は、トークンを取得できないなどの別の種類のエラーになります。「Not authorized」と言われている時点で、トークンの発行とロールの指定まではできていると考えてよいです。

### 1\. ロールとARNを確認する

```bash
aws iam get-role --role-name example-site-deploy \
  --query 'Role.{Arn:Arn,Condition:AssumeRolePolicyDocument.Statement[0].Condition}' \
  --output json
```

`aws iam get-role` は、指定した名前のロールの情報を取得するコマンドです。`--query` で、ARN と信頼ポリシーの条件の部分だけを取り出しています。

```json
{
  "Arn": "arn:aws:iam::123456789012:role/example-site-deploy",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:sub": "repo:example-org/example-repo:ref:refs/heads/main",
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    }
  }
}
```

ロールがなければ `NoSuchEntity` エラーになります。表示された `Arn` と、ワークフローの `role-to-assume` に渡している値が、1文字も違わずに一致しているかも確認します。

私の場合は、ロールは存在していて ARN も一致、信頼ポリシーもネットの記事どおりの形でした。つまり、設定上は通るはずの状態です。

### 2\. トークンの中身を確認する

設定が正しそうなら、次に疑うのは「GitHub が実際に発行しているトークンの中身」です。ワークフローに、一時的に次のステップを追加します。Configure AWS credentials が失敗するとジョブはそこで止まるので、必ずその**前**に置きます。

```yaml
- name: Show OIDC claims (debug)
  run: |
    TOKEN=$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
      "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" | jq -r .value)
    python3 - "$TOKEN" << 'EOF'
    import base64, json, sys
    payload = sys.argv[1].split(".")[1]
    payload += "=" * (-len(payload) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload))
    print(json.dumps({k: claims.get(k) for k in ("sub", "aud", "repository", "ref")}, indent=2))
    EOF
```

1つ目のコマンドの `curl` で、GitHub にトークンを1枚発行してもらっています。`ACTIONS_ID_TOKEN_REQUEST_URL` と `ACTIONS_ID_TOKEN_REQUEST_TOKEN` は、`permissions` に `id-token: write` を付けたジョブにだけ自動で渡される環境変数です。`jq -r .value` で、返ってきた JSON からトークンの部分だけを取り出します。

トークン（JWT）は「ヘッダー.中身.署名」を `.` でつないだ形式なので、2つ目のコマンドで真ん中の部分を base64 でデコードし、必要な項目だけを表示しています。トークンそのものはログに出さないようにしています。

実行すると、次のように表示されました。

```json
{
  "sub": "repo:example-org@12345678/example-repo@987654321:ref:refs/heads/main",
  "aud": "sts.amazonaws.com",
  "repository": "example-org/example-repo",
  "ref": "refs/heads/main"
}
```

`repository` は見慣れた形なのに、`sub` にだけ `@数字` が付いています。これが信頼ポリシーと一致しなかった原因でした。

## 原因：GitHubがsubにIDを含める形式へ変更した

GitHub は2026年4月に、OIDC トークンの `sub` に、オーナーとリポジトリの変わらない数値ID（immutable ID）を含める変更を発表しています（[GitHub Changelog](https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/)）。適用の条件は次のとおりです。

- 2026年7月15日以降に作成されたリポジトリは、自動で新しい形式になる
- 同日以降にリネームや移管をしたリポジトリも、新しい形式に移る
- それ以前からあるリポジトリは、リポジトリや組織の OIDC 設定から任意で切り替えられる

背景にあるのは、名前の再利用による乗っ取りのリスクです。従来の形式は名前だけで照合しているため、リポジトリや組織が削除・改名されたあとに、その名前を別の人が取得すると、同じ `sub` のトークンを発行できてしまいます。数値IDは一度割り当てられたら再利用されないので、ID まで含めて照合すれば、元のリポジトリ以外からは通らなくなります。

ネット上の OIDC の記事の多くは従来の形式で書かれているので、新しく作ったリポジトリでそのとおりに設定すると、今回のように失敗します。

また、**既存のリポジトリでも、リネームや移管をすると新しい形式に変わります。**それまで動いていたデプロイが、リネームをきっかけに突然失敗することもあるので、覚えておくと安心です。

## 対処法：信頼ポリシーをIDを含む形式に合わせる

### IDを調べる

ID は、さきほどのデバッグ用ステップの出力から確認できます。GitHub CLI（`gh`）が使える環境なら、API からも確認できます。

```bash
# OIDC の sub の設定（新しい形式なら sub_claim_prefix に @ID が付いている）
gh api repos/example-org/example-repo/actions/oidc/customization/sub

# リポジトリの ID
gh api repos/example-org/example-repo --jq .id

# オーナーの ID（個人アカウントの場合。組織なら users/ を orgs/ に変える）
gh api users/example-org --jq .id
```

1つ目の API は、そのリポジトリの OIDC の `sub` の設定を返します。返ってくる `sub_claim_prefix` に `@ID` が付いていれば、新しい形式が使われています。

2つ目と3つ目は、それぞれリポジトリとオーナーの数値IDを取得します。`--jq .id` は、返ってきた JSON から `id` の値だけを取り出すオプションです。

### 信頼ポリシーを修正する

Terraform の場合は、`sub` 条件の値を新しい形式に変えます。

```hcl
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:example-org@12345678/example-repo@987654321:ref:refs/heads/main"]
    }
```

`terraform plan` を実行すると、ロールの `assume_role_policy` だけが、その場で更新（update in-place）される差分になります。

```text
  # aws_iam_role.deploy will be updated in-place
  ~ resource "aws_iam_role" "deploy" {
      ~ assume_role_policy = jsonencode(
            # (中略)
                          ~ "token.actions.githubusercontent.com:sub" = "repo:example-org/example-repo:ref:refs/heads/main" -> "repo:example-org@12345678/example-repo@987654321:ref:refs/heads/main"
            # (中略)
        )
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

apply したら、失敗したワークフローを Actions の画面の「Re-run jobs」で再実行します。今度は Configure AWS credentials が無事に通りました。

### ワイルドカードで緩めない

ネット上では、次のように ID の部分をワイルドカードにして、どちらの形式でも通るようにする例も見かけます。

```json
"StringLike": {
  "token.actions.githubusercontent.com:sub": "repo:example-org@*/example-repo@*:ref:refs/heads/main"
}
```

これだと、せっかく ID で照合できるようになったのに、名前だけで照合しているのと同じことになってしまいます。今回の変更の目的は名前の再利用への対策なので、**ID まで含めた値を `StringEquals` で完全一致させる**のがおすすめです。

既存のリポジトリを新しい形式に切り替える移行期間などで、一時的に両方の形式を許可したい場合も、ワイルドカードではなく、従来の形式と新しい形式の具体的な値を2つ並べて書くほうが安全です。

## デバッグ用のステップは忘れずに消す

原因が分かったら、トークンの中身を表示するステップはワークフローから削除しておきます。トークンそのものは出力していませんが、検証用のコードを本番のワークフローに残しておく理由はありません。

## まとめ

- `Not authorized to perform sts:AssumeRoleWithWebIdentity` は、信頼ポリシーの条件と実際のトークンが合っていないときに出る
- 2026年7月15日以降に作ったリポジトリ（と、同日以降にリネーム・移管したリポジトリ）は、`sub` が `repo:オーナー@オーナーID/リポジトリ@リポジトリID:...` の形式になる
- 実際の `sub` は、ワークフローの中でトークンをデコードすれば確認できる
- 信頼ポリシーは、ID まで含めた値で完全一致させる。ワイルドカードで緩めない

OIDC プロバイダーと信頼ポリシーの関係を、証明書認証の IPsec に例えて解説した記事もあります。仕組みから押さえておきたい人は「[OIDCとは？GitHub ActionsとAWS連携の仕組み](/github-actions-oidc-aws/)」もどうぞ。
