import { createEnvTemplate } from "./index.js";

function valueAfter(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : "";
}

export function parseInitArgs(args) {
  const [command] = args;
  if (command !== "init") {
    return { ok: false, message: "Usage: growth-hermes init --app <url> --token <token> [--secret <secret>] [--env <file>]" };
  }

  const app = valueAfter(args, "--app");
  const token = valueAfter(args, "--token");
  const secret = valueAfter(args, "--secret") ?? "";
  const env = valueAfter(args, "--env") || ".env.growth-engine";

  if (!app) return { ok: false, message: "Missing required --app <url>." };
  if (!token) return { ok: false, message: "Missing required --token <token>." };

  return { ok: true, command, app, token, secret, env };
}

export async function runInitCommand(args, { writeFile, stdout = () => {} }) {
  const parsed = parseInitArgs(args);
  if (!parsed.ok) {
    stdout(parsed.message);
    return { ok: false, message: parsed.message };
  }

  const contents = createEnvTemplate({
    baseUrl: parsed.app,
    token: parsed.token,
    webhookSecret: parsed.secret,
  });
  await writeFile(parsed.env, contents);
  stdout(`Wrote ${parsed.env}`);
  stdout("Add these values to the Hermes agent runtime, then call client.ping() to verify the connection.");
  return { ok: true, envPath: parsed.env };
}
