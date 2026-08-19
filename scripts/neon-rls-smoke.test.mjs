import assert from "node:assert/strict";
import test from "node:test";

import {
  STAGING_REF,
  STAGING_URL,
  resolveSmokeEnvironment,
  runNeonRlsSmoke,
  validateStagingUrl,
} from "./neon-rls-smoke.mjs";

const ANON_KEY = "fixture-anon-key.SENSITIVE";
const SERVICE_KEY = "fixture-service-role-key.SENSITIVE";
const JWT = "fixture-jwt.SENSITIVE";

function createQuery(client, profiles, operations, failure) {
  let action = "select";
  let values = null;
  let targetId = null;

  const query = {
    select() {
      return query;
    },
    update(nextValues) {
      action = "update";
      values = nextValues;
      return query;
    },
    eq(column, value) {
      assert.equal(column, "id");
      targetId = value;
      return query;
    },
    async maybeSingle() {
      operations.push({ action, actorId: client.userId, targetId, values });
      if (failure?.({ action, actorId: client.userId, targetId, values })) {
        return { data: null, error: { code: "XX000", message: SERVICE_KEY } };
      }
      if (!client.userId || client.userId !== targetId) {
        return { data: null, error: null };
      }
      const current = profiles.get(targetId);
      if (!current) return { data: null, error: null };
      if (action === "update") Object.assign(current, values);
      return { data: { ...current }, error: null };
    },
  };
  return query;
}

function createHarness({
  initialB = "yellow",
  failure,
  cleanupFailures = [],
} = {}) {
  const users = new Map();
  const profiles = new Map();
  const createCalls = [];
  const deleteCalls = [];
  const operations = [];
  const factoryCalls = [];
  const logs = [];
  let nextUser = 0;

  const admin = {
    auth: {
      admin: {
        async createUser(input) {
          createCalls.push(input);
          nextUser += 1;
          const account = nextUser === 1 ? "a" : "b";
          const id = `user-${account}-1234567890`;
          users.set(input.email, { id, password: input.password });
          profiles.set(id, {
            id,
            neon_color: account === "a" ? "yellow" : initialB,
          });
          return { data: { user: { id } }, error: null };
        },
        async deleteUser(id) {
          deleteCalls.push(id);
          if (cleanupFailures.includes(id)) {
            return { error: { code: "XX000", message: SERVICE_KEY } };
          }
          for (const [email, user] of users) {
            if (user.id === id) users.delete(email);
          }
          profiles.delete(id);
          return { error: null };
        },
      },
    },
    from() {
      throw new Error("admin client must never access profiles");
    },
  };

  function clientFactory(url, key, options) {
    factoryCalls.push({ url, key, options });
    if (key === SERVICE_KEY) return admin;
    assert.equal(key, ANON_KEY);
    const client = {
      userId: null,
      auth: {
        async signInWithPassword({ email, password }) {
          const user = users.get(email);
          if (!user || user.password !== password) {
            return { data: null, error: { message: JWT } };
          }
          client.userId = user.id;
          return { data: { session: { access_token: JWT } }, error: null };
        },
        async signOut() {
          client.userId = null;
          return { error: null };
        },
      },
      from(table) {
        assert.equal(table, "profiles");
        return createQuery(client, profiles, operations, failure);
      },
      async removeAllChannels() {},
    };
    return client;
  }

  return {
    dependencies: {
      clientFactory,
      logger: (event) => logs.push(event),
      clock: { now: () => 1_700_000_000_000 },
      randomBytes: (size) => Buffer.alloc(size, nextUser + 17),
    },
    createCalls,
    deleteCalls,
    factoryCalls,
    logs,
    operations,
    profiles,
  };
}

function run(harness) {
  return runNeonRlsSmoke(
    {
      url: STAGING_URL,
      anonKey: ANON_KEY,
      serviceRoleKey: SERVICE_KEY,
    },
    harness.dependencies,
  );
}

