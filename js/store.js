// Capa de datos: usa Supabase si está configurado, si no guarda en el navegador (modo demo).
(function () {
  const cfg = window.APP_CONFIG || {};

  const week = (start, end) => ({ start, end });
  const DEFAULT_SETTINGS = {
    businessName: "Complejo Deportivo",
    address: "",
    whatsapp: "",
    countryCode: "549",
    daysAhead: 14,
    courts: [
      { id: "padel-1", name: "Pádel 1", sport: "Pádel", duration: 90, price: 24000 },
      { id: "padel-2", name: "Pádel 2", sport: "Pádel", duration: 90, price: 24000 },
      { id: "f5-1", name: "Fútbol 5", sport: "Fútbol 5", duration: 60, price: 40000 }
    ],
    // Clave = día de la semana (0 = domingo). null = cerrado. "00:00" de cierre = medianoche.
    hours: {
      "0": week("09:00", "22:00"),
      "1": week("08:00", "00:00"),
      "2": week("08:00", "00:00"),
      "3": week("08:00", "00:00"),
      "4": week("08:00", "00:00"),
      "5": week("08:00", "00:00"),
      "6": week("08:00", "00:00")
    }
  };

  function withDefaults(data) {
    const s = Object.assign({}, DEFAULT_SETTINGS, data || {});
    s.hours = Object.assign({}, DEFAULT_SETTINGS.hours, (data && data.hours) || {});
    return s;
  }

  function overlaps(a, b) {
    const at = Utils.toMin(a.time), bt = Utils.toMin(b.time);
    return a.day === b.day && a.courtId === b.courtId && at < bt + b.duration && at + a.duration > bt;
  }

  // Convierte los turnos fijos (ej: todos los lunes 21:00) en reservas de cada día del rango.
  function expandFixed(list, from, to) {
    const out = [];
    for (let d = Utils.parseDay(from); Utils.dateKey(d) <= to; d = Utils.addDays(d, 1)) {
      const day = Utils.dateKey(d);
      for (const f of list) {
        if (Number(f.dow) !== d.getDay() || day < f.since || (f.until && day > f.until)) continue;
        if ((f.skips || []).includes(day)) continue;
        out.push({
          id: "fijo:" + f.id + ":" + day, fixedId: f.id, fixed: true, status: "confirmed",
          day, time: f.time, duration: f.duration, courtId: f.courtId, courtName: f.courtName,
          name: f.name, phone: f.phone
        });
      }
    }
    return out;
  }

  const byWhen = (a, b) => (a.day + a.time + a.courtName).localeCompare(b.day + b.time + b.courtName);

  // ---------- Modo demo (localStorage) ----------
  const LS_SETTINGS = "canchas.settings";
  const LS_BOOKINGS = "canchas.bookings";
  const LS_FIXED = "canchas.fixed";

  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      throw new Error("No se pudo guardar en este navegador.");
    }
  }

  const localStore = {
    isRemote: false,
    async getSettings() { return withDefaults(lsGet(LS_SETTINGS, null)); },
    async saveSettings(s) { lsSet(LS_SETTINGS, s); },
    async getBusy(from, to) {
      return lsGet(LS_BOOKINGS, [])
        .filter((b) => b.status === "confirmed" && b.day >= from && b.day <= to)
        .concat(expandFixed(lsGet(LS_FIXED, []), from, to));
    },
    async createBooking(b) {
      const all = lsGet(LS_BOOKINGS, []);
      const taken = all.filter((x) => x.status === "confirmed").concat(expandFixed(lsGet(LS_FIXED, []), b.day, b.day));
      if (taken.some((x) => overlaps(b, x))) throw new Error("ocupado");
      const booking = Object.assign({ id: String(Date.now()), status: "confirmed" }, b);
      all.push(booking);
      lsSet(LS_BOOKINGS, all);
      return booking.id;
    },
    async listBookings(from, to) {
      return lsGet(LS_BOOKINGS, [])
        .filter((b) => b.status === "confirmed" && b.day >= from && b.day <= to)
        .concat(expandFixed(lsGet(LS_FIXED, []), from, to))
        .sort(byWhen);
    },
    async listFixed() { return lsGet(LS_FIXED, []); },
    async saveFixed(f) {
      const all = lsGet(LS_FIXED, []);
      const fixed = Object.assign({ skips: [], until: "" }, f, { id: f.id || String(Date.now()) });
      const i = all.findIndex((x) => x.id === fixed.id);
      if (i >= 0) all[i] = fixed;
      else all.push(fixed);
      lsSet(LS_FIXED, all);
    },
    async deleteFixed(id) {
      lsSet(LS_FIXED, lsGet(LS_FIXED, []).filter((f) => f.id !== id));
    },
    async skipFixed(id, day) {
      const all = lsGet(LS_FIXED, []);
      const f = all.find((x) => x.id === id);
      if (f) f.skips = [...new Set([...(f.skips || []), day])];
      lsSet(LS_FIXED, all);
    },
    async cancelBooking(id) {
      const all = lsGet(LS_BOOKINGS, []);
      const b = all.find((x) => x.id === id);
      if (b) b.status = "cancelled";
      lsSet(LS_BOOKINGS, all);
    },
    async getSession() { return { local: true }; },
    async signIn() {},
    async signOut() {}
  };

  // ---------- Supabase ----------
  function makeRemoteStore() {
    const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const check = ({ data, error }) => {
      if (error) throw new Error(error.message);
      return data;
    };
    const normalize = (r) => ({
      id: r.id, day: r.day, time: String(r.start_time).slice(0, 5), duration: r.duration,
      courtId: r.court_id, courtName: r.court_name, name: r.name, phone: r.phone, status: r.status
    });
    const normalizeFixed = (r) => ({
      id: r.id, dow: r.dow, time: String(r.start_time).slice(0, 5), duration: r.duration,
      courtId: r.court_id, courtName: r.court_name, name: r.name, phone: r.phone,
      since: r.since, until: r.until || "", skips: r.skips || []
    });
    const listFixed = async () =>
      check(await db.from("fixed_bookings").select("*").order("dow").order("start_time")).map(normalizeFixed);

    return {
      isRemote: true,
      async getSettings() {
        const row = check(await db.from("settings").select("data").eq("id", 1).maybeSingle());
        return withDefaults(row && row.data);
      },
      async saveSettings(s) {
        check(await db.from("settings").upsert({ id: 1, data: s }));
      },
      async getBusy(from, to) {
        const rows = check(await db.rpc("get_busy", { d_from: from, d_to: to }));
        return rows.map((r) => ({ day: r.day, time: r.start_time, duration: r.duration, courtId: r.court_id }));
      },
      async createBooking(b) {
        return check(await db.rpc("create_booking", {
          p_day: b.day, p_time: b.time, p_duration: b.duration,
          p_court_id: b.courtId, p_court_name: b.courtName, p_name: b.name, p_phone: b.phone
        }));
      },
      async listBookings(from, to) {
        const rows = check(await db.from("bookings").select("*")
          .eq("status", "confirmed").gte("day", from).lte("day", to));
        return rows.map(normalize).concat(expandFixed(await listFixed(), from, to)).sort(byWhen);
      },
      listFixed,
      async saveFixed(f) {
        const row = {
          dow: f.dow, start_time: f.time, duration: f.duration, court_id: f.courtId, court_name: f.courtName,
          name: f.name, phone: f.phone, since: f.since, until: f.until || null, skips: f.skips || []
        };
        if (f.id) row.id = f.id;
        check(await db.from("fixed_bookings").upsert(row));
      },
      async deleteFixed(id) {
        check(await db.from("fixed_bookings").delete().eq("id", id));
      },
      async skipFixed(id, day) {
        const row = check(await db.from("fixed_bookings").select("skips").eq("id", id).single());
        const skips = [...new Set([...(row.skips || []), day])];
        check(await db.from("fixed_bookings").update({ skips }).eq("id", id));
      },
      async cancelBooking(id) {
        check(await db.from("bookings").update({ status: "cancelled" }).eq("id", id));
      },
      async getSession() {
        return check(await db.auth.getSession()).session;
      },
      async signIn(email, password) {
        check(await db.auth.signInWithPassword({ email, password }));
      },
      async signOut() {
        await db.auth.signOut();
      }
    };
  }

  const useRemote = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase;
  window.Store = useRemote ? makeRemoteStore() : localStore;
})();
