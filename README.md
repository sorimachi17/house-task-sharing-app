# KAJI LOG

同棲カップル2人向けの家事記録・可視化アプリです。スマホブラウザで使う前提の静的アプリで、GitHub Pages と Supabase だけで動きます。

## ファイル構成

- `index.html`: 画面構造
- `style.css`: モバイルファーストのUI
- `app.js`: 記録、編集、削除、草グラフ、週表示、集計
- `config.js`: Supabase接続情報と2人の表示名・色

## セットアップ

1. Supabase でプロジェクトを作成します。リージョンは Tokyo を推奨します。
2. Supabase の SQL Editor で下記SQLを実行します。
3. Project Settings → API から URL と anon key を取得し、`config.js` に記入します。
4. GitHub リポジトリにこの4ファイルと README を push します。
5. Settings → Pages で `main` ブランチを公開します。
6. 2人とも公開URLをスマホのホーム画面に追加します。

## config.js

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

## Supabase SQL

```sql
create table chores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table logs (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid not null references chores(id),
  done_by text not null check (done_by in ('a', 'b', 'both')),
  done_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_logs_done_at on logs (done_at);

alter table chores enable row level security;
alter table logs enable row level security;
create policy "anon all chores" on chores for all to anon using (true) with check (true);
create policy "anon all logs" on logs for all to anon using (true) with check (true);

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

## セキュリティ注記

この構成では anon key がフロントエンドに含まれます。RLSも匿名キーで全許可にしているため、URLとキーを知っている人は読み書きできます。2人用MVPとしての割り切りです。
