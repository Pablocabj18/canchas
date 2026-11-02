-- Esquema de la base de datos para Supabase.
-- Pegá todo este archivo en Supabase → SQL Editor → New query → Run.

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  start_time time not null,
  duration int not null check (duration between 15 and 300),
  court_id text not null,
  court_name text not null,
  name text not null,
  phone text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists bookings_day_idx on bookings (day, court_id) where status = 'confirmed';

-- Turnos fijos: se repiten todas las semanas (ej: lunes 21:00 en Pádel 1).
-- dow: día de la semana, 0 = domingo. skips: fechas puntuales que se liberaron.
create table if not exists fixed_bookings (
  id uuid primary key default gen_random_uuid(),
  dow smallint not null check (dow between 0 and 6),
  start_time time not null,
  duration int not null check (duration between 15 and 300),
  court_id text not null,
  court_name text not null,
  name text not null,
  phone text not null,
  since date not null default current_date,
  until date,
  skips date[] not null default '{}',
  created_at timestamptz not null default now()
);

insert into settings (id) values (1) on conflict (id) do nothing;

-- Seguridad: los clientes (anónimos) NO pueden leer los datos de otros clientes.
-- Sólo el dueño logueado ve y modifica todo.
alter table settings enable row level security;
alter table bookings enable row level security;

drop policy if exists "settings: lectura pública" on settings;
create policy "settings: lectura pública" on settings
  for select using (true);

drop policy if exists "settings: el admin edita" on settings;
create policy "settings: el admin edita" on settings
  for all to authenticated using (true) with check (true);

drop policy if exists "bookings: el admin gestiona" on bookings;
create policy "bookings: el admin gestiona" on bookings
  for all to authenticated using (true) with check (true);

alter table fixed_bookings enable row level security;
drop policy if exists "fijos: el admin gestiona" on fixed_bookings;
create policy "fijos: el admin gestiona" on fixed_bookings
  for all to authenticated using (true) with check (true);

-- Horarios ocupados (sin nombres ni teléfonos) para la página pública.
-- Incluye las reservas sueltas y los turnos fijos de cada semana.
create or replace function get_busy(d_from date, d_to date)
returns table (day date, start_time text, duration int, court_id text)
language sql security definer set search_path = public
as $$
  select b.day, to_char(b.start_time, 'HH24:MI'), b.duration, b.court_id
  from bookings b
  where b.status = 'confirmed' and b.day between d_from and d_to
  union all
  select d::date, to_char(f.start_time, 'HH24:MI'), f.duration, f.court_id
  from generate_series(d_from::timestamp, least(d_to, d_from + 120)::timestamp, interval '1 day') d
  join fixed_bookings f on f.dow = extract(dow from d)::int
  where d::date >= f.since
    and (f.until is null or d::date <= f.until)
    and not (d::date = any (f.skips));
$$;

-- Crear una reserva verificando que la cancha siga libre en ese horario.
create or replace function create_booking(
  p_day date, p_time time, p_duration int,
  p_court_id text, p_court_name text, p_name text, p_phone text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
  p_start int := extract(epoch from p_time)::int / 60; -- minutos desde las 00:00
begin
  if p_day < current_date or p_day > current_date + 90 then
    raise exception 'fecha_invalida';
  end if;
  if p_duration not between 15 and 300
     or length(trim(p_name)) not between 2 and 80
     or length(p_phone) not between 8 and 30
     or length(p_court_id) > 60 or length(p_court_name) > 60 then
    raise exception 'datos_invalidos';
  end if;

  -- Evita que dos personas reserven la misma cancha al mismo tiempo.
  perform pg_advisory_xact_lock(hashtext(p_day::text || p_court_id));

  if exists (
    select 1 from bookings b
    where b.status = 'confirmed' and b.day = p_day and b.court_id = p_court_id
      and extract(epoch from b.start_time)::int / 60 < p_start + p_duration
      and extract(epoch from b.start_time)::int / 60 + b.duration > p_start
  ) then
    raise exception 'ocupado';
  end if;

  if exists (
    select 1 from fixed_bookings f
    where f.court_id = p_court_id and f.dow = extract(dow from p_day)::int
      and p_day >= f.since and (f.until is null or p_day <= f.until)
      and not (p_day = any (f.skips))
      and extract(epoch from f.start_time)::int / 60 < p_start + p_duration
      and extract(epoch from f.start_time)::int / 60 + f.duration > p_start
  ) then
    raise exception 'ocupado';
  end if;

  insert into bookings (day, start_time, duration, court_id, court_name, name, phone)
  values (p_day, p_time, p_duration, p_court_id, trim(p_court_name), trim(p_name), trim(p_phone))
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function get_busy(date, date) from public;
revoke all on function create_booking(date, time, int, text, text, text, text) from public;
grant execute on function get_busy(date, date) to anon, authenticated;
grant execute on function create_booking(date, time, int, text, text, text, text) to anon, authenticated;
