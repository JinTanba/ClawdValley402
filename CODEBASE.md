# CODEBASE.md

x402販売サーバーのコードベース構造。

## ディレクトリ構造

```
src/
├── domain/                           # ドメイン層
│   ├── entities/
│   │   ├── Vendor.ts                 # 販売者エンティティ
│   │   ├── Product.ts                # 商品エンティティ（IMMEDIATE/ASYNC型）
│   │   ├── Payment.ts                # 決済記録エンティティ
│   │   ├── Task.ts                   # 非同期タスクエンティティ
│   │   ├── APIKey.ts                 # APIキーエンティティ（有効期限・無効化対応）
│   │   └── RedeemToken.ts            # リデームトークンエンティティ（ワンタイム）
│   └── repositories/
│       ├── IVendorRepository.ts      # 販売者リポジトリインターフェース
│       ├── IProductRepository.ts     # 商品リポジトリインターフェース
│       ├── IPaymentRepository.ts     # 決済リポジトリインターフェース
│       ├── ITaskRepository.ts        # タスクリポジトリインターフェース
│       ├── IAPIKeyRepository.ts      # APIキーリポジトリインターフェース
│       └── IRedeemTokenRepository.ts # リデームトークンリポジトリインターフェース
│
├── application/                      # アプリケーション層
│   ├── ports/
│   │   ├── IPaymentGateway.ts        # 支払いゲートウェイインターフェース（抽象）
│   │   └── IEscrowService.ts         # エスクローサービスインターフェース（抽象）
│   └── usecases/
│       ├── RegisterVendor.ts         # 販売者登録
│       ├── RegisterProduct.ts        # 商品登録
│       ├── ProcessX402Request.ts     # x402支払いリクエスト処理（ASYNC/APIキー対応）
│       ├── GetVendorTasks.ts         # 販売者向けタスク一覧取得
│       ├── StartTaskProcessing.ts    # タスク処理開始
│       ├── ReportTaskResult.ts       # タスク完了/失敗報告
│       ├── GetTaskStatus.ts          # タスクステータス取得
│       ├── GetTaskResult.ts          # タスク結果取得
│       ├── CreateAPIKey.ts           # APIキー作成
│       ├── CreateRedeemToken.ts      # リデームトークン作成
│       └── RedeemAPIKey.ts           # トークンでAPIキー発行
│
├── infrastructure/                   # インフラ層
│   ├── prisma/
│   │   └── repositories/
│   │       ├── PrismaVendorRepository.ts
│   │       ├── PrismaProductRepository.ts
│   │       ├── PrismaPaymentRepository.ts
│   │       ├── PrismaTaskRepository.ts
│   │       ├── PrismaAPIKeyRepository.ts
│   │       └── PrismaRedeemTokenRepository.ts
│   ├── x402/
│   │   └── X402PaymentGateway.ts     # x402 V2プロトコル実装（具象）
│   └── escrow/
│       └── EvmEscrowService.ts       # EVMエスクロー実装（USDC転送）
│
├── presentation/                     # プレゼンテーション層
│   ├── middleware/
│   │   └── vendorAuth.ts             # X-API-Key認証ミドルウェア（APIKeyRepository使用）
│   └── routes/
│       ├── admin.ts                  # Admin API (/admin/*)
│       ├── x402.ts                   # x402 Protected Endpoints
│       ├── vendor.ts                 # 販売者向けAPI (/vendor/*)
│       ├── tasks.ts                  # 購入者向けタスクAPI (/tasks/*)
│       └── redeem.ts                 # APIキーリデームAPI (/redeem/*)
│
└── index.ts                          # エントリーポイント

tests/                                # テストディレクトリ
├── domain/
│   ├── Vendor.test.ts
│   ├── Product.test.ts
│   ├── Payment.test.ts
│   ├── Task.test.ts
│   ├── APIKey.test.ts
│   └── RedeemToken.test.ts
├── application/
│   ├── ProcessX402Request.test.ts
│   ├── GetVendorTasks.test.ts
│   ├── StartTaskProcessing.test.ts
│   ├── ReportTaskResult.test.ts
│   ├── GetTaskStatus.test.ts
│   ├── GetTaskResult.test.ts
│   ├── CreateAPIKey.test.ts
│   ├── CreateRedeemToken.test.ts
│   └── RedeemAPIKey.test.ts
├── presentation/
│   ├── admin.test.ts
│   ├── x402.test.ts
│   ├── vendor.test.ts
│   ├── tasks.test.ts
│   ├── vendorAuth.test.ts
│   └── redeem.test.ts
└── infrastructure/
    ├── x402/
    │   └── X402PaymentGateway.test.ts
    └── escrow/
        └── EvmEscrowService.test.ts

prisma/
└── schema.prisma                     # Prismaスキーマ（Vendor, Product, Payment, Task, ApiKey, RedeemToken）
```

