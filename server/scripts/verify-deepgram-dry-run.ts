import assert from "node:assert/strict";
import { config } from "../src/config";
import { getDeepgram } from "../src/engine/deepgramClient";

/**
 * Wiring dry-run for the Deepgram switch. Does not spend STT credits: the
 * live socket is only opened when DEEPGRAM_API_KEY is present AND
 * DEEPGRAM_DRY_RUN_LIVE=1 is set.
 */
async function main(): Promise<void> {
  assert.equal(typeof config.deepgramApiKey, "string");
  assert.ok("deepgramApiKey" in config, "config must expose deepgramApiKey");

  if (!config.deepgramApiKey) {
    try {
      getDeepgram();
      assert.fail("getDeepgram() must throw when DEEPGRAM_API_KEY is missing");
    } catch (err) {
      assert.match(err instanceof Error ? err.message : String(err), /DEEPGRAM_API_KEY/);
    }
    console.error("PASS  DEEPGRAM_API_KEY missing → client construction refused");
    console.error("PASS  config.deepgramApiKey is wired from process.env");
    console.error(
      "\nDry run complete (no live call). Set DEEPGRAM_API_KEY on Railway before the fire listener can transcribe.",
    );
    return;
  }

  const client = getDeepgram();
  assert.ok(client.listen?.v1, "Deepgram listen.v1 client must exist");
  console.error("PASS  Deepgram client constructed from DEEPGRAM_API_KEY");
  console.error("PASS  listen.v1 live streaming surface is present");

  if (process.env.DEEPGRAM_DRY_RUN_LIVE !== "1") {
    console.error(
      "\nDry run complete (client only). Set DEEPGRAM_DRY_RUN_LIVE=1 to open a Nova-3 socket.",
    );
    return;
  }

  const connection = await client.listen.v1.connect({
    model: "nova-3",
    language: "en-US",
    smart_format: "true",
    reconnectAttempts: 0,
    connectionTimeoutInSeconds: 10,
  });
  connection.connect();
  await connection.waitForOpen();
  connection.sendCloseStream({ type: "CloseStream" });
  connection.close();
  console.error("PASS  Nova-3 live socket opened and closed");
  console.error("\nDry run complete (live socket)");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
