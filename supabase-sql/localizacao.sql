-- ============================================================================
-- Localização dos celulares da empresa (somente no horário de trabalho)
-- Cole este arquivo inteiro no Supabase > SQL Editor > Run. Pode rodar de novo sem problema.
-- ============================================================================

create table if not exists public.loc_config (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default true,
  dias int[] not null default '{1,2,3,4,5}',      -- 1 = segunda ... 7 = domingo
  inicio time not null default '08:00',
  fim time not null default '18:00',
  intervalo_s int not null default 60,            -- de quanto em quanto tempo o celular envia a posição
  retencao_dias int not null default 30           -- depois disso as posições são apagadas
);
insert into public.loc_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.loc_pontos (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  dispositivo text not null,
  lat double precision not null,
  lng double precision not null,
  precisao real,
  bateria smallint,
  registrado_em timestamptz not null,
  criado_em timestamptz not null default now()
);
create index if not exists loc_pontos_user_idx on public.loc_pontos (user_id, registrado_em desc);
create index if not exists loc_pontos_data_idx on public.loc_pontos (registrado_em);

-- quem consultou a localização de quem (transparência / LGPD)
create table if not exists public.loc_acessos (
  id bigint generated always as identity primary key,
  visualizador uuid not null,
  alvo uuid,
  tipo text not null,
  em timestamptz not null default now()
);

alter table public.loc_config  enable row level security;
alter table public.loc_pontos  enable row level security;
alter table public.loc_acessos enable row level security;
-- sem policies de propósito: tudo passa pelas funções abaixo

-- ---------------------------------------------------------------- auxiliares
create or replace function public._loc_papel(_papeis text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role::text = any(_papeis));
$$;

create or replace function public._loc_na_janela(_t timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.ativo
       and extract(isodow from (_t at time zone 'America/Sao_Paulo'))::int = any (c.dias)
       and (_t at time zone 'America/Sao_Paulo')::time between c.inicio and c.fim
    from public.loc_config c where c.id = 1), false);
$$;

-- ------------------------------------------------------ usadas pelo celular
create or replace function public.loc_config_ler() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._loc_papel(array['admin','celular','prospector']) then raise exception 'sem permissao'; end if;
  return (select jsonb_build_object('ativo', ativo, 'dias', dias, 'inicio', to_char(inicio,'HH24:MI'), 'fim', to_char(fim,'HH24:MI'),
                                    'intervalo_s', intervalo_s, 'agora', now(), 'na_janela', public._loc_na_janela(now()))
          from public.loc_config where id = 1);
end $$;

create or replace function public.loc_registrar(_dispositivo text, _pontos jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p jsonb; ok int := 0; fora int := 0; t timestamptz; la double precision; lo double precision;
begin
  if not public._loc_papel(array['admin','celular','prospector']) then raise exception 'sem permissao'; end if;
  if jsonb_typeof(_pontos) <> 'array' then raise exception 'formato invalido'; end if;
  for p in select * from jsonb_array_elements(_pontos) limit 200 loop
    begin
      t := (p->>'t')::timestamptz; la := (p->>'lat')::double precision; lo := (p->>'lng')::double precision;
    exception when others then fora := fora + 1; continue; end;
    if la not between -90 and 90 or lo not between -180 and 180 or t > now() + interval '5 minutes' or t < now() - interval '2 days'
       or not public._loc_na_janela(t) then fora := fora + 1; continue; end if;
    insert into public.loc_pontos (user_id, dispositivo, lat, lng, precisao, bateria, registrado_em)
    values (auth.uid(), left(coalesce(nullif(trim(_dispositivo), ''), 'Celular'), 60), la, lo,
            nullif(p->>'prec','')::real, nullif(p->>'bat','')::smallint, t);
    ok := ok + 1;
  end loop;
  if random() < 0.02 then
    delete from public.loc_pontos where registrado_em < now() - (select retencao_dias from public.loc_config where id = 1) * interval '1 day';
  end if;
  return jsonb_build_object('gravados', ok, 'ignorados', fora, 'na_janela', public._loc_na_janela(now()));
end $$;

-- ------------------------------------------------- usadas pelo painel (admin)
create or replace function public.loc_ultimas() returns table (
  user_id uuid, dispositivo text, lat double precision, lng double precision, precisao real, bateria smallint,
  registrado_em timestamptz, ao_vivo boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public._loc_papel(array['admin']) then raise exception 'sem permissao'; end if;
  insert into public.loc_acessos (visualizador, tipo) values (auth.uid(), 'mapa');
  return query
    select distinct on (p.user_id) p.user_id, p.dispositivo, p.lat, p.lng, p.precisao, p.bateria, p.registrado_em,
           p.registrado_em > now() - interval '5 minutes'
    from public.loc_pontos p
    where p.registrado_em > now() - interval '7 days'
    order by p.user_id, p.registrado_em desc;
end $$;

create or replace function public.loc_trajeto(_user uuid, _dia date) returns table (
  lat double precision, lng double precision, bateria smallint, registrado_em timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public._loc_papel(array['admin']) then raise exception 'sem permissao'; end if;
  insert into public.loc_acessos (visualizador, alvo, tipo) values (auth.uid(), _user, 'trajeto');
  return query
    select p.lat, p.lng, p.bateria, p.registrado_em from public.loc_pontos p
    where p.user_id = _user and (p.registrado_em at time zone 'America/Sao_Paulo')::date = _dia
    order by p.registrado_em;
end $$;

create or replace function public.loc_config_salvar(_ativo boolean, _dias int[], _inicio time, _fim time, _intervalo_s int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._loc_papel(array['admin']) then raise exception 'sem permissao'; end if;
  if _fim <= _inicio then raise exception 'o fim precisa ser depois do inicio'; end if;
  update public.loc_config set ativo = _ativo, dias = _dias, inicio = _inicio, fim = _fim,
         intervalo_s = greatest(15, least(600, _intervalo_s)) where id = 1;
end $$;

revoke all on function public.loc_config_ler(), public.loc_registrar(text, jsonb), public.loc_ultimas(), public.loc_trajeto(uuid, date),
  public.loc_config_salvar(boolean, int[], time, time, int), public._loc_papel(text[]), public._loc_na_janela(timestamptz) from public, anon;
grant execute on function public.loc_config_ler(), public.loc_registrar(text, jsonb), public.loc_ultimas(), public.loc_trajeto(uuid, date),
  public.loc_config_salvar(boolean, int[], time, time, int) to authenticated;
