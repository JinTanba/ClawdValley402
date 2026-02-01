# CODEBASE.md

x402販売サーバーのコードベース構造。

## ディレクトリ構造

```
src/
├── domain/                           # ドメイン層
│   ├── entities/
│   │   ├── Vendor.ts                 # 販売者エンティティ
│   │   └── Product.ts                # 商品エンティティ
│   └── repositories/
│       ├── IVendorRepository.ts      # 販売者リポジトリインターフェース
│       └── IProductRepository.ts     # 商品リポジトリインターフェース
│
├── application/                      # アプリケーション層
│   ├── ports/
│   │   └── IPaymentGateway.ts        # 支払いゲートウェイインターフェース（抽象）
│   └── usecases/
│       ├── RegisterVendor.ts         # 販売者登録ユースケース
│       ├── RegisterProduct.ts        # 商品登録ユースケース
│       └── ProcessX402Request.ts     # x402支払いリクエスト処理ユースケース
│
├── infrastructure/                   # インフラ層
│   ├── prisma/
│   │   └── repositories/
│   │       ├── PrismaVendorRepository.ts
│   │       └── PrismaProductRepository.ts
│   └── x402/
│       └── X402PaymentGateway.ts     # x402 V2プロトコル実装（具象）
│
├── presentation/                     # プレゼンテーション層
│   └── routes/
│       ├── admin.ts                  # Admin API (/admin/*)
│       └── x402.ts                   # x402 Protected Endpoints（HTTPマッピングのみ）
│
└── index.ts                          # エントリーポイント

tests/                                # テストディレクトリ
├── domain/
├── application/
│   └── ProcessX402Request.test.ts
├── presentation/
└── infrastructure/
    └── x402/
        └── X402PaymentGateway.test.ts

prisma/
└── schema.prisma                     # Prismaスキーマ
```

## 主要モジュール

### ドメイン層

| ファイル | 責務 |
|----------|------|
| `Vendor.ts` | 販売者のビジネスロジック（EVMアドレス検証、APIキー生成） |
| `Product.ts` | 商品のビジネスロジック（価格検証、パス検証） |

### アプリケーション層

| ファイル | 責務 |
|----------|------|
| `IPaymentGateway.ts` | 支払いゲートウェイの抽象インターフェース（ポート） |
| `RegisterVendor.ts` | 販売者登録ユースケース |
| `RegisterProduct.ts` | 商品登録ユースケース（重複チェック含む） |
| `ProcessX402Request.ts` | x402支払いフロー全体を管理するユースケース |

### インフラ層

| ファイル | 責務 |
|----------|------|
| `X402PaymentGateway.ts` | x402ResourceServerをラップした実装（ファシリテータ連携） |

### プレゼンテーション層

| ファイル | 責務 |
|----------|------|
| `admin.ts` | Admin API（POST /admin/vendors, POST /admin/vendors/:id/products） |
| `x402.ts` | HTTPリクエスト→ユースケース呼び出し→HTTPレスポンスマッピング |

## x402 V2 プロトコルフロー

```
リクエスト1 (支払いなし)
  ↓
ProcessX402Request.execute()
  → { type: "payment_required", paymentRequired }
  ↓
402 Payment Required
  + PAYMENT-REQUIRED: base64(PaymentRequired)

リクエスト2 (支払いあり)
  + PAYMENT-SIGNATURE: base64(PaymentPayload)
  ↓
ProcessX402Request.execute()
  → verifyPayment() → settlePayment()
  → { type: "success", settleResponse, product }
  ↓
200 OK
  + PAYMENT-RESPONSE: base64(SettleResponse)
  + コンテンツ
```

## API

### Admin API

| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| POST | `/admin/vendors` | 販売者登録 |
| POST | `/admin/vendors/:id/products` | 商品登録 |

### x402 Protected

| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| GET | `/:vendorId/:productPath` | 支払い→データ取得 |

## 依存関係

```
presentation → application (usecases, ports)
                    ↑
infrastructure (implements ports)
                    ↓
              @x402/core, @x402/evm
```

- プレゼンテーション層はアプリケーション層のユースケースを呼び出す
- アプリケーション層はports（抽象）を定義
- インフラ層はportsを実装
- 依存性逆転の原則（DIP）に従う

## エントリーポイント

`src/index.ts` - Express サーバー起動、DI設定、PaymentGateway初期化

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PORT` | `3000` | サーバーポート |
| `FACILITATOR_URL` | `https://x402.org/facilitator` | x402ファシリテータURL |