## 商品タイプ

| タイプ | 説明 | フロー |
|--------|------|--------|
| IMMEDIATE | 即時解決型（従来） | 支払い成功 → データ返却 |
| ASYNC | 非同期型 | 支払い成功 → タスクID発行 → 販売者処理 → 結果取得 |
| api-key | APIキー販売 | 支払い成功 → リデームURL発行 → APIキー取得 |

## 主要モジュール

### ドメイン層

| ファイル | 責務 |
|----------|------|
| `Vendor.ts` | 販売者のビジネスロジック（EVMアドレス検証） |
| `Product.ts` | 商品のビジネスロジック（価格検証、パス検証、IMMEDIATE/ASYNC型） |
| `Payment.ts` | 決済記録のビジネスロジック（エスクロー状態管理：PENDING_ESCROW→SETTLED/REFUNDED） |
| `Task.ts` | 非同期タスクのビジネスロジック（状態遷移管理） |
| `APIKey.ts` | APIキーのビジネスロジック（有効期限、無効化判定） |
| `RedeemToken.ts` | リデームトークンのビジネスロジック（ワンタイム使用） |

### アプリケーション層

| ファイル | 責務 |
|----------|------|
| `IPaymentGateway.ts` | 支払いゲートウェイの抽象インターフェース（ポート） |
| `IEscrowService.ts` | エスクローサービスの抽象インターフェース（ポート） |
| `RegisterVendor.ts` | 販売者登録ユースケース |
| `RegisterProduct.ts` | 商品登録ユースケース（重複チェック、type対応） |
| `ProcessX402Request.ts` | x402支払いフロー全体を管理（ASYNC商品時はエスクローでTask作成、APIキー商品時はRedeemToken作成） |
| `GetVendorTasks.ts` | 販売者向け未処理タスク取得 |
| `StartTaskProcessing.ts` | タスク処理開始（pending→processing） |
| `ReportTaskResult.ts` | タスク完了/失敗報告（processing→completed/failed、エスクローリリース/返金） |
| `GetTaskStatus.ts` | 購入者向けタスクステータス取得 |
| `GetTaskResult.ts` | 購入者向けタスク結果取得 |
| `CreateAPIKey.ts` | APIキー作成（vendorId, name, expiresAt） |
| `CreateRedeemToken.ts` | リデームトークン作成（有効期限付き） |
| `RedeemAPIKey.ts` | トークン検証→APIキー発行→トークン使用済みに |

### インフラ層

| ファイル | 責務 |
|----------|------|
| `X402PaymentGateway.ts` | x402ResourceServerをラップした実装（ファシリテータ連携） |
| `EvmEscrowService.ts` | EVMエスクロー実装（viemでUSDC転送） |
| `PrismaPaymentRepository.ts` | 決済記録の永続化（エスクロー状態対応） |
| `PrismaTaskRepository.ts` | タスクの永続化 |
| `PrismaAPIKeyRepository.ts` | APIキーの永続化 |
| `PrismaRedeemTokenRepository.ts` | リデームトークンの永続化 |

### プレゼンテーション層

| ファイル | 責務 |
|----------|------|
| `vendorAuth.ts` | X-API-Key認証ミドルウェア（APIKeyRepository使用、有効期限チェック） |
| `admin.ts` | Admin API（販売者・商品登録） |
| `x402.ts` | x402 Protected Endpoints（ASYNC/APIキー対応） |
| `vendor.ts` | 販売者向けタスク管理API |
| `tasks.ts` | 購入者向けタスク確認API |
| `redeem.ts` | APIキーリデームAPI |

