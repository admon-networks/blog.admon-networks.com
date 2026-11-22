---
title: "TerraformのS3 Backendとは？tfstate・Provider・initの役割を初心者向けに解説"
description: "AIに書かせたTerraformコード、意味を理解していますか？S3 Backendを題材に、tfstate・Provider・Backend・Bootstrap・terraform initの役割を初心者目線で整理します。"
pubDatetime: 2026-09-22T14:16:47.000Z
tags: ["AWS", "IaC", "Terraform", "自動化"]
ogImage: "../../assets/wp/2026/09/eyecatch-terraform-s3-backend.png"
---

「AIにTerraformのコードを書いてもらったら、ちゃんと動いた。でも、正直なにをしているのかよくわからない」

この記事は、まさにそんな状態だった私が、自分で構築したTerraformのS3 Backendを題材に、tfstate・Provider・Backend・Bootstrap・terraform initの役割をひとつずつ整理したものです。

コピペで動かす手順書ではなく、**「なぜこのコードが必要なのか」から理解する**ことをゴールにしています。

## この記事でわかること

-   Terraformの基本的な仕組み（Provider / Resource / State / Backend）
-   tfstate（terraform.tfstate）が何を記録しているのか
-   S3バケットを作るコードと、S3 Backendの設定が「両方」必要な理由
-   Bootstrapという考え方と、ローカルstateからS3 Backendへの移行手順
-   terraform initが裏側でやっていること
-   .terraform.lock.hclの役割

こんな方を想定しています。

-   AIにTerraformコードを書いてもらったけれど、中身が読めていない方
-   tfstateやBackendという言葉は聞いたことがあるが、説明はできない方
-   AWSを触り始めたネットワークエンジニアの方
-   「terraform initはとりあえず最初に打つもの」になっている方

## はじめに：AIが書いたTerraformは動いた。でも意味がわからなかった

自宅ラボの一部をAWSに持っていくにあたって、Terraformを使い始めました。

最初の一歩として「tfstateをS3に置く構成を作りたい」とAIに相談したところ、それらしいコードが一瞬で出てきます。貼り付けて実行すると、エラーもなくS3バケットができあがりました。

ところが、コードを見返すと疑問だらけでした。

-   一番上の `terraform { ... }` ブロックは何？
-   `required_providers` と `provider "aws"` は何が違う？
-   tfstateって何？
-   S3バケットを作っているのに、なぜ別に `backend "s3"` を書くの？
-   Bootstrapって何？
-   terraform initって、結局なにをしているの？

ネットワーク機器なら、コンフィグを1行ずつ説明できないまま本番投入することはまずありません。Terraformも同じで、動いたからOKにしてしまうと、トラブルが起きたときに手も足も出なくなります。

そこで、自分のコードを題材に、ひとつずつ分解してみることにしました。

## 今回作ったもの

作ったのは、**Terraformのstateファイル（tfstate）を保存するためのS3バケット**と、**そのバケットをBackendとして使う設定**です。

実際のコードは次のとおりです。まずは全体をざっと眺めるだけで大丈夫です。このあと、ひとつずつ分解していきます。

```hcl file="provider.tf"
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-1"

  default_tags {
    tags = {
      ManagedBy = "terraform"
      Project   = "homelab"
    }
  }
}
```

