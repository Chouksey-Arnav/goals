// Today's events and to-dos from the calendar app, for the morning email.
// Never blocks an email: any failure (not configured, slow, down) is null
// and the email goes out without the calendar section.

export async function fetchAgenda(cfg, day, { timeoutMs = 5000 } = {}) {
  if (!cfg.calendarUrl || !cfg.calendarSecret) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.calendarUrl}/api/agenda?day=${encodeURIComponent(day)}`, {
      headers: { Authorization: `Bearer ${cfg.calendarSecret}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`Calendar agenda: HTTP ${res.status}`);
      return null;
    }
    const a = await res.json();
    return a && Array.isArray(a.events) ? a : null;
  } catch (e) {
    console.warn("Calendar agenda unavailable:", e.message);
    return null;
  } finally {
    clearTimeout(t);
  }
}
