import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  DEFAULT_ENV_FILE,
  DEFAULT_STATE_FILE,
  EXPECTED_ENV_KEYS,
  parseStrictEnv,
  runNeonUatCommand,
  sanitizeChildEnvironment,
  validateEnvFile,
} from "./neon-uat-accounts.mjs";
import { STAGING_REF, STAGING_URL } from "./neon-rls-smoke.mjs";

const ROOT = "/repo";
const ENV_FILE = join(ROOT, DEFAULT_ENV_FILE);
const STATE_FILE = join(ROOT, DEFAULT_STATE_FILE);
const ANON_KEY = "fixture-anon-key.SENSITIVE";
const SERVICE_KEY = "fixture-service-role-key.SENSITIVE";
const PAT = "fixture-pat.SENSITIVE";
const UID = 501;

const validEnvContent = ({ url = STAGING_URL } = {}) =>
  [
    `EXPO_PUBLIC_SUPABASE_URL=${url}`,
    `EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`,
    `STAGING_SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}`,
    "",
  ].join("\n");

function createMemoryFs() {
  const entries = new Map();
  const history = [];
  const normalize = (path) => resolve(ROOT, path);

  const ensureDirectories = (path) => {
    let current = dirname(path);
    while (current !== dirname(current)) {
      if (!entries.has(current)) {
        entries.set(current, {
          type: "directory",
          mode: 0o700,
          uid: UID,
          mtimeMs: 0,
        });
      }
      if (current === ROOT) break;
      current = dirname(current);
    }
  };

  const addFile = (path, content, options = {}) => {
    const absolute = normalize(path);
    ensureDirectories(absolute);
    entries.set(absolute, {
      type: options.type ?? "file",
      content,
      mode: options.mode ?? 0o600,
      uid: options.uid ?? UID,
      mtimeMs: options.mtimeMs ?? 0,
    });
  };

  const get = (path) => {
    const absolute = normalize(path);
    const entry = entries.get(absolute);
    if (!entry) {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    }
    return { absolute, entry };
  };

  const stats = (entry) => ({
    mode: entry.mode,
    uid: entry.uid,
    mtimeMs: entry.mtimeMs,
    isFile: () => entry.type === "file",
    isDirectory: () => entry.type === "directory",
    isSymbolicLink: () => entry.type === "symlink",
  });

  return {
    addFile,
    entries,
    history,
    existsSync(path) {
      return entries.has(normalize(path));
    },
    lstatSync(path) {
      return stats(get(path).entry);
    },
    statSync(path) {
      return stats(get(path).entry);
    },
    readFileSync(path) {
      return get(path).entry.content;
    },
    writeFileSync(path, content, options = {}) {
      const absolute = normalize(path);
      if (options.flag === "wx" && entries.has(absolute)) {
        const error = new Error("EEXIST");
        error.code = "EEXIST";
        throw error;
      }
      ensureDirectories(absolute);
      entries.set(absolute, {
        type: "file",
        content,
        mode: options.mode ?? 0o666,
        uid: UID,
        mtimeMs: options.mtimeMs ?? 0,
      });
      history.push({ action: "write", path: absolute, mode: options.mode });
    },
    chmodSync(path, mode) {
      const { absolute, entry } = get(path);
      entry.mode = mode;
      history.push({ action: "chmod", path: absolute, mode });
    },
    renameSync(from, to) {
      const source = get(from);
      const target = normalize(to);
      entries.set(target, source.entry);
      entries.delete(source.absolute);
      history.push({ action: "rename", from: source.absolute, to: target });
    },
    unlinkSync(path) {
      const absolute = normalize(path);
      if (!entries.delete(absolute)) {
        const error = new Error("ENOENT");
        error.code = "ENOENT";
        throw error;
      }
      history.push({ action: "unlink", path: absolute });
    },
    mkdirSync(path, options = {}) {
      const absolute = normalize(path);
      ensureDirectories(absolute);
      if (!entries.has(absolute)) {
        entries.set(absolute, {
          type: "directory",
          mode: options.mode ?? 0o777,
          uid: UID,
          mtimeMs: 0,
        });
      }
    },
    readdirSync(path, options = {}) {
      const absolute = normalize(path);
      get(absolute);
      const names = new Set();
      for (const candidate of entries.keys()) {
        if (candidate === absolute || dirname(candidate) !== absolute) continue;
        names.add(candidate.slice(absolute.length + 1));
      }
      return [...names].sort().map((name) => {
        if (!options.withFileTypes) return name;
        const entry = entries.get(join(absolute, name));
        return {
          name,
          isDirectory: () => entry.type === "directory",
          isFile: () => entry.type === "file",
        };
      });
    },
  };
}

