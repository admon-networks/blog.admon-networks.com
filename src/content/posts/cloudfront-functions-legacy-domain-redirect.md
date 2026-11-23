---
title: "CloudFrontで旧ドメインを新ドメインへ301リダイレクト"
description: "CloudFrontで旧ドメインへのアクセスを新ドメインの同じパスへ301リダイレクトする構成を解説。転送専用ディストリビューションに分けた理由、CloudFront Functionsでのクエリ文字列の引き継ぎ、httpから1回でhttpsへ飛ばす設定をTerraformで紹介します。"
pubDatetime: 2026-11-23T18:00:00+09:00
tags: ["AWS", "Terraform", "Route 53", "Web"]
ogImage: "../../assets/posts/eyecatch-cloudfront-functions-legacy-domain-redirect.png"
---

> [!NOTE]
> この記事には広告（アフィリエイトリンク）を含みます。

旧ドメインへのアクセスをCloudFrontで新ドメインへリダイレクトするなら、旧ドメイン専用のCloudFrontディストリビューションを1つ作り、CloudFront Functions（viewer-request）で「新ドメインの同じパス・同じクエリ文字列」への301を返すのが手軽です。オリジンにはリクエストが届かないので、本番のディストリビューションや証明書には一切触れずに済みます。

私はこの構成で、ブログの旧ドメイン`tech-lablog.com`へのアクセスを`blog.admon-networks.com`へ転送しました。

| 項目             | 内容                                     |
| ---------------- | ---------------------------------------- |
| 作業した時期     | 2026年11月                               |
| 転送元           | `tech-lablog.com`・`www.tech-lablog.com` |
| 転送先           | `https://blog.admon-networks.com`        |
| 関数のランタイム | `cloudfront-js-2.0`                      |
| DNS              | Route 53（旧ドメインのホストゾーン）     |

TerraformとAWSプロバイダーのバージョンは次のとおりです。

| ソフトウェア                       | コードの指定 | 実際に使ったバージョン |
| ---------------------------------- | ------------ | ---------------------- |
| Terraform                          | `>= 1.10`    | v1.16.3                |
| AWSプロバイダー（`hashicorp/aws`） | `~> 6.0`     | 6.73.0                 |