```hcl file="s3.tf"
resource "aws_s3_bucket" "tfstate" {
  bucket = "バケット名"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

```hcl file="backend.tf"
terraform {
  backend "s3" {
    bucket       = "バケット名"
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}
```

※S3のバケット名は全世界で一意である必要があります。真似して作る場合は、バケット名を自分用に変更してください。

## Terraformとは？「あるべき姿」を宣言するツール

TerraformはHashiCorp社が開発しているIaC（Infrastructure as Code）ツールです。AWSなどのインフラを、画面でポチポチ作るのではなく、コードで定義して管理します。

ポイントは、Terraformのコードが「手順」ではなく「**あるべき姿**」を書くものだということです。

「S3バケットを作れ」という命令を書くのではなく、「S3バケットがこういう設定で存在している状態」を宣言します。Terraformはその宣言と現在の状態を見比べて、差分を埋めるために必要な操作を計画（plan）し、実行（apply）してくれます。

全体の関係は、ざっくり次のようになっています。

```text
.tfファイル（あるべき姿の宣言）
   ↓
Terraform本体（差分を計算）
   ↓
Provider（AWS APIに変換）
   ↓
AWS API
   ↓
AWSリソース（S3、VPC、EC2など）
```

ここで出てきた「Provider」が、最初の重要ポイントです。

## Providerとは？TerraformとAWSをつなぐ「ドライバ」

私が最初に勘違いしていたのは、「Terraform本体がAWSのことを全部知っている」と思っていた点です。

実際には、Terraform本体はS3やEC2のことを直接は知りません。**AWS Provider**というプラグインが、TerraformとAWS APIの間に入って仲介しています。

```text
Terraform本体
   │ 「S3バケットを、この設定で存在させたい」
   ▼
AWS Provider
   │ AWS APIの呼び出しに変換
   ▼
AWS
   └── S3バケットが作成される
```

ネットワークエンジニア的にいえば、Providerは**Terraform本体と各サービスのAPIをつなぐドライバ（アダプタ）**のようなものです。OSがNICのドライバを入れ替えればさまざまなハードウェアを扱えるように、TerraformもProviderを入れ替えることでAWS、Azure、Google Cloudなどを扱えます。

コードの中では、Providerに関する記述が2か所に分かれています。ここが最初につまずいたポイントでした。

### required\_providers：「このProviderが必要です」という宣言

```hcl
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}
```

`terraform { ... }` ブロックは、AWSのリソースではなく**Terraform自身の設定**を書く場所です。

-   `required_version`：このコードを実行できるTerraform本体のバージョン条件
-   `required_providers`：このコードで使うProviderの一覧
-   `source = "hashicorp/aws"`：Providerの配布元（Terraform Registry上のhashicorp/aws）
-   `version = ">= 5.0"`：使ってよいProviderのバージョン条件

つまりここは「このコードを動かすには、AWS Providerのバージョン5.0以上が必要です」という**宣言**です。実際のダウンロードは、後で説明する `terraform init` のタイミングで行われます。

### provider "aws"：「そのProviderをどう使うか」の設定

```hcl
provider "aws" {
  region = "ap-northeast-1"

  default_tags {
    tags = {
      ManagedBy = "terraform"
      Project   = "homelab"
    }
  }
}
```

こちらは、AWS Providerを**どういう設定で使うか**を書く場所です。

-   `region`：操作するAWSリージョン（ap-northeast-1は東京リージョン）
-   `default_tags`：このProviderで作るリソースに共通で付けるタグ

`default_tags` を書いておくと、リソースごとにタグを書かなくても、全リソースに「ManagedBy = terraform」などが付きます。あとからAWSのコンソールで見たときに、「これはTerraformで作ったものだ」とすぐ判別できるので便利です。

なお、AWSの認証情報（アクセスキーなど）はコードには書いていません。AWS Providerは、AWS CLIのプロファイルや環境変数から認証情報を読み取ってくれます。認証情報をコードに直書きしてGitにpushしてしまう事故を避けるためにも、この形がおすすめです。

2つの違いを整理すると、次のとおりです。

| 記述 | 役割 | たとえるなら |
| --- | --- | --- |
| required\_providers | このProviderが必要だと宣言する | 「このドライバを使います」 |
| provider "aws" | そのProviderの使い方を設定する | 「ドライバの設定値はこれです」 |

## resourceとは？「AWSに何を作るか」

Providerの準備ができたら、次は実際に作るものを書きます。それが `resource` ブロックです。

### resourceの書き方を分解する

```hcl
resource "aws_s3_bucket" "tfstate" {
  bucket = "バケット名"
}
```

書き方の型は次のとおりです。

```text
resource "リソースタイプ" "Terraform内での名前" {
  設定項目 = 値
}
```

-   `aws_s3_bucket`：リソースタイプ。AWS Providerが提供している「S3バケット」という種類
-   `tfstate`：Terraformのコード内でこのリソースを呼ぶための名前（AWS上の名前ではない）
-   `bucket = "バケット名"`：AWS上に作られる実際のバケット名

Terraform内での名前は、ほかのリソースから参照するときに使います。たとえば、バージョニング設定のリソースでは次のように書いています。

```hcl
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  # ...
}
```

`aws_s3_bucket.tfstate.id` は「aws\_s3\_bucketタイプの、tfstateという名前のリソースのID」という意味です。バケット名を直接書かずに参照でつなぐことで、Terraformは「バケットを先に作ってから、バージョニングを設定する」という依存関係を自動で判断してくれます。

### tfstate用バケットに付けている設定

今回のS3バケットには、tfstateを安全に保管するための設定をいくつか入れています。

| 設定 | リソース / 記述 | 目的 |
| --- | --- | --- |
| バージョニング | aws\_s3\_bucket\_versioning | tfstateの過去バージョンを保持し、壊れたときに戻せるようにする |
| サーバー側暗号化 | aws\_s3\_bucket\_server\_side\_encryption\_configuration | SSE-S3（AES256）で保存時に暗号化する |
| パブリックアクセスブロック | aws\_s3\_bucket\_public\_access\_block | バケットが誤って公開されるのを防ぐ |
| 削除防止 | lifecycle { prevent\_destroy = true } | Terraformの操作でバケットを消そうとするとエラーにする |

なぜここまで慎重にするのかは、次のtfstateの話を読むとわかります。

## tfstateとは？Terraformの「管理台帳」

Terraform初心者にとって、いちばん大事な概念がstate（tfstate）だと思います。

Terraformは、**自分が管理しているリソースが今どうなっているか**を、stateファイルに記録しています。デフォルトでは、作業ディレクトリに `terraform.tfstate` というファイルができます。

ここで大事なのは、**tfstateはAWSそのものではない**ということです。

```text
.tfファイル
└── あるべき姿（設計書）