function createAdminHarness({ failCreateAt, failDeleteIds = [] } = {}) {
  const users = new Map();
  const createCalls = [];
  const deleteCalls = [];
  const getCalls = [];
  const factoryCalls = [];

  const admin = {
    auth: {
      admin: {
        async createUser(input) {
          createCalls.push(input);
          if (createCalls.length === failCreateAt) {
            return {
              data: null,
              error: { code: "XX000", message: SERVICE_KEY },
            };
          }
          const label = createCalls.length === 1 ? "a" : "b";
          const id = `uat-${label}-1234567890`;
          users.set(id, { id, email: input.email });
          return { data: { user: { id } }, error: null };
        },
        async deleteUser(id) {
          deleteCalls.push(id);
          if (failDeleteIds.includes(id)) {
            return { error: { code: "XX000", message: SERVICE_KEY } };
          }
          if (!users.has(id)) {
            return {
              error: {
                code: "user_not_found",
                status: 404,
                message: SERVICE_KEY,
              },
            };
          }
          users.delete(id);
          return { error: null };
        },
        async getUserById(id) {
          getCalls.push(id);
          if (!users.has(id)) {
            return {
              data: { user: null },
              error: {
                code: "user_not_found",
                status: 404,
                message: SERVICE_KEY,
              },
            };
          }
          return { data: { user: users.get(id) }, error: null };
        },
      },
    },
  };

  return {
    admin,
    users,
    createCalls,
    deleteCalls,
    getCalls,
    factoryCalls,
    createAdminClient(input) {
      factoryCalls.push(input);
      return admin;
    },
  };
}

function createDependencies(options = {}) {
  const fs = options.fs ?? createMemoryFs();
  if (options.seedEnv !== false) {
    fs.addFile(ENV_FILE, options.envContent ?? validEnvContent(), {
      mode: options.envMode ?? 0o600,
      uid: options.envUid ?? UID,
      type: options.envType ?? "file",
    });
  }
  const adminHarness = options.adminHarness ?? createAdminHarness(options);
  const processCalls = [];
  const logs = [];
  let ignored = options.ignored ?? true;

  const dependencies = {
    fs,
    cwd: ROOT,
    uid: () => UID,
    pid: 4321,
    clock: { now: () => 1_000 },
    randomBytes: (size) =>
      Buffer.alloc(size, 23 + adminHarness.createCalls.length),
    baseEnv: {
      PATH: "/usr/bin",
      HOME: "/home/test",
      SUPABASE_ACCESS_TOKEN: PAT,
      STAGING_SUPABASE_URL: "fixture-staging-url.SENSITIVE",
      STAGING_SUPABASE_ANON_KEY: "fixture-staging-anon.SENSITIVE",
      STAGING_SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      UAT_A_EMAIL: "account-a@secret.test",
      UAT_A_PASSWORD: "Password-A.SENSITIVE",
      UAT_B_PASSWORD: "Password-B.SENSITIVE",
    },
    logger: (event) => logs.push(event),
    createAdminClient: adminHarness.createAdminClient,
    async runProcess(command, args, processOptions) {
      const call = { command, args, options: processOptions };
      processCalls.push(call);
      if (command === "git")
        return { code: ignored ? 0 : 1, stdout: "", stderr: "" };
      if (options.onProcess)
        return options.onProcess(call, { fs, adminHarness });
      return { code: 0, stdout: SERVICE_KEY, stderr: PAT };
    },
  };

  return {
    fs,
    adminHarness,
    dependencies,
    logs,
    processCalls,
    setIgnored(value) {
      ignored = value;
    },
  };
}

function stateFixture() {
  return {
    ref: STAGING_REF,
    accounts: {
      A: {
        id: "uat-a-1234567890",
        email: "account-a@secret.test",
        password: "Password-A.SENSITIVE",
      },
      B: {
        id: "uat-b-1234567890",
        email: "account-b@secret.test",
        password: "Password-B.SENSITIVE",
      },
    },
  };
}

function seedState(harness, state = stateFixture()) {
  harness.fs.addFile(STATE_FILE, JSON.stringify(state), {
    mode: 0o600,
    uid: UID,
  });
  return state;
}

const run = (harness, command, ...args) =>
  runNeonUatCommand(
    [
      command,
      "--env-file",
      DEFAULT_ENV_FILE,
      "--state-file",
      DEFAULT_STATE_FILE,
      ...args,
    ],
    harness.dependencies,
  );