Terraformのコードは[admon-networks/public-infra](https://github.com/admon-networks/public-infra)の`infra/blog/legacy-redirect.tf`と`infra/blog/functions/legacy-redirect.js`で公開しています。

## 旧ドメインが行き止まりになっていた

このブログは、2026年9月にドメインを`tech-lablog.com`から`blog.admon-networks.com`へ移し、2026年11月にWordPress（Lightsail）からAstroの静的サイト（S3＋CloudFront）へ移行しました。

移行のあとも、`tech-lablog.com`のDNSは停止したLightsailを向いたままでした。そのため、旧URLやブックマークからのアクセスは、どこにもつながらない行き止まりになっていました。Search Consoleのアドレス変更（`tech-lablog.com`→`blog.admon-networks.com`）は9月の移行のときに申請済みでした。そこで、旧ドメインへのアクセスを新ドメインの同じページへ301で転送することにしました。

## 転送専用のディストリビューションに分けた理由

CloudFrontでカスタムドメインを使うには、そのドメインを含む証明書をディストリビューションに付ける必要があります。旧ドメインをブログ本体のディストリビューションに追加する方法もありますが、私は転送専用のディストリビューションを別に作りました。理由は2つです。

1つ目は、本番に触れずに済むことです。ブログ本体の証明書に旧ドメインを足すと証明書の作り直しになり、本番のディストリビューションにも変更が入ります。転送専用にすれば、本番の設定は何も変わりません。

2つ目は、やめるときに楽なことです。旧ドメインを手放すときは、転送用のリソースだけを消せば済みます。Terraformでは転送まわりを`legacy-redirect.tf`という1つのファイルにまとめたので、このファイルを消して`apply`すれば片付きます。

全体の構成は次のとおりです。

```text
ブラウザー
  │  https://tech-lablog.com/capwap/
  │  http://www.tech-lablog.com/capwap/
  ▼
Route 53（tech-lablog.com）
  A / AAAA：エイリアス → 転送専用のCloudFront
  www：tech-lablog.com へのCNAME（既存のまま）
  ▼
転送専用のCloudFrontディストリビューション
  ACM証明書（us-east-1）：tech-lablog.com, www.tech-lablog.com
  viewer-request：CloudFront Functions が 301 を返す
  ▼
301  location: https://blog.admon-networks.com/capwap/
```

## CloudFront Functionsで301を返す仕組み

CloudFront Functionsは、CloudFrontのエッジで動く軽量なJavaScriptの関数です。関数を割り当てるイベントは、ビューワーリクエスト（viewer-request：CloudFrontがリクエストを受け取った直後）とビューワーレスポンス（viewer-response：ビューワーへ応答を返す直前）の2つから選べます（[AWSのドキュメント](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)）。

viewer-requestの関数は、リクエストを返せばCloudFrontの処理（キャッシュの確認やオリジンへの転送）が続き、レスポンスを返せばその場でビューワーに応答して終わります。転送では、すべてのリクエストに301のレスポンスを返すので、キャッシュもオリジンも使われません。

### 関数のコード

実際の関数は次のとおりです。

```js file="infra/blog/functions/legacy-redirect.js"
// tech-lablog.com へのアクセスを、blog.admon-networks.com の同じパスへ 301 で転送する
var NEW_ORIGIN = "https://blog.admon-networks.com";

function handler(event) {
  var request = event.request;
  var location = NEW_ORIGIN + request.uri;

  // クエリ文字列（?p=123 など）も引き継ぐ
  var params = [];
  for (var key in request.querystring) {
    var param = request.querystring[key];
    var values = param.multiValue ? param.multiValue : [param];
    values.forEach(function (v) {
      params.push(v.value === "" ? key : key + "=" + v.value);
    });
  }
  if (params.length > 0) {
    location += "?" + params.join("&");
  }

  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: { value: location },
      "cache-control": { value: "max-age=86400" },
    },
  };
}
```

`request.uri`にはパスだけが入っているので、新ドメインのURLにそのままつなげれば「同じパス」への転送になります。

### クエリ文字列は自分で組み立て直す

クエリ文字列は`request.uri`に含まれず、`request.querystring`にキーごとのオブジェクトとして入っています。そのため、引き継ぐには文字列に組み立て直す必要があります。

同じキーが複数あるとき（`?tag=a&tag=b`のような場合）は、`multiValue`に全部の値が配列で入ります（[CloudFront Functionsのイベント構造](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html)）。`value`だけを見ると1つ目の値しか拾えないので、`multiValue`があればそちらから組み立てています。

### cache-controlを付けた

レスポンスには`cache-control: max-age=86400`（1日）を付けました。301は「恒久的な移転」を表すステータスなので、期限を指定しないと、ブラウザーが転送先をずっと覚えたままになることがあります。私は、転送先を間違えたときでも1日でブラウザー側のキャッシュが切れて直るように、期限を明示しました。

## Terraformで作ったリソース

転送のために作ったのは、ACM（AWS Certificate Manager）の証明書、CloudFront Functionsの関数、ディストリビューション、Route 53のレコードの4種類です。旧ドメインのホストゾーンは別のアカウントにあるので、Route 53のリソースには`aws.dns`というエイリアスのプロバイダーを使っています。

Terraformの基本（Provider・Backend・tfstate）は、[TerraformのS3 Backendとtfstate・Provider・initの役割](/terraform-s3-backend-tfstate/)で整理しています。

### 証明書はus-east-1に作る

CloudFrontに付けるACMの証明書は、us-east-1（バージニア北部）リージョンで作る必要があります（[AWSのドキュメント](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)）。`tech-lablog.com`と`www.tech-lablog.com`を1枚の証明書に入れ、DNS検証にしました。

```hcl file="infra/blog/legacy-redirect.tf"
locals {
  legacy_domain = "tech-lablog.com"
}

data "aws_route53_zone" "legacy" {
  provider = aws.dns
  name     = local.legacy_domain
}

resource "aws_acm_certificate" "legacy" {
  provider                  = aws.us_east_1
  domain_name               = local.legacy_domain
  subject_alternative_names = ["www.${local.legacy_domain}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# DNS 検証用のレコード（証明書の自動更新にも使うので、消さないこと）
resource "aws_route53_record" "legacy_cert_validation" {
  provider = aws.dns

  for_each = {
    for dvo in aws_acm_certificate.legacy.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = data.aws_route53_zone.legacy.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "legacy" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.legacy.arn
  validation_record_fqdns = [for r in aws_route53_record.legacy_cert_validation : r.fqdn]
}
```

### 関数とディストリビューション

関数は`publish = true`にして、公開済みの版をディストリビューションに割り当てます。ディストリビューションでは、`default_cache_behavior`の`function_association`で関数をviewer-requestに付けています。

```hcl file="infra/blog/legacy-redirect.tf"
resource "aws_cloudfront_function" "legacy_redirect" {
  name    = "blog-prod-cff-legacy-redirect"
  runtime = "cloudfront-js-2.0"
  comment = "tech-lablog.com から blog.admon-networks.com への 301 転送"
  publish = true
  code    = file("${path.module}/functions/legacy-redirect.js")
}

resource "aws_cloudfront_distribution" "legacy" {
  enabled         = true
  comment         = "tech-lablog.com -> blog.admon-networks.com (301)"
  aliases         = [local.legacy_domain, "www.${local.legacy_domain}"]
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_200"

  # 関数がすべてのリクエストに転送を返すので、オリジンには実際には届かない。
  # ただし CloudFront ではオリジンの指定が必須なので、ブログのバケットを指定しておく
  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id = local.s3_origin_id
    # http で来ても、いったん https に転送せず、新ドメインの https へ1回で転送する
    viewer_protocol_policy = "allow-all"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.legacy_redirect.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.legacy.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
```

### 既存のAレコードをimportしてCloudFrontへ向け直す

`tech-lablog.com`のAレコードは、すでにLightsailのIPアドレスを向いた状態でRoute 53にありました。これをTerraformの`import`ブロックで取り込み、中身をCloudFrontへのエイリアスに書き換えました。IPv6でも届くように、AAAAレコードも追加しています。

```hcl file="infra/blog/legacy-redirect.tf"
import {
  to = aws_route53_record.legacy_apex_a
  id = "${data.aws_route53_zone.legacy.zone_id}_${local.legacy_domain}_A"
}

resource "aws_route53_record" "legacy_apex_a" {
  provider = aws.dns
  zone_id  = data.aws_route53_zone.legacy.zone_id
  name     = local.legacy_domain
  type     = "A"

  alias {
    name                   = aws_cloudfront_distribution.legacy.domain_name
    zone_id                = aws_cloudfront_distribution.legacy.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "legacy_apex_aaaa" {
  provider = aws.dns
  zone_id  = data.aws_route53_zone.legacy.zone_id
  name     = local.legacy_domain
  type     = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.legacy.domain_name
    zone_id                = aws_cloudfront_distribution.legacy.hosted_zone_id
    evaluate_target_health = false
  }
}
```

`import`ブロックの`id`は「ホストゾーンID\_レコード名\_タイプ」の形式です。ホストゾーンIDは`data`ソースから参照しているので、コードに直接書く必要はありません。

`www.tech-lablog.com`は`tech-lablog.com`へのCNAMEだったので、何も変えずに転送用のCloudFrontに届きました。証明書と`aliases`に`www`を入れてあるので、HTTPSでも受けられます。A・AAAA・CNAMEの違いは[DNSの仕組みとレコードの種類](/dns/)で、Route 53でのドメイン取得は[AWS Route 53でドメインを取得する方法](/aws-route53-get-domain/)で書いています。

## 転送できたかをcurlで確かめた

`curl -sI`でレスポンスヘッダーだけを取得し、`grep`でステータス行・`location`・`cache-control`だけに絞って確かめました。`-s`は進捗表示を出さないオプション、`-I`はHEADリクエストを送ってレスポンスヘッダーだけを表示するオプションです。`grep -iE`は大文字・小文字を区別せずに、正規表現で行を絞り込みます。

```console
$ curl -sI "https://tech-lablog.com/home-network-basicdesign/?utm_source=test" | grep -iE '^(HTTP|location|cache-control)'
HTTP/2 301
cache-control: max-age=86400
location: https://blog.admon-networks.com/home-network-basicdesign/?utm_source=test
```

同じパスへの301が返り、関数で付けた`cache-control: max-age=86400`も届いています。クエリ文字列の`?utm_source=test`も、そのまま転送先のURLに引き継がれました。

ほかに、`https://tech-lablog.com/capwap/`と`http://www.tech-lablog.com/capwap/`はどちらも`https://blog.admon-networks.com/capwap/`への301になり、`http://www.`で来たアクセスも1回の転送で新ドメインのhttpsに届きました。`https://tech-lablog.com/?p=123`も`https://blog.admon-networks.com/?p=123`へ転送されています。転送先の`/capwap/`は、[CAPWAPの解説記事](/capwap/)です。

<div style="border:1px solid #dfdfd9;border-radius:10px;padding:22px;background:#fafaf7;margin:32px 0;">
<p style="margin:0 0 6px;font-size:0.78em;letter-spacing:.08em;color:#2056c7;font-weight:700;">TerraformでAWSを組むなら</p>
<p style="margin:0 0 12px;font-weight:700;font-size:1.08em;line-height:1.6;">実践Terraform AWSにおけるシステム設計とベストプラクティス</p>
<p style="margin:0 0 16px;font-size:0.95em;line-height:1.9;">この記事のように証明書・関数・DNSレコードと書き足すうちに増えていくTerraformのコードを、どう分けてどう育てるかという設計の考え方を、AWSの構成に沿って学べる一冊です。</p>
<table border="0" cellpadding="0" cellspacing="0"><tr><td><div style="border:1px solid #95a5a6;border-radius:.75rem;background-color:#FFFFFF;width:504px;margin:0px;padding:5px;text-align:center;overflow:hidden;"><table><tr><td style="width:240px"><a href="https://hb.afl.rakuten.co.jp/ichiba/59e142bd.c905d5f8.59e142be.5c3ab77e/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fbooksdream%2F1-241002216244%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;"><img src="https://hbb.afl.rakuten.co.jp/hgb/59e142bd.c905d5f8.59e142be.5c3ab77e/?me_id=1310259&item_id=10327545&pc=https%3A%2F%2Fthumbnail.image.rakuten.co.jp%2F%400_mall%2Fbooksdream%2Fcabinet%2Fracoon_443%2F4844378139.jpg%3F_ex%3D240x240&s=240x240&t=picttext" border="0" style="margin:2px" alt="『実践Terraform AWSにおけるシステム設計とベストプラクティス』の表紙" title="[商品価格に関しましては、リンクが作成された時点と現時点で情報が変更されている場合がございます。]"></a></td><td style="vertical-align:top;width:248px;display: block;"><p style="font-size:12px;line-height:1.4em;text-align:left;margin:0px;padding:2px 6px;word-wrap:break-word"><a href="https://hb.afl.rakuten.co.jp/ichiba/59e142bd.c905d5f8.59e142be.5c3ab77e/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fbooksdream%2F1-241002216244%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;">実践Terraform　AWSにおけるシステム設計とベストプラクティス</a><br><span >価格：1,790円（税込、送料別)</span> <span style="color:#BBB">(2026/11/23時点)</span></p><div style="margin:10px;"><a href="https://hb.afl.rakuten.co.jp/ichiba/59e142bd.c905d5f8.59e142be.5c3ab77e/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fbooksdream%2F1-241002216244%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;"><img src="https://static.affiliate.rakuten.co.jp/makelink/rl.svg" alt="楽天市場" style="float:left;max-height:27px;width:auto;margin-top:0" ></a><a href="https://hb.afl.rakuten.co.jp/ichiba/59e142bd.c905d5f8.59e142be.5c3ab77e/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fbooksdream%2F1-241002216244%2F%3Fscid%3Daf_pc_bbtn&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ==" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;"><div style="float:right;width:41%;height:27px;background-color:#bf0000;color:#fff!important;font-size:12px;font-weight:500;line-height:27px;margin-left:1px;padding: 0 12px;border-radius:16px;cursor:pointer;text-align:center;"> 楽天で購入 </div></a></div></td></tr></table></div><br><p style="color:#000000;font-size:12px;line-height:1.4em;margin:5px;word-wrap:break-word"></p></td></tr></table>
</div>

