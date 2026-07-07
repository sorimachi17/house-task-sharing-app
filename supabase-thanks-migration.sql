alter table logs
add column if not exists thanks_by text[] not null default '{}';