test("strict env parser accepts exactly the three declared keys without shell expansion", () => {
  assert.deepEqual(
    Object.keys(parseStrictEnv(validEnvContent())).sort(),
    [...EXPECTED_ENV_KEYS].sort(),
  );

  for (const invalid of [
    validEnvContent().replace(
      `\nSTAGING_SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}`,
      "",
    ),
    `${validEnvContent()}EXTRA=value\n`,
    `${validEnvContent()}EXPO_PUBLIC_SUPABASE_URL=${STAGING_URL}\n`,
    validEnvContent().replace(ANON_KEY, ""),
    validEnvContent().replace(ANON_KEY, "$HOME"),
    validEnvContent().replace(ANON_KEY, '"quoted"'),
    validEnvContent().replace(
      "EXPO_PUBLIC_SUPABASE_URL=",
      " export EXPO_PUBLIC_SUPABASE_URL=",
    ),
  ]) {
    assert.throws(() => parseStrictEnv(invalid), /env invalido/);
  }
});

test("validate rejects missing, symlinked, insecure, wrong-owner, or Git-trackable env files", async () => {
  const cases = [
    { seedEnv: false },
    { envType: "symlink" },
    { envMode: 0o644 },
    { envUid: UID + 1 },
    { ignored: false },
  ];

  for (const options of cases) {
    const harness = createDependencies(options);
    await assert.rejects(
      validateEnvFile(DEFAULT_ENV_FILE, harness.dependencies),
      /env local recusado/,
    );
    assert.equal(harness.adminHarness.factoryCalls.length, 0);
    assert.equal(
      harness.processCalls.some((call) => call.command === "npm"),
      false,
    );
  }
});

test("validate accepts only the exact canonical staging URL and fails before side effects", async () => {
  const invalidUrls = [
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
  ];

  for (const url of invalidUrls) {
    const harness = createDependencies({
      envContent: validEnvContent({ url }),
    });
    await assert.rejects(
      run(harness, "provision"),
      /env (invalido|local recusado)/,
    );
    assert.equal(harness.adminHarness.factoryCalls.length, 0);
    assert.equal(
      harness.processCalls.some((call) => call.command === "npm"),
      false,
    );
  }

  const harness = createDependencies();
  const validated = await validateEnvFile(
    DEFAULT_ENV_FILE,
    harness.dependencies,
  );
  assert.deepEqual(validated, {
    url: STAGING_URL,
    anonKey: ANON_KEY,
    serviceRoleKey: SERVICE_KEY,
    ref: STAGING_REF,
  });
});

test("provision creates exactly A and B confirmed and atomically writes chmod 600 state", async () => {
  const harness = createDependencies();

  const result = await run(harness, "provision");

  assert.deepEqual(result, { command: "provision", accounts: 2 });
  assert.equal(harness.adminHarness.createCalls.length, 2);
  assert.ok(
    harness.adminHarness.createCalls.every(
      (call) => call.email_confirm === true,
    ),
  );
  assert.ok(
    harness.adminHarness.createCalls.every((call) =>
      /[A-Z]/.test(call.password),
    ),
  );
  assert.ok(
    harness.adminHarness.createCalls.every((call) =>
      /[a-z]/.test(call.password),
    ),
  );
  assert.ok(
    harness.adminHarness.createCalls.every((call) => /\d/.test(call.password)),
  );
  assert.ok(
    harness.adminHarness.createCalls.every((call) =>
      /[^A-Za-z0-9]/.test(call.password),
    ),
  );
  const state = JSON.parse(harness.fs.readFileSync(STATE_FILE, "utf8"));
  assert.deepEqual(Object.keys(state.accounts), ["A", "B"]);
  assert.equal(state.ref, STAGING_REF);
  assert.equal(harness.fs.lstatSync(STATE_FILE).mode & 0o777, 0o600);
  assert.ok(
    harness.fs.history.some(
      (entry) => entry.action === "rename" && entry.to === STATE_FILE,
    ),
  );
  assert.ok(
    harness.fs.history.some(
      (entry) =>
        entry.action === "write" && entry.path.startsWith(`${STATE_FILE}.tmp-`),
    ),
  );

  const output = JSON.stringify(harness.logs);
  for (const forbidden of [ANON_KEY, SERVICE_KEY, PAT])
    assert.equal(output.includes(forbidden), false);
  for (const account of Object.values(state.accounts)) {
    assert.equal(output.includes(account.email), false);
    assert.equal(output.includes(account.password), false);
  }
});

