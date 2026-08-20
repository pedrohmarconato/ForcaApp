import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = join(ROOT, "scripts", "resign.sh");
const STAGING_REF = "mjdjtiujhwklchalquhc";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PRODUCTION_REF = "zanqygwsgxkyjiuhrzju";
const ANON_KEY = "fixture-anon-key.SENSITIVE";
const DEVICE_UDID = "12345678-1234-1234-1234-1234567890AB";

async function writeExecutable(path, source) {
  await writeFile(path, source, "utf8");
  await chmod(path, 0o755);
}

function runProcess(command, args, options) {
  return new Promise((resolveProcess) => {
    const child = spawn(command, args, options);
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      resolveProcess({
        code: -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${error.message}`,
      });
    });
    child.on("close", (code) => {
      resolveProcess({
        code: code ?? -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function createHarness({ buildMode = "valid" } = {}) {
  const harnessRoot = await mkdtemp(join(tmpdir(), "forca-resign-test-"));
  const bin = join(harnessRoot, "bin");
  const eventsPath = join(harnessRoot, "events.log");
  const derivedPathFile = join(harnessRoot, "derived.path");
  const oldAppPath = join(
    harnessRoot,
    "old-global-derived-data",
    "Build",
    "Products",
    "Release-iphoneos",
    "ForcaApp.app",
  );
  await mkdir(bin, { recursive: true });
  await writeFile(eventsPath, "", "utf8");
  await mkdir(join(oldAppPath, "PlugIns", "session-widget.appex"), {
    recursive: true,
  });
  await writeFile(join(oldAppPath, "main.jsbundle"), STAGING_URL, "utf8");

  const adapterEnvironment = {
    RESIGN_TEST_EVENTS: eventsPath,
    RESIGN_TEST_DERIVED_PATH: derivedPathFile,
    RESIGN_TEST_BUILD_MODE: buildMode,
    RESIGN_VERIFY_SCRIPT: join(ROOT, "scripts", "verify-native-skeleton.sh"),
  };

  await writeExecutable(
    join(bin, "pod"),
    `#!/bin/sh
set -eu
printf '%s\\n' pod >> "$RESIGN_TEST_EVENTS"
printf '%s\\n' '1.15.0'
`,
  );

  await writeExecutable(
    join(bin, "npx"),
    `#!/bin/sh
set -eu
printf '%s\\n' npx >> "$RESIGN_TEST_EVENTS"
exit 0
`,
  );

  await writeExecutable(
    join(bin, "xcodebuild"),
    `#!/bin/sh
set -eu
if [ "$1" = "-list" ]; then
  printf '%s\\n' xcodebuild-list >> "$RESIGN_TEST_EVENTS"
  printf '%s\\n' '{"workspace":{"schemes":["CocoaPods","ForcaApp"]}}'
  exit 0
fi

printf '%s\\n' xcodebuild-build >> "$RESIGN_TEST_EVENTS"
derived=''
previous=''
has_release=0
has_clean=0
has_build=0
for argument in "$@"; do
  if [ "$previous" = "-derivedDataPath" ]; then derived="$argument"; fi
  if [ "$argument" = "Release" ]; then has_release=1; fi
  if [ "$argument" = "clean" ]; then has_clean=1; fi
  if [ "$argument" = "build" ]; then has_build=1; fi
  previous="$argument"
done
if [ -z "$derived" ] || [ "$has_release" -ne 1 ] || [ "$has_clean" -ne 1 ] || [ "$has_build" -ne 1 ]; then
  exit 2
fi
printf '%s' "$derived" > "$RESIGN_TEST_DERIVED_PATH"
sleep 1
app="$derived/Build/Products/Release-iphoneos/ForcaApp.app"
mkdir -p "$app"
if [ "$RESIGN_TEST_BUILD_MODE" != "missing-widget" ]; then
  mkdir -p "$app/PlugIns/session-widget.appex"
fi
case "$RESIGN_TEST_BUILD_MODE" in
  valid|stale|invalid-codesign)
    printf '%s' "${STAGING_URL}" > "$app/main.jsbundle"
    ;;
  bad-bundle)
    printf '%s https://${PRODUCTION_REF}.supabase.co http://localhost:54321' \\
      "${STAGING_URL}" > "$app/main.jsbundle"
    ;;
  missing-bundle)
    ;;
esac
if [ "$RESIGN_TEST_BUILD_MODE" = "stale" ]; then
  touch -t 200001010000 "$app"
fi
`,
  );

  await writeExecutable(
    join(bin, "codesign"),
    `#!/bin/sh
set -eu
last=''
for argument in "$@"; do last="$argument"; done
printf 'codesign %s\\n' "$last" >> "$RESIGN_TEST_EVENTS"
if [ "$RESIGN_TEST_BUILD_MODE" = "invalid-codesign" ]; then exit 1; fi
[ -d "$last" ]
`,
  );

  await writeExecutable(
    join(bin, "xcrun"),
    `#!/bin/sh
set -eu
if [ "$2" = "list" ]; then
  printf '%s\\n' devicectl-list >> "$RESIGN_TEST_EVENTS"
  printf '%s\\n' "$RESIGN_TEST_DEVICE_UDID"
  exit 0
fi
if [ "$2" = "device" ] && [ "$3" = "install" ]; then
  last=''
  for argument in "$@"; do last="$argument"; done
  printf 'devicectl-install %s\\n' "$last" >> "$RESIGN_TEST_EVENTS"
  exit 0
fi
exit 1
`,
  );

  await writeExecutable(
    join(bin, "bash"),
    `#!/bin/sh
set -eu
if [ "$1" = "$RESIGN_VERIFY_SCRIPT" ]; then
  printf '%s\\n' verify-native >> "$RESIGN_TEST_EVENTS"
  exit 0
fi
exec /bin/bash "$@"
`,
  );

  return {
    oldAppPath,
    eventsPath,
    derivedPathFile,
    async run(overrides = {}, args = []) {
      const env = {
        ...process.env,
        HOME: harnessRoot,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        EXPO_PUBLIC_SUPABASE_URL: STAGING_URL,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
        FORCA_EXPECT_SUPABASE_REF: STAGING_REF,
        RESIGN_TEST_DEVICE_UDID: DEVICE_UDID,
        ...adapterEnvironment,
      };
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete env[key];
        else env[key] = value;
      }
      return runProcess("/bin/bash", [SCRIPT_PATH, ...args], {
        cwd: ROOT,
        env,
      });
    },
    async events() {
      return (await readFile(eventsPath, "utf8")).split("\n").filter(Boolean);
    },
    async cleanup() {
      await rm(harnessRoot, { recursive: true, force: true });
    },
  };
}

test("resign fixes the product to a fresh Release DerivedData path", async () => {
  const script = await readFile(SCRIPT_PATH, "utf8");

  assert.match(script, /mktemp\s+-d\s+\/tmp\/forca-resign/u);
  assert.match(script, /-derivedDataPath\s+"\$DERIVED_DATA_PATH"/u);
  assert.match(script, /-configuration Release/u);
  assert.match(script, /clean build/u);
  assert.match(
    script,
    /APP_PATH="\$\{DERIVED_DATA_PATH\}\/Build\/Products\/Release-iphoneos\/\$\{SCHEME\}\.app"/u,
  );
  assert.match(script, /PlugIns\/session-widget\.appex/u);
  assert.match(script, /-nt "\$BUILD_START_MARKER"/u);
  assert.match(script, /codesign --verify --deep --strict --verbose=2/u);
  assert.doesNotMatch(script, /find\s+.*DerivedData/u);
});

test("installs only the new app and verifies it before devicectl", async () => {
  const harness = await createHarness();
  try {
    const result = await harness.run();
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);

    const derivedPath = (
      await readFile(harness.derivedPathFile, "utf8")
    ).trim();
    const expectedAppPath = join(
      derivedPath,
      "Build",
      "Products",
      "Release-iphoneos",
      "ForcaApp.app",
    );
    const events = await harness.events();
    const install = events.find((event) =>
      event.startsWith("devicectl-install "),
    );

    assert.equal(install, `devicectl-install ${expectedAppPath}`);
    assert.notEqual(install, `devicectl-install ${harness.oldAppPath}`);
    assert.equal(
      events.filter((event) => event.startsWith("devicectl-install ")).length,
      1,
    );
    assert.ok(
      events.findIndex((event) => event.startsWith("codesign ")) <
        events.findIndex((event) => event === "devicectl-list"),
    );
    assert.ok(events.includes("verify-native"));
    assert.match(derivedPath, /^\/tmp\/forca-resign\.[^/]+$/u);

    for (const forbidden of [ANON_KEY, STAGING_URL]) {
      assert.equal(result.stdout.includes(forbidden), false);
      assert.equal(result.stderr.includes(forbidden), false);
    }
  } finally {
    await harness.cleanup();
  }
});

test("rejects UAT URL errors before prebuild without exposing environment values", async () => {
  for (const url of [
    undefined,
    "",
    `https://${PRODUCTION_REF}.supabase.co`,
    "https://localhost:54321",
    `https://${STAGING_REF}.supabase.co.example.com`,
    `https://user@${STAGING_REF}.supabase.co`,
    `https://${STAGING_REF}.supabase.co:443`,
    `https://${STAGING_REF}.supabase.co/rest`,
  ]) {
    const harness = await createHarness();
    try {
      const result = await harness.run({ EXPO_PUBLIC_SUPABASE_URL: url });
      const output = `${result.stdout}\n${result.stderr}`;
      const events = await harness.events();

      assert.notEqual(result.code, 0, output);
      assert.match(output, /ABORTADO/u);
      assert.equal(events.includes("npx"), false);
      assert.equal(
        events.some((event) => event.startsWith("xcodebuild")),
        false,
      );
      assert.equal(
        events.some((event) => event.startsWith("devicectl")),
        false,
      );
      assert.equal(output.includes(ANON_KEY), false);
      if (url) assert.equal(output.includes(url), false);
    } finally {
      await harness.cleanup();
    }
  }
});

test("rejects missing widget, stale app, invalid codesign, and invalid bundle before device access", async () => {
  for (const buildMode of [
    "missing-widget",
    "stale",
    "invalid-codesign",
    "bad-bundle",
    "missing-bundle",
  ]) {
    const harness = await createHarness({ buildMode });
    try {
      const result = await harness.run();
      const output = `${result.stdout}\n${result.stderr}`;
      const events = await harness.events();

      assert.notEqual(result.code, 0, `${buildMode}: ${output}`);
      assert.equal(
        events.some((event) => event.startsWith("devicectl")),
        false,
        `${buildMode}: ${events.join(" | ")}`,
      );
      assert.equal(output.includes(ANON_KEY), false);
      assert.equal(output.includes(STAGING_URL), false);
    } finally {
      await harness.cleanup();
    }
  }
});
