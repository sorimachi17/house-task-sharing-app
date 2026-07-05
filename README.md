# KAJI LOG(家事ログ)

同棲カップル2人のための家事記録・可視化アプリ。誰が・何を・いつやったかを記録し、草グラフ・時間割・集計で見える化する。ポイントや評価機能はなく、記録と可視化に特化している。

- ビルド不要のバニラJS構成(`index.html` / `style.css` / `app.js` / `config.js`)
- データ保存先は Supabase(無料枠)。フロントから直接APIを呼び出し、自前サーバーは不要
- ホスティングは GitHub Pages

## セットアップ手順

### 1. Supabase プロジェクトを作成

[supabase.com](https://supabase.com) でプロジェクトを新規作成する(リージョン: Tokyo 推奨)。

### 2. テーブルとシードデータを作成

Supabase の SQL Editor で以下を実行する。

```sql
-- 家事マスタ
create table chores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 実施記録
create table logs (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid not null references chores(id),
  done_by text not null check (done_by in ('a', 'b', 'both')),
  done_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_logs_done_at on logs (done_at);

-- RLS: 匿名キーでフルアクセス(2人用プライベートアプリのため)
alter table chores enable row level security;
alter table logs enable row level security;
create policy "anon all chores" on chores for all to anon using (true) with check (true);
create policy "anon all logs" on logs for all to anon using (true) with check (true);

-- シードデータ(家事マスタ初期値)
insert into chores (name, category, sort_order) values
  ('掃除機', '掃除', 1),
  ('埃取り', '掃除', 2),
  ('散らかり片づける', '掃除', 3),
  ('トイレ掃除', '掃除', 4),
  ('洗面所掃除', '掃除', 5),
  ('洗濯機回す', '洗濯', 1),
  ('洗濯干す', '洗濯', 2),
  ('洗濯畳む', '洗濯', 3),
  ('シーツ洗い', '洗濯', 4),
  ('お風呂掃除(湯舟)', '風呂', 1),
  ('お風呂掃除(髪の毛取り)', '風呂', 2),
  ('お風呂掃除(洗い場)', '風呂', 3),
  ('お皿洗い(一人分)', 'キッチン', 1),
  ('お皿洗い(二人分)', 'キッチン', 2),
  ('キッチンシンク', 'キッチン', 3),
  ('コンロ', 'キッチン', 4),
  ('ゴミ出し(燃えるゴミ)', 'ゴミ出し', 1),
  ('ゴミ出し(ペットボトル)', 'ゴミ出し', 2),
  ('ゴミ出し(段ボール)', 'ゴミ出し', 3),
  ('ゴミ出し(缶)', 'ゴミ出し', 4),
  ('シャンプー・ソープ補充', '買い物・補充', 1),
  ('R1買う', '買い物・補充', 2),
  ('水買う', '買い物・補充', 3),
  ('水やり', 'その他', 1);
```

### 3. API キーを `config.js` に設定

Supabase の `Project Settings → API` から `URL` と `anon public` キーを取得し、`config.js` を書き換える。

```js
const CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",
  USERS: {
    a: { name: "マサ", color: "#2A9D8F" },
    b: { name: "○○", color: "#E9A03B" },
  },
};
```

`USERS` の `name` は実際の名前に、`color` は好みの色に変更してよい(色覚多様性の観点から、A/Bで明度・色相差がはっきり異なる組み合わせを推奨)。

### 4. GitHub Pages で公開

このリポジトリを push し、`Settings → Pages` でブランチ(`main`)を指定して公開する。

### 5. スマホのホーム画面に追加

2人ともブラウザで公開URLを開き、ホーム画面に追加する(`apple-mobile-web-app-capable` 対応済み)。

## セキュリティに関する注記

`anon` キーはフロントエンドに埋め込まれるため公開情報になる。RLSを全許可にしているので、**URLとキーを知っていれば誰でも読み書きできる**。2人用の家事記録という性質上、実害は小さいと判断してこの構成にしている。気になる場合は、Supabase の匿名認証+共有パスフレーズやメールマジックリンク認証への切り替えを検討する。

## 画面構成

- **記録タブ**: カテゴリ別の家事一覧をタップして記録。直近30日でよく使う家事TOP3をクイックボタンとして表示
- **草タブ**: 月表示のカレンダー。各日を上下2分割してA/Bそれぞれの実施回数を濃淡で表示(GitHub風)
- **週タブ**: 5:00〜25:00の時間割ビュー。いつ・誰が家事をしたかを時刻位置にチップ表示
- **集計タブ**: 今週/今月のA・B比較と、家事別の実施件数テーブル

`both`(二人でやった)の記録は、集計・草グラフともにA・B両方に1件ずつカウントされる。

## スコープ外

- ポイント・評価・リマインダー機能
- 家事マスタの画面上での追加編集(Supabase の Table Editor で直接管理)
- 通知、リアルタイム同期、オフライン対応
- 認証
