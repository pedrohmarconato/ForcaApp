import { spawn } from "node:child_process";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import * as nodeFs from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  STAGING_REF,
  STAGING_URL,
  validateStagingUrl,
} from "./neon-rls-smoke.mjs";

export const DEFAULT_ENV_FILE = ".env.staging-uat.local";
export const DEFAULT_STATE_FILE = ".tmp/neon-phase18-uat.json";
export const EXPECTED_ENV_KEYS = Object.freeze([
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "STAGING_SUPABASE_SERVICE_ROLE_KEY",
]);

const EXPECTED_ENV_KEY_SET = new Set(EXPECTED_ENV_KEYS);
const COMMANDS = new Set([
  "validate",
  "provision",
  "copy-field",
  "web-build",
  "signed-install",
  "cleanup",
]);
const FLAGS = new Set([
  "--env-file",
  "--state-file",
  "--account",
  "--field",
  "--udid",
]);

const fail = (message) => {
  throw new Error(message);
};

export function parseStrictEnv(content) {
  if (typeof content !== "string") fail("env invalido");
  const parsed = {};
  for (const line of content.split(/\r?\n/u)) {
    if (line === "" || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.+)$/u.exec(line);
    if (!match) fail("env invalido");
    const [, key, value] = match;
    if (
      !EXPECTED_ENV_KEY_SET.has(key) ||
      Object.hasOwn(parsed, key) ||
      value.trim() !== value ||
      /[$`'"\\]/u.test(value)
    ) {
      fail("env invalido");
    }
    parsed[key] = value;
  }
  if (EXPECTED_ENV_KEYS.some((key) => !Object.hasOwn(parsed, key)))
    fail("env invalido");
  return parsed;
}

function isNotFound(error) {
  return error?.status === 404 || error?.code === "user_not_found";
}

function truncateId(id) {
  return `${String(id).slice(0, 8)}...`;
}

function sanitizeBaseEnvironment(baseEnv) {
  const child = {};
  for (const [key, value] of Object.entries(baseEnv ?? {})) {
    if (
      /SERVICE_ROLE/iu.test(key) ||
      key === "SUPABASE_ACCESS_TOKEN" ||
      /^STAGING_SUPABASE_/u.test(key) ||
      /UAT/iu.test(key)
    ) {
      continue;
    }
    child[key] = value;
  }
  return child;
}

export function sanitizeChildEnvironment(baseEnv, config) {
  return {
    ...sanitizeBaseEnvironment(baseEnv),
    EXPO_PUBLIC_SUPABASE_URL: config.url,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
    FORCA_EXPECT_SUPABASE_REF: STAGING_REF,
  };
}

function defaultCreateAdminClient({ url, serviceRoleKey }) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function defaultRunProcess(command, args, options) {
  return new Promise((resolveProcess) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", () => {
      resolveProcess({ code: -1, stdout: "", stderr: "" });
    });
    child.on("close", (code) => {
      resolveProcess({
        code: code ?? -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    child.stdin.end(options.stdin ?? undefined);
  });
}

function dependencies(overrides = {}) {
  return {
    fs: overrides.fs ?? nodeFs,
    runProcess: overrides.runProcess ?? defaultRunProcess,
    createAdminClient: overrides.createAdminClient ?? defaultCreateAdminClient,
    logger: overrides.logger ?? (() => {}),
    clock: overrides.clock ?? { now: () => Date.now() },
    randomBytes: overrides.randomBytes ?? nodeRandomBytes,
    cwd: overrides.cwd ?? process.cwd(),
    uid: overrides.uid ?? (() => process.getuid?.()),
    pid: overrides.pid ?? process.pid,
    baseEnv: overrides.baseEnv ?? process.env,
  };
}

function absolutePath(path, ctx) {
  return resolve(ctx.cwd, path);
}

function secureFile(path, ctx, kind) {
  const absolute = absolutePath(path, ctx);
  let stat;
  try {
    stat = ctx.fs.lstatSync(absolute);
  } catch {
    fail(`${kind} local recusado`);
  }
  const currentUid = ctx.uid();
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    (stat.mode & 0o777) !== 0o600 ||
    !Number.isInteger(currentUid) ||
    stat.uid !== currentUid
  ) {
    fail(`${kind} local recusado`);
  }
  return absolute;
}

async function requireGitIgnored(path, ctx, kind) {
  const absolute = absolutePath(path, ctx);
  let result;
  try {
    result = await ctx.runProcess(
      "git",
      ["check-ignore", "--quiet", "--", relative(ctx.cwd, absolute)],
      {
        cwd: ctx.cwd,
        env: sanitizeBaseEnvironment(ctx.baseEnv),
        shell: false,
      },
    );
  } catch {
    fail(`${kind} local recusado`);
  }
  if (result.code !== 0) fail(`${kind} local recusado`);
}

export async function validateEnvFile(path = DEFAULT_ENV_FILE, overrides = {}) {
  const ctx = dependencies(overrides);
  const absolute = secureFile(path, ctx, "env");
  await requireGitIgnored(absolute, ctx, "env");

  let values;
  try {
    values = parseStrictEnv(ctx.fs.readFileSync(absolute, "utf8"));
    validateStagingUrl(values.EXPO_PUBLIC_SUPABASE_URL);
  } catch {
    fail("env invalido");
  }
  return {
    url: STAGING_URL,
    anonKey: values.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: values.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    ref: STAGING_REF,
  };
}

function assertStatePath(path, ctx) {
  const absolute = absolutePath(path, ctx);
  const tempRoot = resolve(ctx.cwd, ".tmp");
  if (!absolute.startsWith(`${tempRoot}${sep}`)) fail("state local recusado");
  return absolute;
}

function validateStateShape(state) {
  if (
    state?.ref !== STAGING_REF ||
    !state.accounts ||
    Array.isArray(state.accounts)
  ) {
    fail("state local recusado");
  }
  const labels = Object.keys(state.accounts);
  if (
    labels.length === 0 ||
    labels.length > 2 ||
    labels.some((label) => !["A", "B"].includes(label))
  ) {
    fail("state local recusado");
  }
  for (const account of Object.values(state.accounts)) {
    if (
      !account ||
      typeof account.id !== "string" ||
      !account.id ||
      typeof account.email !== "string" ||
      !account.email ||
      typeof account.password !== "string" ||
      !account.password
    ) {
      fail("state local recusado");
    }
  }
  return state;
}

async function readState(path, ctx) {
  const absolute = assertStatePath(path, ctx);
  secureFile(absolute, ctx, "state");
  await requireGitIgnored(absolute, ctx, "state");
  try {
    return {
      absolute,
      state: validateStateShape(
        JSON.parse(ctx.fs.readFileSync(absolute, "utf8")),
      ),
    };
  } catch {
    fail("state local recusado");
  }
}

function writeState(path, state, ctx) {
  const absolute = assertStatePath(path, ctx);
  const parent = dirname(absolute);
  ctx.fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temporary = `${absolute}.tmp-${ctx.pid}-${ctx.randomBytes(6).toString("hex")}`;
  try {
    ctx.fs.writeFileSync(temporary, JSON.stringify(state), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    ctx.fs.chmodSync(temporary, 0o600);
    ctx.fs.renameSync(temporary, absolute);
    ctx.fs.chmodSync(absolute, 0o600);
  } catch {
    try {
      if (ctx.fs.existsSync(temporary)) ctx.fs.unlinkSync(temporary);
    } catch {
      // A sanitized caller error is safer than exposing a filesystem path or contents.
    }
    fail("state local recusado");
  }
}

function credentialsFor(label, ctx) {
  return {
    email: `neon-uat-${ctx.clock.now()}-${label.toLowerCase()}-${ctx.randomBytes(8).toString("hex")}@forca.test`,
    password: `Fx!9-${ctx.randomBytes(24).toString("base64url")}`,
  };
}

async function verifyAbsent(admin, id) {
  try {
    const result = await admin.auth.admin.getUserById(id);
    if (isNotFound(result.error)) return true;
    return !result.error && !result.data?.user;
  } catch {
    return false;
  }
}

async function deleteAndVerify(admin, records) {
  const failures = new Set();
  for (const record of records) {
    try {
      const result = await admin.auth.admin.deleteUser(record.id);
      if (result.error && !isNotFound(result.error)) failures.add(record.id);
    } catch {
      failures.add(record.id);
    }
  }
  for (const record of records) {
    if (!(await verifyAbsent(admin, record.id))) failures.add(record.id);
  }
  return [...failures];
}

function recordsAsState(records) {
  return {
    ref: STAGING_REF,
    accounts: Object.fromEntries(
      records.map((record) => [
        record.label,
        {
          id: record.id,
          email: record.email,
          password: record.password,
        },
      ]),
    ),
  };
}

async function provision(config, options, ctx) {
  const statePath = assertStatePath(options.stateFile, ctx);
  await requireGitIgnored(statePath, ctx, "state");
  if (ctx.fs.existsSync(statePath)) fail("state local recusado");

  let admin;
  try {
    admin = ctx.createAdminClient({
      url: config.url,
      serviceRoleKey: config.serviceRoleKey,
    });
  } catch {
    fail("provision falhou");
  }
  const records = [];
  try {
    for (const label of ["A", "B"]) {
      const credential = credentialsFor(label, ctx);
      const result = await admin.auth.admin.createUser({
        ...credential,
        email_confirm: true,
      });
      if (result.error || !result.data?.user?.id) fail("create failed");
      records.push({ label, id: result.data.user.id, ...credential });
    }
    writeState(statePath, recordsAsState(records), ctx);
    ctx.logger({
      step: "provision-complete",
      ref: STAGING_REF,
      count: records.length,
    });
    return { command: "provision", accounts: records.length };
  } catch {
    const rollbackFailures = await deleteAndVerify(admin, records);
    if (rollbackFailures.length > 0) {
      try {
        writeState(statePath, recordsAsState(records), ctx);
      } catch {
        // The caller still receives a closed failure without leaked account material.
      }
      const ids = rollbackFailures.map(truncateId);
      ctx.logger({ step: "provision-rollback-failed", count: ids.length, ids });
      fail(`provision falhou; rollback falhou para ids ${ids.join(", ")}`);
    }
    ctx.logger({ step: "provision-rolled-back", count: records.length });
    fail("provision falhou");
  }
}

async function cleanup(config, options, ctx) {
  const statePath = assertStatePath(options.stateFile, ctx);
  if (!ctx.fs.existsSync(statePath)) {
    ctx.logger({ step: "cleanup-complete", count: 0 });
    return { command: "cleanup", accounts: 0 };
  }
  const { state } = await readState(statePath, ctx);
  const records = Object.entries(state.accounts).map(([label, account]) => ({
    label,
    ...account,
  }));
  let admin;
  try {
    admin = ctx.createAdminClient({
      url: config.url,
      serviceRoleKey: config.serviceRoleKey,
    });
  } catch {
    fail("cleanup falhou");
  }
  const failures = await deleteAndVerify(admin, records);
  if (failures.length > 0) {
    const ids = failures.map(truncateId);
    ctx.logger({ step: "cleanup-failed", count: ids.length, ids });
    fail(`cleanup falhou para ids ${ids.join(", ")}`);
  }
  try {
    ctx.fs.unlinkSync(statePath);
  } catch {
    fail("state local recusado");
  }
  ctx.logger({ step: "cleanup-complete", count: records.length });
  return { command: "cleanup", accounts: 0 };
}

async function runChecked(command, args, options, ctx, failureMessage) {
  let result;
  try {
    result = await ctx.runProcess(command, args, { ...options, shell: false });
  } catch {
    fail(failureMessage);
  }
  if (result.code !== 0) fail(failureMessage);
  return result;
}

function listNewJavaScriptFiles(directory, startedAt, ctx) {
  const files = [];
  const visit = (current) => {
    for (const entry of ctx.fs.readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (
        entry.isFile() &&
        path.endsWith(".js") &&
        ctx.fs.statSync(path).mtimeMs >= startedAt
      ) {
        files.push(path);
      }
    }
  };
  try {
    visit(directory);
  } catch {
    return [];
  }
  return files;
}

function inspectWebBundles(startedAt, config, ctx) {
  const files = listNewJavaScriptFiles(
    resolve(ctx.cwd, "dist"),
    startedAt,
    ctx,
  );
  if (files.length === 0) fail("bundle web recusado");
  let stagingFound = false;
  for (const path of files) {
    let content;
    try {
      content = ctx.fs.readFileSync(path, "utf8");
    } catch {
      fail("bundle web recusado");
    }
    if (content.includes(STAGING_REF)) stagingFound = true;
    if (
      content.includes("zanqygwsgxkyjiuhrzju") ||
      content.includes(config.serviceRoleKey) ||
      /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/iu.test(content)
    ) {
      fail("bundle web recusado");
    }
  }
  if (!stagingFound) fail("bundle web recusado");
  return files.length;
}

async function webBuild(config, ctx) {
  const startedAt = ctx.clock.now();
  await runChecked(
    "npm",
    ["run", "build:web"],
    { cwd: ctx.cwd, env: sanitizeChildEnvironment(ctx.baseEnv, config) },
    ctx,
    "web-build falhou",
  );
  const bundles = inspectWebBundles(startedAt, config, ctx);
  ctx.logger({ step: "web-build-complete", ref: STAGING_REF, count: bundles });
  return { command: "web-build", bundles };
}

function validateUdid(udid) {
  if (typeof udid !== "string" || !/^[A-Za-z0-9-]{8,64}$/u.test(udid)) {
    fail("argumentos invalidos");
  }
  return udid;
}

async function signedInstall(config, options, ctx) {
  const udid = validateUdid(options.udid);
  await runChecked(
    "npm",
    ["run", "resign", "--", udid],
    { cwd: ctx.cwd, env: sanitizeChildEnvironment(ctx.baseEnv, config) },
    ctx,
    "signed-install falhou",
  );
  ctx.logger({ step: "signed-install-complete", ref: STAGING_REF, count: 1 });
  return { command: "signed-install" };
}

async function copyField(options, ctx) {
  if (
    !["A", "B"].includes(options.account) ||
    !["email", "password"].includes(options.field)
  ) {
    fail("argumentos invalidos");
  }
  const { state } = await readState(options.stateFile, ctx);
  const value = state.accounts[options.account]?.[options.field];
  if (typeof value !== "string" || !value) fail("argumentos invalidos");
  await runChecked(
    "pbcopy",
    [],
    { cwd: ctx.cwd, env: sanitizeBaseEnvironment(ctx.baseEnv), stdin: value },
    ctx,
    "copy-field falhou",
  );
  ctx.logger({
    step: "copy-field-complete",
    account: options.account,
    field: options.field,
    count: 1,
  });
  return {
    command: "copy-field",
    account: options.account,
    field: options.field,
  };
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) fail("argumentos invalidos");
  if (rest.length % 2 !== 0) fail("argumentos invalidos");

  const parsed = {
    command,
    envFile: DEFAULT_ENV_FILE,
    stateFile: DEFAULT_STATE_FILE,
    account: undefined,
    field: undefined,
    udid: undefined,
  };
  const seen = new Set();
  const propertyByFlag = {
    "--env-file": "envFile",
    "--state-file": "stateFile",
    "--account": "account",
    "--field": "field",
    "--udid": "udid",
  };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (
      !FLAGS.has(flag) ||
      seen.has(flag) ||
      !value ||
      value.startsWith("--")
    ) {
      fail("argumentos invalidos");
    }
    seen.add(flag);
    parsed[propertyByFlag[flag]] = value;
  }
  return parsed;
}

export async function runNeonUatCommand(argv, overrides = {}) {
  const ctx = dependencies(overrides);
  const options = parseArguments(argv);

  if (options.command === "copy-field") return copyField(options, ctx);

  const config = await validateEnvFile(options.envFile, ctx);
  if (options.command === "validate") {
    ctx.logger({ step: "environment-validated", ref: STAGING_REF, count: 0 });
    return { command: "validate", ref: STAGING_REF };
  }
  if (options.command === "provision") return provision(config, options, ctx);
  if (options.command === "cleanup") return cleanup(config, options, ctx);
  if (options.command === "web-build") return webBuild(config, ctx);
  return signedInstall(config, options, ctx);
}

function cliLogger(event) {
  const fields = [`step=${event.step}`];
  if (event.ref) fields.push(`ref=${event.ref}`);
  if (typeof event.count === "number") fields.push(`count=${event.count}`);
  if (event.account) fields.push(`account=${event.account}`);
  if (event.field) fields.push(`field=${event.field}`);
  if (event.ids) fields.push(`ids=${event.ids.join(",")}`);
  console.log(`[neon-uat] ${fields.join(" ")}`);
}

export async function main(argv = process.argv.slice(2)) {
  try {
    await runNeonUatCommand(argv, { logger: cliLogger });
    console.log("[neon-uat] OK");
  } catch (error) {
    console.error(`[neon-uat] FALHOU: ${error.message}`);
    process.exitCode = 1;
  }
}

const isEntrypoint =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) await main();
