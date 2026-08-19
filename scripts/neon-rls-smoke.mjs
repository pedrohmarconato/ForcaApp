import { randomBytes as nodeRandomBytes } from "node:crypto";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

export const STAGING_REF = "mjdjtiujhwklchalquhc";
export const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

const AUTHORIZATION_ERROR_CODES = new Set(["42501", "PGRST301", "PGRST302"]);

const fail = (message) => {
  throw new Error(message);
};

export function validateStagingUrl(value) {
  if (value !== STAGING_URL) fail("URL deve ser o staging canonico");

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("URL deve ser o staging canonico");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== `${STAGING_REF}.supabase.co` ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    fail("URL deve ser o staging canonico");
  }
  return STAGING_URL;
}

export function resolveSmokeEnvironment(env) {
  const required = [
    "STAGING_SUPABASE_URL",
    "STAGING_SUPABASE_ANON_KEY",
    "STAGING_SUPABASE_SERVICE_ROLE_KEY",
  ];
  if (
    required.some(
      (key) => typeof env[key] !== "string" || env[key].length === 0,
    )
  ) {
    fail("variaveis obrigatorias ausentes");
  }
  return {
    url: validateStagingUrl(env.STAGING_SUPABASE_URL),
    anonKey: env.STAGING_SUPABASE_ANON_KEY,
    serviceRoleKey: env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
  };
}

function createCredentials(label, clock, randomBytes) {
  const suffix = randomBytes(8).toString("hex");
  return {
    email: `neon-rls-${clock.now()}-${label.toLowerCase()}-${suffix}@forca.test`,
    password: `Fx!9-${randomBytes(24).toString("base64url")}`,
  };
}

function isExpectedDenial(result) {
  if (!result.error) return result.data == null;
  return AUTHORIZATION_ERROR_CODES.has(result.error.code);
}

function assertOwnRow(result, id, color) {
  if (
    result.error ||
    result.data?.id !== id ||
    result.data?.neon_color !== color
  ) {
    fail("assertion failed");
  }
}

async function selectProfile(client, id) {
  return client
    .from("profiles")
    .select("id, neon_color")
    .eq("id", id)
    .maybeSingle();
}

async function updateProfile(client, id, neonColor) {
  return client
    .from("profiles")
    .update({ neon_color: neonColor })
    .eq("id", id)
    .select("id, neon_color")
    .maybeSingle();
}

function truncateId(id) {
  return `${String(id).slice(0, 8)}...`;
}

function clientOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  };
}