terraform.tfstate
└── Terraformが把握している管理情報（管理台帳）

AWS
└── 実際に動いているインフラ（実機）
```

ネットワークでたとえると、.tfファイルが「設計書」、tfstateが「構成管理台帳」、AWSが「実機」のイメージです。

Terraformは、設計書（.tf）と管理台帳（state）、実機（AWS）の状態を突き合わせて、「何を作る・変える・消す必要があるか」を判断しています。stateには「コード上の `aws_s3_bucket.tfstate` は、AWS上のどのバケットに対応するか」という紐付けも記録されています。

そのため、tfstateをなくすと、Terraformは自分が作ったリソースを見失ってしまいます。実機（AWS）にはバケットが存在するのに、台帳から消えているので「まだ何も作っていない」と判断し、同じものを新しく作ろうとする。こうしたトラブルの原因になります。

また、tfstateには手元のPCだけに置いておくと困る点もあります。

-   PCが壊れたら、stateも一緒に消える
-   別のPCや他の人と作業すると、stateが食い違う
-   リソースの属性値がそのまま記録されるため、機密情報が含まれることがある

そこで、stateを安全な場所に置くための仕組みが「Backend」です。

## Backendとは？「tfstateをどこに保存するか」

Backendは、**Terraformがstateをどこに保存するか**を決める仕組みです。

何も設定しなければ、stateはローカル（作業ディレクトリ）に保存されます。これを `local` Backendと呼びます。今回はこれをS3に変更しています。

```hcl
terraform {
  backend "s3" {
    bucket       = "バケット名"
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}
```

-   `bucket`：stateを保存するS3バケット
-   `key`：バケット内でのstateファイルの保存場所（オブジェクトキー）
-   `region`：バケットがあるリージョン
-   `use_lockfile`：stateのロックを有効にするかどうか

`bucket` と `key` の関係は、次のようなイメージです。

```text
S3
└── バケット名        ← bucket
    └── bootstrap/
        └── terraform.tfstate        ← key
```

`key` にディレクトリのようなプレフィックスを付けておくと、今後VPCやEC2などの構成を増やしたときも、`network/terraform.tfstate` のように同じバケット内で整理して置けます。

### use\_lockfile：同時実行からstateを守る

`use_lockfile = true` は、S3 Backendでstateのロックを有効にする設定です。

ロックがないと、2つのTerraform実行が同時に同じstateを書き換えてstateが壊れる、ということが起こりえます。ロックを有効にすると、Terraformはstateを変更する操作の間、stateと同じ場所に `.tflock` という拡張子のロックファイルを作成し、ほかの実行が割り込めないようにします。

以前は、S3 BackendのロックにはDynamoDBのテーブルを別途用意するのが定番でした。現在のTerraform公式ドキュメントでは、DynamoDBを使ったロックは非推奨（deprecated）とされ、将来のマイナーバージョンで削除予定と明記されています。これから作るなら、`use_lockfile` を使うのが素直です。

なお、S3ネイティブのロック（use\_lockfile）はTerraform 1.10で実験的機能として導入され、1.11で正式な機能になりました。私のコードは `required_version = ">= 1.10"` になっていますが、これから書くなら `">= 1.11"` にしておくのが安心です。

## 【本題】S3を作るコードとS3 Backendの設定、なぜ両方あるの？

ここが、今回いちばん混乱したポイントです。

コードの中に、同じバケット名が2回出てきます。

```hcl
# s3.tf
resource "aws_s3_bucket" "tfstate" {
  bucket = "バケット名"
}
```

```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket = "バケット名"
    # ...
  }
}
```

一見すると同じことを2回書いているように見えますが、役割はまったく別物です。

| 記述 | 役割 | 誰のための設定か |
| --- | --- | --- |
| resource "aws\_s3\_bucket" | AWS上にS3バケットを**作る** | AWSのインフラ（管理対象） |
| backend "s3" | Terraformのstateの**保存先**をS3にする | Terraform自身 |

`resource` は「AWSに何を作るか」、`backend` は「Terraform自身の管理台帳をどこに置くか」です。

たとえるなら、`resource "aws_s3_bucket"` は「倉庫を建てる工事」、`backend "s3"` は「自分の管理台帳をその倉庫に保管する」という決めごとです。倉庫を建てることと、そこに台帳を置くことは、別々の話なんですね。

実際、`backend "s3"` は既に存在するバケットを使う設定なので、バケットを作る機能はありません。逆に `resource "aws_s3_bucket"` を書いただけでは、stateはローカルに置かれたままです。

## Bootstrapとは？「鶏と卵」問題の解き方

役割の違いがわかると、次の疑問が出てきます。

```text
tfstateをS3に置きたい
   ↓
