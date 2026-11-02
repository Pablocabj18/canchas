// Panel del complejo: reservas, carga manual y configuración de canchas y horarios.
(async function () {
  const U = window.Utils;
  const S = window.Store;
  const $ = (s) => document.querySelector(s);
  const el = U.el;
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

  let settings = null;

  function toast(msg) {
    const t = el("div", { class: "toast", role: "status" }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ---------- Login ----------
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error");
    err.hidden = true;
    try {
      await S.signIn($("#email").value.trim(), $("#password").value);
      await showApp();
    } catch (ex) {
      err.textContent = "Email o contraseña incorrectos.";
      err.hidden = false;
    }
  });

  $("#logout").addEventListener("click", async () => {
    await S.signOut();
    location.reload();
  });

  // ---------- Pestañas ----------
  const TABS = { bookings: "#tab-bookings", new: "#tab-new", settings: "#tab-settings" };
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      for (const [name, sel] of Object.entries(TABS)) $(sel).hidden = tab.dataset.tab !== name;
      if (tab.dataset.tab === "new") prepareNewForm();
    });
  });

  // ---------- Reservas ----------
  async function renderBookings() {
    const box = $("#bookings");
    let list;
    try {
      list = await S.listBookings(U.dateKey(new Date()));
    } catch (ex) {
      box.replaceChildren(el("p", { class: "error" }, "No se pudieron cargar las reservas."));
      return;
    }
    if (!list.length) {
      box.replaceChildren(el("p", { class: "empty" }, "No hay reservas próximas."));
      return;
    }

    const groups = {};
    list.forEach((b) => (groups[b.day] = groups[b.day] || []).push(b));

    box.replaceChildren(...Object.entries(groups).map(([day, items]) =>
      el("div", { class: "day-group" },
        el("h3", {}, U.formatDayLong(day) + " · " + items.length + (items.length === 1 ? " reserva" : " reservas")),
        items.map((b) => el("div", { class: "booking" },
          el("span", { class: "when" }, b.time),
          el("div", { class: "who" },
            el("strong", {}, b.name),
            el("div", { class: "meta" }, b.courtName + " · " + b.duration + " min · " + b.phone)
          ),
          el("div", { class: "acts" },
            el("a", {
              class: "btn ghost sm", target: "_blank", rel: "noopener",
              href: U.waLink(b.phone, "Hola " + b.name + "! Te recuerdo tu reserva de " + b.courtName + " en " +
                settings.businessName + " el " + U.formatDayLong(b.day) + " a las " + b.time + " hs.", settings.countryCode)
            }, "Recordar"),
            el("button", {
              class: "btn danger sm", type: "button",
              onclick: async () => {
                if (!confirm("¿Cancelar la reserva de " + b.name + " (" + b.courtName + ", " + b.time + ")?")) return;
                await S.cancelBooking(b.id);
                toast("Reserva cancelada");
                renderBookings();
              }
            }, "Cancelar")
          )
        ))
      )
    ));
  }

  $("#refresh").addEventListener("click", renderBookings);

  // ---------- Nueva reserva manual ----------
  async function refreshTimes() {
    const day = $("#n-day").value;
    const court = settings.courts.find((c) => c.id === $("#n-court").value);
    const sel = $("#n-time");
    if (!day || !court) {
      sel.replaceChildren();
      return;
    }
    const busy = await S.getBusy(day, day);
    const times = U.availableSlots(settings, day, court, busy, new Date());
    sel.replaceChildren(...(times.length
      ? times.map((t) => el("option", { value: t }, t))
      : [el("option", { value: "" }, "Sin horarios libres")]));
  }

  function prepareNewForm() {
    if (!$("#n-day").value) $("#n-day").value = U.dateKey(new Date());
    $("#n-day").min = U.dateKey(new Date());
    const current = $("#n-court").value;
    $("#n-court").replaceChildren(...settings.courts.map((c) => el("option", { value: c.id }, c.name)));
    if (current) $("#n-court").value = current;
    refreshTimes();
  }

  $("#n-day").addEventListener("change", refreshTimes);
  $("#n-court").addEventListener("change", refreshTimes);

  $("#tab-new").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#new-error");
    err.hidden = true;
    const court = settings.courts.find((c) => c.id === $("#n-court").value);
    const time = $("#n-time").value;
    const name = $("#n-name").value.trim();
    const phone = $("#n-phone").value.trim();
    try {
      if (!court || !time) throw new Error("Elegí un día, una cancha y un horario libre.");
      if (name.length < 2) throw new Error("Escribí el nombre.");
      if (phone.replace(/\D/g, "").length < 8) throw new Error("Escribí un teléfono válido.");
      await S.createBooking({
        day: $("#n-day").value, time, duration: Number(court.duration),
        courtId: court.id, courtName: court.name, name, phone
      });
      $("#n-name").value = "";
      $("#n-phone").value = "";
      toast("Reserva guardada");
      refreshTimes();
      renderBookings();
    } catch (ex) {
      err.textContent = String(ex.message).includes("ocupado") ? "Ese horario ya está ocupado." : ex.message;
      err.hidden = false;
    }
  });

  // ---------- Configuración ----------
  function renderHours() {
    $("#hours").replaceChildren(...WEEK_ORDER.map((dow) => {
      const h = settings.hours[String(dow)];
      const open = !!h;
      const v = h || { start: "08:00", end: "00:00" };
      const timeInput = (field, value) => el("input", { type: "time", "data-field": field, value: value || "", step: "900" });

      const row = el("div", { class: "hours-row" + (open ? "" : " closed"), "data-dow": dow },
        el("label", { class: "check-label" },
          el("input", {
            type: "checkbox", checked: open, "data-field": "open",
            onchange: (e) => row.classList.toggle("closed", !e.target.checked)
          }),
          U.DAY_NAMES[dow]
        ),
        el("div", { class: "times-in" }, timeInput("start", v.start), "a", timeInput("end", v.end))
      );
      return row;
    }));
  }

  function courtRow(c) {
    const durations = [60, 90, 120];
    if (!durations.includes(Number(c.duration))) durations.push(Number(c.duration));
    const row = el("div", { class: "court-row", "data-id": c.id },
      el("input", { type: "text", "data-field": "name", value: c.name, maxlength: "40", "aria-label": "Nombre de la cancha" }),
      el("input", { type: "text", "data-field": "sport", value: c.sport, maxlength: "30", "aria-label": "Deporte" }),
      el("select", { "data-field": "duration", "aria-label": "Duración del turno" },
        durations.map((d) => el("option", { value: String(d), selected: d === Number(c.duration) }, d + " min"))),
      el("input", { type: "number", "data-field": "price", value: c.price != null ? String(c.price) : "", min: "0", "aria-label": "Precio" }),
      el("button", { class: "btn danger sm", type: "button", onclick: () => row.remove(), "aria-label": "Quitar cancha" }, "✕")
    );
    return row;
  }

  function renderSettings() {
    $("#s-name").value = settings.businessName;
    $("#s-address").value = settings.address || "";
    $("#s-wa").value = settings.whatsapp || "";
    $("#s-cc").value = settings.countryCode || "";
    $("#s-days").value = String(settings.daysAhead);
    renderHours();
    $("#courts-edit").replaceChildren(...settings.courts.map(courtRow));
  }

  $("#add-court").addEventListener("click", () => {
    const last = settings.courts[settings.courts.length - 1];
    const row = courtRow({ id: "c" + Date.now(), name: "", sport: last ? last.sport : "", duration: 60, price: "" });
    $("#courts-edit").append(row);
    row.querySelector("input").focus();
  });

  function collectSettings() {
    const hours = {};
    document.querySelectorAll(".hours-row").forEach((row) => {
      const get = (f) => row.querySelector(`[data-field="${f}"]`);
      if (!get("open").checked) {
        hours[row.dataset.dow] = null;
        return;
      }
      const h = { start: get("start").value, end: get("end").value };
      const endMin = h.end === "00:00" ? 1440 : U.toMin(h.end || "00:00");
      if (!h.start || !h.end || U.toMin(h.start) >= endMin) {
        throw new Error(U.DAY_NAMES[row.dataset.dow] + ": el horario de cierre tiene que ser después del de apertura.");
      }
      hours[row.dataset.dow] = h;
    });

    const courts = [...document.querySelectorAll(".court-row[data-id]")].map((row) => {
      const get = (f) => row.querySelector(`[data-field="${f}"]`).value;
      const price = get("price");
      return {
        id: row.dataset.id,
        name: get("name").trim(),
        sport: get("sport").trim() || "General",
        duration: Number(get("duration")),
        price: price === "" ? null : Number(price)
      };
    }).filter((c) => c.name);
    if (!courts.length) throw new Error("Cargá al menos una cancha.");

    const name = $("#s-name").value.trim();
    if (!name) throw new Error("Poné el nombre de tu complejo.");

    return {
      businessName: name,
      address: $("#s-address").value.trim(),
      whatsapp: $("#s-wa").value.replace(/\D/g, ""),
      countryCode: $("#s-cc").value.replace(/\D/g, ""),
      daysAhead: Math.min(60, Math.max(1, Number($("#s-days").value) || 14)),
      courts,
      hours
    };
  }

  $("#tab-settings").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#save-error");
    err.hidden = true;
    const btn = $("#save");
    btn.disabled = true;
    try {
      const next = collectSettings();
      await S.saveSettings(next);
      settings = next;
      $("#title").textContent = settings.businessName;
      toast("Cambios guardados");
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Inicio ----------
  $("#copy-link").addEventListener("click", async () => {
    const input = $("#public-link");
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (ex) {
      input.select();
      document.execCommand("copy");
    }
    toast("Link copiado");
  });

  async function showApp() {
    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#logout").hidden = !S.isRemote;
    $("#mode").textContent = S.isRemote ? "Conectado a la base de datos" : "Modo demo · datos guardados en este navegador";
    $("#public-link").value = new URL("index.html", location.href).href;
    settings = await S.getSettings();
    $("#title").textContent = settings.businessName;
    renderSettings();
    await renderBookings();
  }

  const session = await S.getSession().catch(() => null);
  if (session) await showApp();
  else $("#login").hidden = false;
})();
