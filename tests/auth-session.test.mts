import assert from "node:assert/strict";
import test from "node:test";

const transient = new Map<string, string>();
const durable = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    sessionStorage: {
      getItem: (key: string) => transient.get(key) ?? null,
      removeItem: (key: string) => transient.delete(key),
      setItem: (key: string, value: string) => transient.set(key, value),
    },
    localStorage: {
      getItem: (key: string) => durable.get(key) ?? null,
      removeItem: (key: string) => durable.delete(key),
      setItem: (key: string, value: string) => durable.set(key, value),
    },
  },
});

const session = await import("../src/auth/session.ts");

test("login state survives secret-storage reads and rejects another callback", async () => {
  const secrets = new Map<string, string>();
  session.configureSessionStorage({
    getSecret: (id) => secrets.get(id) ?? null,
    setSecret: (id, value) => secrets.set(id, value),
  });

  const state = session.createPendingLoginState();
  assert.match(state, /^[a-f0-9]{64}$/u);
  assert.equal(session.getPendingLoginState(), state);
  assert.equal(session.matchesPendingLoginState(state), true);
  assert.equal(session.matchesPendingLoginState("b".repeat(64)), false);

  assert.equal(session.setSessionToken("bdf_sess_test"), true);
  assert.equal(session.matchesPendingLoginState(state), true);
  await session.markLoginStateCompleted(state);
  session.clearPendingLoginState();
  assert.equal(session.getPendingLoginState(), null);
  assert.equal(session.matchesPendingLoginState(state), false);
  assert.equal(await session.matchesCompletedLoginState(state), true);
  assert.equal(await session.matchesCompletedLoginState("b".repeat(64)), false);

  session.createPendingLoginState();
  assert.equal(await session.matchesCompletedLoginState(state), false);
});

test("completed login marker survives a WebView lifecycle without storing raw state", async () => {
  const state = "c".repeat(64);
  await session.markLoginStateCompleted(state);
  const stored = Array.from(durable.values()).find((value) => value.includes("digest"));
  assert.ok(stored);
  assert.equal(stored.includes(state), false);
  assert.equal(await session.matchesCompletedLoginState(state), true);
});

test("failed secure writes cannot resurrect an older persisted token", () => {
  const secrets = new Map([["bondie-docferry-session-token", "bdf_sess_old"]]);
  session.configureSessionStorage({
    getSecret: (id) => secrets.get(id) ?? null,
    setSecret: () => {
      throw new Error("secure storage unavailable");
    },
  });
  assert.equal(session.getSessionToken(), "bdf_sess_old");
  assert.equal(session.setSessionToken("bdf_sess_new"), false);
  assert.equal(session.getSessionToken(), "bdf_sess_new");

  transient.clear();
  session.configureSessionStorage({
    getSecret: (id) => secrets.get(id) ?? null,
    setSecret: () => {
      throw new Error("secure storage unavailable");
    },
  });
  assert.equal(session.getSessionToken(), null);
});

test("failed login-state clears cannot revive a consumed pending state", () => {
  const secrets = new Map<string, string>();
  let failStateClear = false;
  session.configureSessionStorage({
    getSecret: (id) => secrets.get(id) ?? null,
    setSecret: (id, value) => {
      if (failStateClear && id === "bondie-docferry-login-state" && value === "") {
        throw new Error("secure storage unavailable");
      }
      secrets.set(id, value);
    },
  });
  const state = session.createPendingLoginState();
  failStateClear = true;
  session.clearPendingLoginState();
  transient.clear();
  session.configureSessionStorage({
    getSecret: (id) => secrets.get(id) ?? null,
    setSecret: () => {
      throw new Error("secure storage unavailable");
    },
  });
  assert.equal(session.matchesPendingLoginState(state), false);
});

test("failed transient login-state cleanup cannot revive a consumed state", () => {
  session.configureSessionStorage(null);
  const state = session.createPendingLoginState();
  const originalRemove = window.sessionStorage.removeItem;
  window.sessionStorage.removeItem = () => {
    throw new Error("session storage unavailable");
  };
  try {
    session.clearPendingLoginState();
  } finally {
    window.sessionStorage.removeItem = originalRemove;
  }
  session.configureSessionStorage(null);
  assert.equal(session.matchesPendingLoginState(state), false);
});

test("a successful secure write remains durable when transient cleanup fails", () => {
  const secrets = new Map<string, string>();
  const originalRemove = window.sessionStorage.removeItem;
  window.sessionStorage.removeItem = () => {
    throw new Error("session storage unavailable");
  };
  try {
    session.configureSessionStorage({
      getSecret: (id) => secrets.get(id) ?? null,
      setSecret: (id, value) => secrets.set(id, value),
    });
    assert.equal(session.setSessionToken("bdf_sess_secure"), true);
    assert.equal(secrets.get("bondie-docferry-session-token"), "bdf_sess_secure");
  } finally {
    window.sessionStorage.removeItem = originalRemove;
  }
});

test("failed transient cleanup cannot revive a securely cleared token", () => {
  const secrets = new Map<string, string>();
  session.configureSessionStorage({
    getSecret: (id) => secrets.get(id) ?? null,
    setSecret: (id, value) => secrets.set(id, value),
  });
  assert.equal(session.setSessionToken("bdf_sess_to_clear"), true);
  transient.set("bondie-docferry.session-token", "bdf_sess_to_clear");
  const originalRemove = window.sessionStorage.removeItem;
  window.sessionStorage.removeItem = () => {
    throw new Error("session storage unavailable");
  };
  try {
    session.clearSessionToken();
  } finally {
    window.sessionStorage.removeItem = originalRemove;
  }
  session.configureSessionStorage({
    getSecret: (id) => secrets.get(id) ?? null,
    setSecret: (id, value) => secrets.set(id, value),
  });
  assert.equal(session.getSessionToken(), null);
});

test("failed transient overwrite cannot outrank a newly secured token", () => {
  const secrets = new Map<string, string>();
  transient.set("bondie-docferry.session-token", "bdf_sess_old_transient");
  session.configureSessionStorage({
    getSecret: (id) => secrets.get(id) ?? null,
    setSecret: (id, value) => secrets.set(id, value),
  });
  const originalRemove = window.sessionStorage.removeItem;
  const originalSet = window.sessionStorage.setItem;
  window.sessionStorage.removeItem = () => {
    throw new Error("session storage unavailable");
  };
  window.sessionStorage.setItem = () => {
    throw new Error("session storage unavailable");
  };
  try {
    assert.equal(session.setSessionToken("bdf_sess_new_secure"), true);
  } finally {
    window.sessionStorage.removeItem = originalRemove;
    window.sessionStorage.setItem = originalSet;
  }
  session.configureSessionStorage({
    getSecret: (id) => secrets.get(id) ?? null,
    setSecret: (id, value) => secrets.set(id, value),
  });
  assert.equal(session.getSessionToken(), "bdf_sess_new_secure");
});

test("normalizers reject malformed callback values", () => {
  assert.equal(session.normalizeLoginState("too-short"), "");
  assert.equal(session.normalizeLoginState("a".repeat(64)), "a".repeat(64));
  assert.equal(session.normalizeLoginCode("  bdf_login_example  "), "bdf_login_example");
});