## フロー

### IMMEDIATE商品（従来）

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

### ASYNC商品（エスクロー対応）

```
購入者                   販売サーバー              エスクローWallet          販売者
  |                           |                           |                    |
  |-- GET /:vendorId/:path -->|                           |                    |
  |<-- 402 PaymentRequired ---|                           |                    |
  |                           |                           |                    |
  |-- GET + PAYMENT-SIGNATURE -->                         |                    |
  |                           |-- payTo=escrowAddress --->|                    |
  |                           |   (PENDING_ESCROW)        |                    |
  |<-- 200 { taskId } --------|                           |                    |
  |                           |                           |                    |
  |                           |<-- GET /vendor/tasks -----|------------------- |
  |                           |-- tasks[] ------------------------------------------------->|
  |                           |                           |                    |
  |                           |<-- POST .../start --------|------------------- |
  |                           |<-- POST .../complete -----|------------------- |
  |                           |-- release() ------------->|                    |
  |                           |                           |-- USDC送金 ------->|
  |                           |   (SETTLED)               |                    |
  |                           |                           |                    |
  |-- GET /tasks/:id/result -->                           |                    |
  |<-- { result } ------------|                           |                    |
  |                           |                           |                    |
  (タスク失敗時)               |                           |                    |
  |                           |<-- POST .../fail ---------|------------------- |
  |                           |-- refund() ------------->|                    |
  |<-- USDC返金 --------------|<--------------------------|                    |
  |                           |   (REFUNDED)              |                    |
```

### APIキー商品

```
購入者                   販売サーバー
  |                           |
  |-- GET /:vendorId/api-key -->
  |    { vendorId, name? }    |
  |<-- 402 PaymentRequired ---|
  |                           |
  |-- GET + PAYMENT-SIGNATURE -->
  |                           |-- Payment/RedeemToken作成
  |<-- 200 { redeemUrl } -----|
  |                           |
  |-- GET /redeem/:token ---->|
  |                           |-- APIKey作成
  |                           |-- Token使用済みに
  |<-- { vendorId, apiKey, name } --|
```

## API

### Admin API

| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| POST | `/admin/vendors` | 販売者登録 |
| POST | `/admin/vendors/:id/products` | 商品登録（type: immediate/async） |

### x402 Protected

| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| GET | `/:vendorId/:productPath` | 支払い→データ/タスク/リデームURL |

### 販売者API（要X-API-Key）

| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| GET | `/vendor/tasks` | 未処理タスク一覧 |
| POST | `/vendor/tasks/:taskId/start` | 処理開始 |
| POST | `/vendor/tasks/:taskId/complete` | 完了報告 |
| POST | `/vendor/tasks/:taskId/fail` | 失敗報告 |

### 購入者API

| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| GET | `/tasks/:taskId` | タスク状態確認 |
| GET | `/tasks/:taskId/result` | 結果取得 |

### リデームAPI

| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| GET | `/redeem/:token` | トークンでAPIキー取得 |

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
| `DATABASE_URL` | - | MongoDB接続URL |
| `REDEEM_TOKEN_EXPIRY_HOURS` | `24` | リデームトークン有効期限（時間） |
| `ESCROW_PRIVATE_KEY` | - | エスクローウォレット秘密鍵（設定時にエスクロー有効） |
| `USDC_CONTRACT_ADDRESS` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | USDCコントラクトアドレス（Base Sepolia） |
| `RPC_URL` | - | EVM RPCエンドポイント |

## エスクロー

ASYNC商品購入時、支払いはVendorに直接送金されず、エスクローウォレットで一旦保持されます。

### PaymentStatus 状態遷移

```
PENDING_ESCROW  →  Task完了  →  SETTLED (Vendorへリリース)
                →  Task失敗  →  REFUNDED (購入者へ返金)
```

### 設計

- `IEscrowService` インターフェースで抽象化
- `EvmEscrowService` はviemでUSDC (ERC20) 転送を実行
- 将来のスマートコントラクト対応は実装差し替えで可能