test("partial provision failure removes every created account without leaving state", async () => {
  const harness = createDependencies({ failCreateAt: 2 });

  await assert.rejects(run(harness, "provision"), /provision falhou/);

  assert.deepEqual(harness.adminHarness.deleteCalls, ["uat-a-1234567890"]);
  assert.equal(harness.adminHarness.users.size, 0);
  assert.equal(harness.fs.existsSync(STATE_FILE), false);
});

test("partial provision preserves secure remediation state when rollback deletion fails", async () => {
  const harness = createDependencies({
    failCreateAt: 2,
    failDeleteIds: ["uat-a-1234567890"],
  });

  await assert.rejects(run(harness, "provision"), (error) => {
    assert.match(error.message, /rollback falhou/);
    assert.match(error.message, /uat-a-12/);
    assert.doesNotMatch(error.message, /uat-a-1234567890/);
    assert.doesNotMatch(error.message, new RegExp(SERVICE_KEY, "u"));
    return true;
  });

  const state = JSON.parse(harness.fs.readFileSync(STATE_FILE, "utf8"));
  assert.deepEqual(Object.keys(state.accounts), ["A"]);
  assert.equal(harness.fs.lstatSync(STATE_FILE).mode & 0o777, 0o600);
});

test("cleanup is idempotent, attempts and verifies both ids, then removes state", async () => {
  const harness = createDependencies();
  seedState(harness);

  const result = await run(harness, "cleanup");

  assert.deepEqual(result, { command: "cleanup", accounts: 0 });
  assert.deepEqual(harness.adminHarness.deleteCalls, [
    "uat-a-1234567890",
    "uat-b-1234567890",
  ]);
  assert.deepEqual(harness.adminHarness.getCalls, [
    "uat-a-1234567890",
    "uat-b-1234567890",
  ]);
  assert.equal(harness.fs.existsSync(STATE_FILE), false);
});

test("cleanup attempts both accounts and preserves state when absence cannot be proved", async () => {
  const harness = createDependencies({ failDeleteIds: ["uat-a-1234567890"] });
  const state = seedState(harness);
  for (const account of Object.values(state.accounts)) {
    harness.adminHarness.users.set(account.id, {
      id: account.id,
      email: account.email,
    });
  }

  await assert.rejects(run(harness, "cleanup"), /cleanup falhou.*uat-a-12/);

  assert.deepEqual(harness.adminHarness.deleteCalls, [
    "uat-a-1234567890",
    "uat-b-1234567890",
  ]);
  assert.deepEqual(harness.adminHarness.getCalls, [
    "uat-a-1234567890",
    "uat-b-1234567890",
  ]);
  assert.equal(harness.fs.existsSync(STATE_FILE), true);
  assert.equal(JSON.stringify(harness.logs).includes(SERVICE_KEY), false);
});

test("web-build uses spawn without shell, sanitized env, and accepts a new staging-only bundle", async () => {
  const harness = createDependencies({
    onProcess(call, { fs }) {
      if (call.command === "npm") {
        fs.addFile(
          join(ROOT, "dist", "_expo", "static", "js", "app.js"),
          `url=${STAGING_URL}`,
          {
            mode: 0o644,
            uid: UID,
            mtimeMs: 1_001,
          },
        );
      }
      return { code: 0, stdout: SERVICE_KEY, stderr: PAT };
    },
  });

  const result = await run(harness, "web-build");

  assert.deepEqual(result, { command: "web-build", bundles: 1 });
  const call = harness.processCalls.find(
    (candidate) => candidate.command === "npm",
  );
  assert.deepEqual(call.args, ["run", "build:web"]);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.env.EXPO_PUBLIC_SUPABASE_URL, STAGING_URL);
  assert.equal(call.options.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, ANON_KEY);
  assert.equal(call.options.env.FORCA_EXPECT_SUPABASE_REF, STAGING_REF);
  for (const forbiddenKey of [
    "SUPABASE_ACCESS_TOKEN",
    "STAGING_SUPABASE_URL",
    "STAGING_SUPABASE_ANON_KEY",
    "STAGING_SUPABASE_SERVICE_ROLE_KEY",
    "UAT_A_EMAIL",
    "UAT_A_PASSWORD",
    "UAT_B_PASSWORD",
  ]) {
    assert.equal(forbiddenKey in call.options.env, false);
  }
  const output = JSON.stringify(harness.logs);
  assert.equal(output.includes(ANON_KEY), false);
  assert.equal(output.includes(SERVICE_KEY), false);
  assert.equal(output.includes(PAT), false);
});

