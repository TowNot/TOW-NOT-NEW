import { toFile } from "openai";
import OpenAI from "openai";
import { config } from "../config";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl || undefined,
    });
  }
  return client;
}

export async function speechToText(wav: Buffer): Promise<string> {
  const file = await toFile(wav, "dispatch.wav", { type: "audio/wav" });
  const result = await getOpenAI().audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return result.text;
}

export async function extractJsonLocation(transcript: string): Promise<string | null> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content:
          "You extract street locations from London Fire Department (London, Ontario, Canada) radio dispatch transcripts. " +
          "Transcripts come in two forms: automated Station Alerting announcements, and live radio traffic where " +
          '"765" (Dispatch) calls apparatus (e.g. "765 calling Engine 3", "Pumper 1, transfer to Tac 1", ' +
          '"Engine 3 responding to Wharncliffe and Oxford"). ' +
          "IGNORE unit identifiers (Engine/Pumper/Rescue/Ladder/Truck/Aerial/Car + number, \"765\", \"Dispatch\") and " +
          'channel assignments ("Tac 1", "Tac 2", "channel") — they are NEVER locations. ' +
          'Radio static garbles words: "MVC" may appear as "NBC" or "M.V.C." — these all mean a motor vehicle collision. ' +
          'Reply with ONLY a JSON object: {"location": "<street address or CROSS-STREET intersection>"} ' +
          'using the clearest location mentioned (e.g. {"location": "Wharncliffe Road and Oxford Street"}). ' +
          'If no street, intersection, or address is mentioned, reply {"location": null}.',
      },
      { role: "user", content: transcript },
    ],
  });
  const raw = response.choices[0]?.message?.content ?? "";
  try {
    const jsonText = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonText) as { location?: string | null };
    return typeof parsed.location === "string" && parsed.location.trim().length > 0
      ? parsed.location.trim()
      : null;
  } catch {
    return null;
  }
}