## よくある誤解

### 「redirect-to-httpsにしておけば安全」

普通のサイトなら、`viewer_protocol_policy`を`redirect-to-https`にして、httpのアクセスをhttpsへ寄せるのが定番です。ところが転送専用のディストリビューションでこれをやると、`http://tech-lablog.com/`へのアクセスは次のように2回転送されます。

1. CloudFrontが`https://tech-lablog.com/`へ転送する
2. httpsで来たリクエストに、関数が`https://blog.admon-networks.com/`への301を返す

`redirect-to-https`による転送は、viewer-requestの関数より前にCloudFrontが返します。そこで`allow-all`にしてhttpのリクエストもそのまま関数に渡し、関数が最初から新ドメインのhttpsを`location`に入れることで、1回で転送が終わるようにしました。関数は必ず新ドメインのhttpsを`location`に入れて返すので、`allow-all`にしても、旧ドメインのページがhttpのまま表示されることはありません。

### 「オリジンは使わないから空にできる」

CloudFrontのディストリビューションは、オリジンを1つ以上指定しないと作れません。そこで、ブログ本体のS3バケットをオリジンに指定しました。関数がすべてのリクエストに応答を返すので、実際にはオリジンにリクエストは届きません。

### 「DNSを切り替えればすぐ転送される」