test("provisions two confirmed users and proves own-row updates with anon-key clients", async () => {
  const harness = createHarness();

  const result = await run(harness);

  assert.deepEqual(result, { accounts: 2, assertions: 10 });
  assert.equal(harness.createCalls.length, 2);
  assert.ok(harness.createCalls.every((call) => call.email_confirm === true));
  assert.ok(harness.createCalls.every((call) => /[A-Z]/.test(call.password)));
  assert.ok(harness.createCalls.every((call) => /[a-z]/.test(call.password)));
  assert.ok(harness.createCalls.every((call) => /\d/.test(call.password)));
  assert.ok(
    harness.createCalls.every((call) => /[^A-Za-z0-9]/.test(call.password)),
  );
  assert.equal(harness.deleteCalls.length, 2);
  assert.equal(harness.profiles.size, 0);
  assert.equal(
    harness.factoryCalls.filter((call) => call.key === SERVICE_KEY).length,
    1,
  );
  assert.equal(
    harness.factoryCalls.filter((call) => call.key === ANON_KEY).length,
    3,
  );
});

test("cross-account and anonymous operations see or update no protected row", async () => {
  const harness = createHarness();

  await run(harness);

  const cross = harness.operations.filter(
    (operation) =>
      operation.actorId && operation.actorId !== operation.targetId,
  );
  const anonymous = harness.operations.filter(
    (operation) => operation.actorId === null,
  );
  assert.deepEqual(
    cross.map(({ action }) => action),
    ["select", "update"],
  );
  assert.equal(anonymous.filter(({ action }) => action === "select").length, 2);
  assert.equal(anonymous.filter(({ action }) => action === "update").length, 2);
});

test("an intermediate assertion failure still deletes both users", async () => {
  const harness = createHarness({ initialB: "red" });

  await assert.rejects(run(harness), /smoke RLS falhou/);

  assert.equal(harness.deleteCalls.length, 2);
  assert.equal(harness.profiles.size, 0);
});

test("cleanup failure is red, attempts both deletes, and reports truncated ids only", async () => {
  const harness = createHarness({ cleanupFailures: ["user-a-1234567890"] });

  await assert.rejects(run(harness), (error) => {
    assert.match(error.message, /cleanup falhou/);
    assert.match(error.message, /user-a-1/);
    assert.doesNotMatch(error.message, /user-a-1234567890/);
    assert.doesNotMatch(error.message, new RegExp(SERVICE_KEY, "u"));
    return true;
  });

  assert.deepEqual(harness.deleteCalls, [
    "user-a-1234567890",
    "user-b-1234567890",
  ]);
});

test("logs contain only step metadata and never credentials, JWTs, full emails, or full URL", async () => {
  const harness = createHarness();

  await run(harness);

  const output = JSON.stringify(harness.logs);
  for (const forbidden of [ANON_KEY, SERVICE_KEY, JWT, STAGING_URL]) {
    assert.equal(output.includes(forbidden), false);
  }
  for (const call of harness.createCalls) {
    assert.equal(output.includes(call.email), false);
    assert.equal(output.includes(call.password), false);
  }
  assert.ok(harness.logs.every((event) => typeof event.step === "string"));
});

test("environment validation accepts only the canonical HTTPS staging URL before client creation", () => {
  assert.equal(validateStagingUrl(STAGING_URL), STAGING_URL);
  assert.equal(STAGING_REF, "mjdjtiujhwklchalquhc");

  for (const invalid of [
    undefined,
    "",
    "http://mjdjtiujhwklchalquhc.supabase.co",
    "https://zanqygwsgxkyjiuhrzju.supabase.co",
    "http://localhost:54321",
    "https://mjdjtiujhwklchalquhc.supabase.co.example.com",
    "https://user@mjdjtiujhwklchalquhc.supabase.co",
    "https://mjdjtiujhwklchalquhc.supabase.co:443",
    "https://mjdjtiujhwklchalquhc.supabase.co/rest",
    "https://mjdjtiujhwklchalquhc.supabase.co?x=1",
    "https://mjdjtiujhwklchalquhc.supabase.co#x",
  ]) {
    assert.throws(() => validateStagingUrl(invalid), /staging canonico/);
  }

  assert.throws(
    () =>
      resolveSmokeEnvironment({
        STAGING_SUPABASE_URL: STAGING_URL,
        STAGING_SUPABASE_ANON_KEY: ANON_KEY,
      }),
    /variaveis obrigatorias ausentes/,
  );
});