そのためにはS3バケットが必要
   ↓
S3バケットもTerraformで作りたい
   ↓
そのTerraformのstateは、どこに置く？
   ↓
S3に置きたい……でも、S3はまだ存在しない
```

S3 Backendを使うにはバケットが必要なのに、そのバケットを作るTerraformもstateを必要とする。いわゆる「鶏と卵」の問題です。

これを解決するのが**Bootstrap**という考え方です。最初だけローカルstateで動かしてバケットを作り、バケットができたあとでstateをS3に引っ越す、という段取りを踏みます。

```text
① ローカルstateでTerraformを開始
        │
        │ terraform apply
        ▼
② S3バケット（tfstate用）が完成
        │
        │ backend "s3" を追加して terraform init
        ▼
③ ローカルのstateをS3へ移行
        │
        ▼
④ 以後はS3 Backendでstateを管理
```

Bootstrapとは、もともと「最初の立ち上げ処理」を指す言葉です。今回は、このtfstate用バケットを作る構成そのものを「bootstrap」として、ほかの構成（VPCやEC2など）とはディレクトリを分けて管理しています。backendの `key` を `bootstrap/terraform.tfstate` にしているのはそのためです。

## 実際の手順：ローカルstateからS3 Backendへ移行する

ここからは実際に私が行った手順です。コマンドの意味もあわせて書いておきます。

### 手順1：backend.tfを置かずに初期化する

最初は `backend.tf` を置かず、`provider.tf` と `s3.tf` だけの状態で始めます。

```bash
terraform init
```

-   `terraform init`：作業ディレクトリを初期化するコマンドです。この段階ではBackendの指定がないので、stateはローカルに保存される設定で初期化され、required\_providersに書いたAWS Providerがダウンロードされます。

### 手順2：変更内容を確認して、S3バケットを作る

```bash
terraform plan
terraform apply
```

-   `terraform plan`：.tfの内容とstate・AWSの状態を比べて、「何が作られ、何が変わるか」を表示します。この時点ではまだ何も作られません。ネットワーク機器でいう、投入前のコンフィグ差分確認に近いイメージです。
-   `terraform apply`：planの内容を表示したうえで、確認プロンプトで `yes` と入力すると実際に適用します。

applyが終わると、AWS上にS3バケットができ、手元には `terraform.tfstate` ができています。

### 手順3：backend.tfを追加して、stateを移行する

バケットができたので、`backend.tf` を追加します。Backendの設定を変えたら、もう一度initが必要です。

```bash
terraform init -migrate-state
```

-   `terraform init`：Backendの設定が変わったことを検出し、新しいBackend（S3）で初期化し直します。
-   `-migrate-state`：既存のstateを新しいBackendへ移行するオプションです。

実行すると、「既存のstateを新しいBackendにコピーするか」を確認されるので、`yes` と入力します。これで、ローカルにあったstateがS3の `bootstrap/terraform.tfstate` にコピーされます。

※オプションなしの `terraform init` でも、Backendの変更を検出すると同様に移行するか尋ねられます。意図を明確にする意味で、 `-migrate-state` を付けて実行しています。

### 手順4：移行できたか確認する

```bash
terraform state list
aws s3 ls s3://バケット名/bootstrap/
```

-   `terraform state list`：stateに記録されているリソースの一覧を表示します。S3 Backendから読んだstateに、4つのリソース（aws\_s3\_bucket.tfstateなど）が表示されればOKです。
-   `aws s3 ls s3://バケット名/プレフィックス/`：AWS CLIで、指定した場所にあるオブジェクトを一覧表示します。`terraform.tfstate` が表示されれば、S3にstateが保存されています。