Route 53のレコードを書き換えても、リゾルバーやPCに古いレコードのキャッシュが残っている間は、古い宛先に行きます。私の場合、旧レコードのTTL（Time To Live：キャッシュしてよい時間）は300秒で、切り替え直後の1回目の`curl`は停止中のLightsailにつながって応答がありませんでした。数分待ってから試すと、転送されるようになりました。切り替え直後に転送されないときは、設定を疑う前にTTLの分だけ待ってから確かめます。

## まとめ

- 旧ドメインの転送は、転送専用のCloudFrontディストリビューションに分けると、本番の証明書や設定に触れずに済み、やめるときも転送用のリソースを消すだけで済む
- CloudFront Functions（viewer-request）で301を返せば、オリジンにもキャッシュにも行かずに転送できる。クエリ文字列は`request.querystring`から組み立て直し、同じキーが複数あるときは`multiValue`を使う
- `viewer_protocol_policy`は`allow-all`にして、関数で新ドメインのhttpsへ1回で転送する
- 既存のRoute 53のレコードは`import`ブロックで取り込んでから書き換える。切り替え直後はTTLの分だけ待つ

費用は、CloudFrontの[無料枠](https://aws.amazon.com/cloudfront/pricing/)の範囲に収まる見込みです。

<div style="border:1px solid #dfdfd9;border-radius:10px;padding:22px;background:#fafaf7;margin:32px 0;">
<p style="margin:0 0 6px;font-size:0.78em;letter-spacing:.08em;color:#2056c7;font-weight:700;">AWSのネットワークを基礎から</p>
<p style="margin:0 0 12px;font-weight:700;font-size:1.08em;line-height:1.6;">Amazon Web Services 基礎からのネットワーク＆サーバー構築 改訂4版</p>
<p style="margin:0 0 16px;font-size:0.95em;line-height:1.9;">この記事で触れたRoute 53やCloudFrontより手前にある、VPC・サブネット・ルーティングといったAWSのネットワークの土台を、実際にサーバーを立てて手を動かしながら確かめられる入門書です。</p>
<table border="0" cellpadding="0" cellspacing="0"><tr><td><div style="border:1px solid #95a5a6;border-radius:.75rem;background-color:#FFFFFF;width:504px;margin:0px;padding:5px;text-align:center;overflow:hidden;"><table><tr><td style="width:240px"><a href="https://hb.afl.rakuten.co.jp/ichiba/59e14a95.c9d9180b.59e14a96.28511920/_RTLink158967?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fbook%2F17480642%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;"><img src="https://hbb.afl.rakuten.co.jp/hgb/59e14a95.c9d9180b.59e14a96.28511920/?me_id=1213310&item_id=20937968&pc=https%3A%2F%2Fthumbnail.image.rakuten.co.jp%2F%400_mall%2Fbook%2Fcabinet%2F2041%2F9784296202041_1_4.jpg%3F_ex%3D240x240&s=240x240&t=picttext" border="0" style="margin:2px" alt="『Amazon Web Services基礎からのネットワーク＆サーバー構築 改訂4版』の表紙" title="[商品価格に関しましては、リンクが作成された時点と現時点で情報が変更されている場合がございます。]"></a></td><td style="vertical-align:top;width:248px;display: block;"><p style="font-size:12px;line-height:1.4em;text-align:left;margin:0px;padding:2px 6px;word-wrap:break-word"><a href="https://hb.afl.rakuten.co.jp/ichiba/59e14a95.c9d9180b.59e14a96.28511920/_RTLink158967?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fbook%2F17480642%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;">Amazon Web Services基礎からのネットワーク＆サーバー構築改訂4版 [ 大澤 文孝 ]</a><br><span >価格：2,970円（税込、送料無料)</span> <span style="color:#BBB">(2026/11/23時点)</span></p><div style="margin:10px;"><a href="https://hb.afl.rakuten.co.jp/ichiba/59e14a95.c9d9180b.59e14a96.28511920/_RTLink158967?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fbook%2F17480642%2F&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;"><img src="https://static.affiliate.rakuten.co.jp/makelink/rl.svg" alt="楽天市場" style="float:left;max-height:27px;width:auto;margin-top:0" ></a><a href="https://hb.afl.rakuten.co.jp/ichiba/59e14a95.c9d9180b.59e14a96.28511920/_RTLink158967?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fbook%2F17480642%2F%3Fscid%3Daf_pc_bbtn&link_type=picttext&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ==" target="_blank" rel="nofollow sponsored noopener" style="word-wrap:break-word;"><div style="float:right;width:41%;height:27px;background-color:#bf0000;color:#fff!important;font-size:12px;font-weight:500;line-height:27px;margin-left:1px;padding: 0 12px;border-radius:16px;cursor:pointer;text-align:center;"> 楽天で購入 </div></a></div></td></tr></table></div><br><p style="color:#000000;font-size:12px;line-height:1.4em;margin:5px;word-wrap:break-word"></p></td></tr></table>
</div>
