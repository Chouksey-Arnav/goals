import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh, mergeStates } from "../js/state.js";
import { adoptSharedSession, AUTH_KEY } from "../js/sync.js";
import { SUPABASE_URL } from "../js/config.js";

const OLD = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

test("one sign-in: Goals moves its old session to the calendar's key, never copies it", () => {
  const a = store({ [OLD]: "goals-session" });
  adoptSharedSession(a);
  assert.equal(a.getItem(AUTH_KEY), "goals-session");
  assert.equal(a.getItem(OLD), null, "moved, so one refresh token has one owner");
  const b = store({ [OLD]: "goals-session", [AUTH_KEY]: "calendar-session" });
  adoptSharedSession(b);
  assert.equal(b.getItem(AUTH_KEY), "calendar-session", "the calendar's session wins");
  assert.equal(b.getItem(OLD), null);
  const c = store({ [AUTH_KEY]: "calendar-session" });
  adoptSharedSession(c);
  assert.equal(c.getItem(AUTH_KEY), "calendar-session", "nothing to move: untouched");
  adoptSharedSession({ getItem: () => { throw new Error("blocked"); } }); // private mode: no throw
});

test("first sync of a new device: one tick there can't wipe the synced record", () => {
  const remote = fresh();
  remote.completed["krohn-77"] = "2026-10-10";
  remote.completed["krohn-78"] = "2026-10-11";
  remote.habits = [{ id: "h1", name: "Read", created: "2026-10-01" }];
  remote.habitLog = { "2026-10-11": { h1: "full" } };
  remote.notes = { "krohn-77": { text: "remote note", at: 1 } };
  remote.settings.weekdayMin = 120;
  remote.updatedAt = 100;
  const local = fresh();
  local.completed["krohn-79"] = "2026-10-15";
  local.completed["krohn-78"] = "2026-10-15"; // conflict: the synced copy wins
  local.habits = [{ id: "h2", name: "Run", created: "2026-10-15" }];
  local.habitLog = { "2026-10-11": { h2: "min" }, "2026-10-15": { h2: "full" } };
  local.dayLog = { "2026-10-15": { closed: true } };
  local.settings.weekdayMin = 30;
  local.updatedAt = 200; // newer: before the merge, this copy replaced everything
  const m = mergeStates(remote, local);
  assert.equal(m.completed["krohn-77"], "2026-10-10");
  assert.equal(m.completed["krohn-78"], "2026-10-11");
  assert.equal(m.completed["krohn-79"], "2026-10-15");
  assert.deepEqual(m.habits.map((h) => h.id), ["h1", "h2"]);
  assert.deepEqual(m.habitLog["2026-10-11"], { h1: "full", h2: "min" });
  assert.deepEqual(m.habitLog["2026-10-15"], { h2: "full" });
  assert.equal(m.notes["krohn-77"].text, "remote note");
  assert.equal(m.dayLog["2026-10-15"].closed, true);
  assert.equal(m.settings.weekdayMin, 120, "settings come from the synced copy");
  assert.equal(remote.completed["krohn-79"], undefined, "inputs untouched");
});