移行後は、手元の `terraform.tfstate` はBackendとして使われなくなります。S3側に移ったことを確認してから整理しましょう。ここまでで、Bootstrapは完了です。

## terraform initは何をしているのか

最初は、terraform initを「Terraformを使うときに、とりあえず最初に打つおまじない」だと思っていました。実際には、今回の流れの中でかなり重要な仕事をしています。

-   作業ディレクトリの初期化（`.terraform` ディレクトリの作成）
-   required\_providersに書いたProviderのダウンロード
-   Backendの初期化（stateの保存先への接続）
-   Backend設定が変わったときの、stateの移行
-   `.terraform.lock.hcl` の作成・更新

特に押さえておきたいのは、次の2つの流れです。

```text
required_providers に書く
   ↓
terraform init
   ↓
AWS Providerがダウンロードされる
```

```text
backend をlocalからs3に変更する
   ↓
terraform init（-migrate-state）
   ↓
stateがS3へ移行される
```

「Providerを追加・変更したとき」と「Backendを変更したとき」はinitが必要。この2つを覚えておくだけでも、initのエラーに出くわしたときの見通しがかなり良くなります。

## .terraform.lock.hclとは？

terraform initを実行すると、`.terraform.lock.hcl` というファイルが作られます。

これは、**実際に選ばれたProviderのバージョンとチェックサム**を記録するファイルです。

`required_providers` の `version = ">= 5.0"` は「5.0以上なら何でもよい」という条件でしかありません。そのままだと、実行するタイミングや環境によって違うバージョンが入ってしまう可能性があります。ロックファイルがあれば、別のPCやほかの人の環境でも、同じバージョンのProviderを再現できます。

名前に「lock」と付いていますが、先ほどのstateのロック（use\_lockfile）とは別物です。

| 名前 | 何をロックするか |
| --- | --- |
| .terraform.lock.hcl | Providerのバージョン |
| use\_lockfile（.tflock） | stateへの同時書き込み |

