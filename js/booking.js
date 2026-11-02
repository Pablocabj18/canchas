// Página pública donde el cliente reserva una cancha.
(async function () {
  const U = window.Utils;
  const S = window.Store;
  const $ = (s) => document.querySelector(s);
  const el = U.el;

  const state = { settings: null, busy: [], sport: null, day: null, court: null, time: null, month: null };

  function setPressed(container, btn) {
    container.querySelectorAll(".opt").forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
  }

  function daysRange() {
    const today = new Date();
    const n = Math.max(1, Number(state.settings.daysAhead) || 14);
    return Array.from({ length: n }, (_, i) => U.dateKey(U.addDays(today, i)));
  }

  function sportCourts() {
    return state.settings.courts.filter((c) => c.sport === state.sport);
  }

  function freeByCourt(day, now) {
    return sportCourts().map((court) => ({
      court, times: U.availableSlots(state.settings, day, court, state.busy, now)
    }));
  }

  async function loadBusy() {
    const days = daysRange();
    state.busy = await S.getBusy(days[0], days[days.length - 1]);
  }

  function sportIcon(sport) {
    const s = sport.toLowerCase();
    if (/p[aá]del|tenis|squash/.test(s)) return "🎾";
    if (/f[uú]tbol|futsal/.test(s)) return "⚽";
    if (/b[aá]squet|basket/.test(s)) return "🏀";
    if (/v[oó]ley/.test(s)) return "🏐";
    if (/hockey/.test(s)) return "🏑";
    return "🏟️";
  }

  function renderSports() {
    const box = $("#sports");
    const sports = [...new Set(state.settings.courts.map((c) => c.sport))];
    if (!sports.length) {
      box.replaceChildren(el("p", { class: "empty" }, "Todavía no hay canchas cargadas."));
      return;
    }
    box.replaceChildren(...sports.map((sport) => {
      const courts = state.settings.courts.filter((c) => c.sport === sport);
      const prices = courts.map((c) => Number(c.price)).filter((p) => p > 0);
      const btn = el("button", {
        class: "opt sport", type: "button", "aria-pressed": "false",
        onclick: () => {
          state.sport = sport;
          state.day = state.court = state.time = null;
          const today = new Date();
          state.month = new Date(today.getFullYear(), today.getMonth(), 1);
          setPressed(box, btn);
          renderDays();
          $("#step-day").hidden = false;
          $("#step-time").hidden = true;
          $("#step-form").hidden = true;
          $("#step-day").scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      },
        el("span", { class: "icon", "aria-hidden": "true" }, sportIcon(sport)),
        el("strong", {}, sport),
        el("span", { class: "meta" },
          courts.length + (courts.length === 1 ? " cancha" : " canchas") +
          (prices.length ? " · desde " + U.money(Math.min(...prices)) : ""))
      );
      return btn;
    }));
  }

  // Calendario del mes visible (state.month = primer día del mes).
  function renderDays() {
    const box = $("#days");
    const now = new Date();
    const range = daysRange();
    const first = range[0], last = range[range.length - 1];
    const year = state.month.getFullYear(), month = state.month.getMonth();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const offset = (state.month.getDay() + 6) % 7; // lunes = primera columna

    $("#month-label").textContent = U.monthLabel(year, month);
    const monthKey = (d) => d.getFullYear() * 12 + d.getMonth();
    $("#prev-month").disabled = monthKey(state.month) <= monthKey(U.parseDay(first));
    $("#next-month").disabled = monthKey(state.month) >= monthKey(U.parseDay(last));

    const blanks = Array.from({ length: offset }, () => el("span"));
    box.replaceChildren(...blanks, ...Array.from({ length: lastDate }, (_, i) => {
      const day = U.dateKey(new Date(year, month, i + 1));
      const inRange = day >= first && day <= last;
      const free = inRange ? freeByCourt(day, now).reduce((n, c) => n + c.times.length, 0) : 0;
      const btn = el("button", {
        class: "opt day" + (day === first ? " today" : ""), type: "button",
        "aria-pressed": String(day === state.day),
        "aria-label": U.formatDayLong(day) + (free ? ", " + free + " horarios libres" : ", sin horarios"),
        disabled: free === 0,
        onclick: () => {
          state.day = day;
          state.court = state.time = null;
          setPressed(box, btn);
          renderCourts();
          $("#step-time").hidden = false;
          $("#step-form").hidden = true;
          $("#step-time").scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, i + 1);
      return btn;
    }));
  }

  function changeMonth(delta) {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
    renderDays();
  }
  $("#prev-month").addEventListener("click", () => changeMonth(-1));
  $("#next-month").addEventListener("click", () => changeMonth(1));

  function renderCourts() {
    const box = $("#courts");
    const groups = freeByCourt(state.day, new Date());
    box.replaceChildren(...groups.map(({ court, times }) =>
      el("div", { class: "court" },
        el("div", { class: "court-head" },
          el("strong", {}, court.name),
          el("span", { class: "price" }, court.duration + " min" + (court.price ? " · " + U.money(court.price) : ""))
        ),
        times.length
          ? el("div", { class: "options times" }, times.map((t) => el("button", {
            class: "opt time", type: "button", "aria-pressed": "false",
            onclick: (e) => {
              state.court = court;
              state.time = t;
              setPressed(box, e.currentTarget);
              const end = U.fromMin(U.toMin(t) + Number(court.duration));
              $("#summary").textContent = court.name + " · " + U.formatDayLong(state.day) + " de " + t + " a " + end + " hs" +
                (court.price ? " · " + U.money(court.price) : "");
              $("#step-form").hidden = false;
              $("#step-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
              $("#name").focus({ preventScroll: true });
            }
          }, t)))
          : el("p", { class: "empty" }, "Sin horarios libres.")
      )
    ));
  }

  function showError(msg) {
    const p = $("#form-error");
    p.textContent = msg;
    p.hidden = !msg;
  }

  $("#booking-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#name").value.trim();
    const phone = $("#phone").value.trim();
    if (name.length < 2) return showError("Escribí tu nombre.");
    if (phone.replace(/\D/g, "").length < 8) return showError("Escribí un número de WhatsApp válido.");
    showError("");

    const btn = $("#submit");
    btn.disabled = true;
    btn.textContent = "Reservando…";
    try {
      await S.createBooking({
        day: state.day, time: state.time, duration: Number(state.court.duration),
        courtId: state.court.id, courtName: state.court.name, name, phone
      });
      showDone(name);
    } catch (err) {
      if (String(err.message).includes("ocupado")) {
        showError("Ese horario se acaba de ocupar. Elegí otro, por favor.");
        await loadBusy();
        renderDays();
        renderCourts();
        $("#step-form").hidden = true;
      } else {
        showError("No se pudo reservar. Probá de nuevo en un momento.");
        console.error(err);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirmar reserva";
    }
  });

  function showDone(name) {
    const s = state.settings;
    const when = U.formatDayLong(state.day) + " a las " + state.time + " hs";
    $("#done-text").textContent = state.court.name + " · " + when;
    const wa = $("#done-wa");
    if (s.whatsapp) {
      wa.href = U.waLink(s.whatsapp,
        "Hola! Soy " + name + ", reservé " + state.court.name + " el " + when + ".", s.countryCode);
      wa.hidden = false;
    } else {
      wa.hidden = true;
    }
    $("#flow").hidden = true;
    $("#done").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $("#again").addEventListener("click", async () => {
    $("#booking-form").reset();
    $("#done").hidden = true;
    $("#flow").hidden = false;
    ["#step-day", "#step-time", "#step-form"].forEach((s) => ($(s).hidden = true));
    state.sport = state.day = state.court = state.time = null;
    await loadBusy();
    renderSports();
  });

  try {
    state.settings = await S.getSettings();
    $("#biz-name").textContent = state.settings.businessName;
    $("#biz-address").textContent = state.settings.address || "Reservá tu cancha online";
    document.title = "Reservas · " + state.settings.businessName;
    $("#demo-banner").hidden = S.isRemote;
    await loadBusy();
    renderSports();
  } catch (err) {
    console.error(err);
    $("#sports").replaceChildren(el("p", { class: "error" }, "No se pudo cargar la agenda. Recargá la página."));
  }
})();