export async function runNeonRlsSmoke(
  config,
  {
    clientFactory = createClient,
    logger = () => {},
    clock = { now: () => Date.now() },
    randomBytes = nodeRandomBytes,
  } = {},
) {
  const url = validateStagingUrl(config?.url);
  if (!config?.anonKey || !config?.serviceRoleKey)
    fail("credenciais obrigatorias ausentes");

  const admin = clientFactory(url, config.serviceRoleKey, clientOptions());
  const accounts = [];
  let currentStep = "provision";
  let failure = null;
  let assertions = 0;

  logger({ step: "environment-validated", ref: STAGING_REF, count: 0 });

  try {
    for (const label of ["A", "B"]) {
      currentStep = `provision-${label}`;
      const credentials = createCredentials(label, clock, randomBytes);
      const created = await admin.auth.admin.createUser({
        email: credentials.email,
        password: credentials.password,
        email_confirm: true,
      });
      if (created.error || !created.data?.user?.id)
        fail("account creation failed");

      const account = {
        id: created.data.user.id,
        label,
        ...credentials,
        client: null,
      };
      accounts.push(account);
      const client = clientFactory(url, config.anonKey, clientOptions());
      account.client = client;

      currentStep = `authenticate-${label}`;
      const login = await client.auth.signInWithPassword(credentials);
      if (login.error || !login.data?.session)
        fail("account authentication failed");
    }
    logger({ step: "accounts-provisioned", count: accounts.length });

    const [accountA, accountB] = accounts;
    const anonymous = clientFactory(url, config.anonKey, clientOptions());

    currentStep = "initial-own-rows";
    assertOwnRow(
      await selectProfile(accountA.client, accountA.id),
      accountA.id,
      "yellow",
    );
    assertOwnRow(
      await selectProfile(accountB.client, accountB.id),
      accountB.id,
      "yellow",
    );
    assertions += 2;

    currentStep = "account-a-own-update";
    assertOwnRow(
      await updateProfile(accountA.client, accountA.id, "blue"),
      accountA.id,
      "blue",
    );
    assertions += 1;

    currentStep = "account-a-cross-select";
    if (!isExpectedDenial(await selectProfile(accountA.client, accountB.id)))
      fail("cross select visible");
    assertions += 1;

    currentStep = "account-a-cross-update";
    if (
      !isExpectedDenial(
        await updateProfile(accountA.client, accountB.id, "red"),
      )
    ) {
      fail("cross update visible");
    }
    assertions += 1;

    currentStep = "account-b-unchanged";
    assertOwnRow(
      await selectProfile(accountB.client, accountB.id),
      accountB.id,
      "yellow",
    );
    assertions += 1;

    currentStep = "account-b-own-update";
    assertOwnRow(
      await updateProfile(accountB.client, accountB.id, "green"),
      accountB.id,
      "green",
    );
    assertions += 1;

    currentStep = "anonymous-select";
    for (const account of accounts) {
      if (!isExpectedDenial(await selectProfile(anonymous, account.id)))
        fail("anonymous select visible");
    }
    assertions += 1;

    currentStep = "anonymous-update";
    for (const account of accounts) {
      if (
        !isExpectedDenial(await updateProfile(anonymous, account.id, "red"))
      ) {
        fail("anonymous update visible");
      }
    }
    assertions += 1;

    currentStep = "terminal-own-rows";
    assertOwnRow(
      await selectProfile(accountA.client, accountA.id),
      accountA.id,
      "blue",
    );
    assertOwnRow(
      await selectProfile(accountB.client, accountB.id),
      accountB.id,
      "green",
    );
    assertions += 1;
    logger({ step: "rls-assertions-passed", count: assertions });
  } catch {
    failure = new Error(`smoke RLS falhou em ${currentStep}`);
  } finally {
    currentStep = "cleanup";
    const cleanupFailures = [];
    for (const account of accounts) {
      try {
        await account.client?.removeAllChannels?.();
        await account.client?.auth?.signOut?.();
      } catch {
        // Local session cleanup must not prevent deletion through the admin API.
      }
      try {
        const deleted = await admin.auth.admin.deleteUser(account.id);
        if (deleted.error) cleanupFailures.push(account.id);
      } catch {
        cleanupFailures.push(account.id);
      }
    }

    if (cleanupFailures.length > 0) {
      const ids = cleanupFailures.map(truncateId);
      logger({ step: "cleanup-failed", count: ids.length, ids });
      const prefix = failure ? `${failure.message}; ` : "";
      failure = new Error(`${prefix}cleanup falhou para ids ${ids.join(", ")}`);
    } else {
      logger({ step: "cleanup-complete", count: accounts.length });
    }
  }

  if (failure) throw failure;
  return { accounts: accounts.length, assertions };
}

function cliLogger(event) {
  const fields = [`step=${event.step}`];
  if (typeof event.count === "number") fields.push(`count=${event.count}`);
  if (event.ref) fields.push(`ref=${event.ref}`);
  if (event.ids) fields.push(`ids=${event.ids.join(",")}`);
  console.log(`[neon-rls] ${fields.join(" ")}`);
}

export async function main(env = process.env) {
  try {
    await runNeonRlsSmoke(resolveSmokeEnvironment(env), { logger: cliLogger });
    console.log("[neon-rls] OK");
  } catch (error) {
    console.error(`[neon-rls] FALHOU: ${error.message}`);
    process.exitCode = 1;
  }
}

const isEntrypoint =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) await main();