`.terraform.lock.hcl` は、基本的にGitで管理します。一方で、Providerの実体が入る `.terraform` ディレクトリや、tfstateはGitに入れません。私は次のような `.gitignore` にしています。

```text file=".gitignore"
# Providerなどがダウンロードされるディレクトリ
.terraform/

# stateファイル（Backendに置くのでGitには入れない）
*.tfstate
*.tfstate.*
```

## .tfファイルの分け方にルールはあるの？

今回は `provider.tf`、`s3.tf`、`backend.tf` のようにファイルを分けています。最初は「backend.tfという名前だからBackendとして扱われるのかな」と思っていましたが、そうではありません。

Terraformは、**同じディレクトリにある .tf ファイルをすべてまとめて1つの構成として読み込みます**。ファイル名自体に特別な意味はありません。極端な話、全部を1ファイルに書いても動きます。

`terraform { }` ブロックが `provider.tf` と `backend.tf` の2か所に出てくるのも問題ありません。

それでもファイルを分けるのは、読みやすくするためです。よく見かける分け方は次のとおりです。

| ファイル名 | 書くもの |
| --- | --- |
| backend.tf | stateの保存先（Backend） |
| provider.tf | required\_providersとProviderの設定 |
| s3.tf など | AWSリソース（サービスごとに分けることが多い） |
| variables.tf | 入力値（変数） |
| outputs.tf | 出力値 |

## 全体像を一枚で整理する

最後に、今回の登場人物の関係を1枚にまとめます。

```text
                ┌──────────────────────┐
                │    Terraform (.tf)    │
                │  required_providers   │
                │  provider / resource  │
                │  backend              │
                └──────────┬───────────┘
                           │
                           ▼
                   ┌──────────────┐
                   │  Terraform本体 │
                   └──────┬───────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
 ┌─────────────────┐            ┌──────────────────┐
 │  AWS Provider    │            │   S3 Backend     │
 │  AWS APIとの仲介  │            │  tfstateの保存先  │
 └────────┬────────┘            └────────┬─────────┘
          ▼                               ▼
 ┌─────────────────┐            ┌──────────────────┐
 │  AWS             │            │  S3              │
 │  VPC / EC2 / S3  │            │  terraform.tfstate│
 └─────────────────┘            └──────────────────┘
```

左側が「インフラを作る」流れ、右側が「Terraform自身の管理台帳を保存する」流れです。今回のBootstrapでは、左側の流れで作ったS3バケットを、右側の保存先として使っている、というわけです。

## まとめ

今回、AIに書いてもらったTerraformのコードを分解してみて、次の関係が理解できました。

```text
Terraform
├── Provider
│   └── TerraformとAWS APIをつなぐ（ドライバ）
├── Resource
│   └── AWS上に何を作るか
├── State（tfstate）
│   └── Terraformが把握している管理台帳
└── Backend
    └── そのstateをどこに保存するか
```

そして、「BackendのS3バケットもTerraformで作りたい」という鶏と卵の問題は、**ローカルstateで作ってからS3へ移行するBootstrap**で解決できます。

AIにコードを書いてもらうこと自体は、とても便利ですし、悪いことではないと思っています。ただ、生成されたコードの意味がわからないままだと、エラーが出たときやstateが食い違ったときに自力で直せません。

「動かす方法」だけでなく、「なぜこのコードが必要なのか」を一度でも自分の言葉で説明してみる。それだけで、Terraformのコードの見え方がかなり変わりました。

## 次に読みたい記事

このブログでは、Terraformを「Terraformとは？」からトラブルシュートまで、段階的に整理していく予定です。次は、今回作ったS3 Backendを使って、AWS上にネットワークを組んでいきます。

-   Terraformの基本コマンド（init / plan / apply / destroy）を整理する（準備中）
-   TerraformでAWS VPCとサブネットを作る（準備中）
-   ルートテーブルとセキュリティグループをTerraformで管理する（準備中）
-   Terraformでよくあるエラーとトラブルシュート（準備中）
