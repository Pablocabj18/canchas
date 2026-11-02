# Reservas de canchas

Sistema de reservas para complejos de pádel, fútbol 5, tenis, etc. El cliente elige deporte, día, cancha y horario; el dueño ve las reservas, carga las que le piden por teléfono y configura canchas, precios y horarios.

- `index.html`: página pública de reservas (el link que se comparte).
- `admin.html`: panel del complejo (reservas, carga manual, turnos fijos, canchas, precios y horarios).
- `supabase/schema.sql`: base de datos.

Funciona en GitHub Pages y la base de datos es **gratis** con el plan free de Supabase.

## Turnos fijos

En el panel, pestaña **Turnos fijos**, se cargan los grupos que juegan siempre el mismo día y hora (ej: todos los lunes a las 21:30 en Pádel 1). Ese horario queda ocupado todas las semanas. Si una semana no vienen, en **Reservas** se toca **Liberar este día** y queda libre sólo esa fecha.

## Modo demo

Sin configurar nada, funciona en **modo demo**: los datos se guardan en el navegador donde se usan. Sirve para probar y mostrarlo, pero las reservas que hace un cliente desde su celular **no** le llegan al complejo. Para eso hay que conectar Supabase.

## Conectar la base de datos (Supabase, gratis)

1. Creá una cuenta en <https://supabase.com> y un proyecto nuevo.
2. **SQL Editor → New query**: pegá el contenido de `supabase/schema.sql` y tocá **Run**.
3. **Authentication → Users → Add user**: creá el usuario del dueño (email y contraseña).
4. **Authentication → Sign In / Providers → Allow new users to sign up = OFF** (importante: cualquier usuario logueado administra el complejo).
5. **Project Settings → API**: copiá la *Project URL* y la *anon public key* y pegalas en `js/config.js`.
6. Subí los cambios y entrá a `admin.html` con el usuario del paso 3.

## Publicar en GitHub Pages

Repositorio → **Settings → Pages → Deploy from a branch → `main` / root**.

## Próximos pasos posibles

- Seña online con Mercado Pago para confirmar la reserva.
- Precios distintos según horario (más caro después de las 18).
- Bloquear canchas por mantenimiento o torneos.