test("web-build rejects missing staging, production, localhost, and stale-only bundles", async () => {
  const contents = [
    "no supabase ref here",
    `${STAGING_URL} https://zanqygwsgxkyjiuhrzju.supabase.co`,
    `${STAGING_URL} http://localhost:54321`,
    `${STAGING_URL} ${SERVICE_KEY}`,
  ];

  for (const content of contents) {
    const harness = createDependencies({
      onProcess(call, { fs }) {
        if (call.command === "npm") {
          fs.addFile(join(ROOT, "dist", "app.js"), content, {
            mtimeMs: 1_001,
            mode: 0o644,
          });
        }
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    await assert.rejects(run(harness, "web-build"), /bundle web recusado/);
  }

  const stale = createDependencies();
  stale.fs.addFile(join(ROOT, "dist", "app.js"), STAGING_URL, {
    mtimeMs: 999,
    mode: 0o644,
  });
  await assert.rejects(run(stale, "web-build"), /bundle web recusado/);
});

test("subprocess exceptions are replaced by a sanitized command failure", async () => {
  const harness = createDependencies({
    onProcess(call) {
      if (call.command === "npm")
        throw new Error(`adapter leaked ${SERVICE_KEY}`);
      return { code: 0, stdout: "", stderr: "" };
    },
  });

  await assert.rejects(run(harness, "web-build"), (error) => {
    assert.equal(error.message, "web-build falhou");
    assert.equal(error.message.includes(SERVICE_KEY), false);
    return true;
  });
});

test("signed-install passes only the UDID in argv and public staging values in child env", async () => {
  const harness = createDependencies();

  const result = await run(
    harness,
    "signed-install",
    "--udid",
    "00008110-001234567890001E",
  );

  assert.deepEqual(result, { command: "signed-install" });
  const call = harness.processCalls.find(
    (candidate) => candidate.command === "npm",
  );
  assert.deepEqual(call.args, [
    "run",
    "resign",
    "--",
    "00008110-001234567890001E",
  ]);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.env.EXPO_PUBLIC_SUPABASE_URL, STAGING_URL);
  assert.equal(call.options.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, ANON_KEY);
  assert.equal(call.options.env.FORCA_EXPECT_SUPABASE_REF, STAGING_REF);
  assert.equal(JSON.stringify(call.args).includes(SERVICE_KEY), false);
  assert.equal(JSON.stringify(call.options.env).includes(SERVICE_KEY), false);
});

test("copy-field sends the selected value only through pbcopy stdin and logs metadata only", async () => {
  const harness = createDependencies();
  const state = seedState(harness);

  const result = await run(
    harness,
    "copy-field",
    "--account",
    "A",
    "--field",
    "password",
  );

  assert.deepEqual(result, {
    command: "copy-field",
    account: "A",
    field: "password",
  });
  const call = harness.processCalls.find(
    (candidate) => candidate.command === "pbcopy",
  );
  assert.deepEqual(call.args, []);
  assert.equal(call.options.stdin, state.accounts.A.password);
  assert.equal(call.options.shell, false);
  assert.equal(
    JSON.stringify(harness.logs).includes(state.accounts.A.password),
    false,
  );

  await assert.rejects(
    run(harness, "copy-field", "--account", "C", "--field", "password"),
    /argumentos invalidos/,
  );
  await assert.rejects(
    run(harness, "copy-field", "--account", "A", "--field", "token"),
    /argumentos invalidos/,
  );
});

test("child environment sanitizer removes privileged and UAT material without mutating base env", () => {
  const base = {
    PATH: "/usr/bin",
    STAGING_SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    SUPABASE_ACCESS_TOKEN: PAT,
    UAT_B_PASSWORD: "Password-B.SENSITIVE",
  };

  const child = sanitizeChildEnvironment(base, {
    url: STAGING_URL,
    anonKey: ANON_KEY,
  });

  assert.deepEqual(base, {
    PATH: "/usr/bin",
    STAGING_SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    SUPABASE_ACCESS_TOKEN: PAT,
    UAT_B_PASSWORD: "Password-B.SENSITIVE",
  });
  assert.equal(child.PATH, "/usr/bin");
  assert.equal(child.EXPO_PUBLIC_SUPABASE_URL, STAGING_URL);
  assert.equal(child.EXPO_PUBLIC_SUPABASE_ANON_KEY, ANON_KEY);
  assert.equal(child.FORCA_EXPECT_SUPABASE_REF, STAGING_REF);
  assert.equal(JSON.stringify(child).includes(SERVICE_KEY), false);
  assert.equal(JSON.stringify(child).includes(PAT), false);
  assert.equal(JSON.stringify(child).includes("Password-B.SENSITIVE"), false);
});
