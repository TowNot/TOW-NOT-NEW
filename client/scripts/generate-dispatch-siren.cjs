/**
 * Generates the TOW-NOT dispatch siren asset.
 *
 * A two-tone emergency warble rather than a notification chime, so an operator
 * recognizes a tow dispatch without looking at the screen. WAV (not MP3) so it
 * can be produced deterministically here with no encoder dependency; every
 * browser we target decodes 16-bit PCM WAV natively.
 *
 * Run: node client/scripts/generate-dispatch-siren.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const SAMPLE_RATE = 22050;
const LOW_HZ = 740;
const HIGH_HZ = 988;
const TONE_SECONDS = 0.17;
const CYCLES = 3; // low-high pairs
const GAP_SECONDS = 0.05;
const PEAK = 0.42; // headroom so phone speakers don't clip

function envelope(position, total) {
  const attack = 0.008 * SAMPLE_RATE;
  const release = 0.03 * SAMPLE_RATE;
  if (position < attack) return position / attack;
  if (position > total - release) return Math.max(0, (total - position) / release);
  return 1;
}

/** Sawtooth-ish timbre: harmonics give the siren its edge over a pure sine. */
function timbre(phase) {
  return (
    0.6 * Math.sin(phase) +
    0.26 * Math.sin(2 * phase) +
    0.14 * Math.sin(3 * phase)
  );
}

const samples = [];

for (let cycle = 0; cycle < CYCLES; cycle++) {
  for (const frequency of [LOW_HZ, HIGH_HZ]) {
    const toneSamples = Math.round(TONE_SECONDS * SAMPLE_RATE);
    for (let i = 0; i < toneSamples; i++) {
      const phase = (2 * Math.PI * frequency * i) / SAMPLE_RATE;
      samples.push(timbre(phase) * envelope(i, toneSamples) * PEAK);
    }
  }
  if (cycle < CYCLES - 1) {
    for (let i = 0; i < Math.round(GAP_SECONDS * SAMPLE_RATE); i++) samples.push(0);
  }
}

// Trailing drop so the siren resolves instead of cutting off mid-warble.
const tailSamples = Math.round(0.26 * SAMPLE_RATE);
for (let i = 0; i < tailSamples; i++) {
  const sweep = HIGH_HZ + (LOW_HZ - HIGH_HZ) * (i / tailSamples);
  const phase = (2 * Math.PI * sweep * i) / SAMPLE_RATE;
  samples.push(timbre(phase) * envelope(i, tailSamples) * PEAK);
}

const data = Buffer.alloc(samples.length * 2);
samples.forEach((sample, i) => {
  const clamped = Math.max(-1, Math.min(1, sample));
  data.writeInt16LE(Math.round(clamped * 32767), i * 2);
});

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16); // PCM chunk size
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

const outPath = path.join(__dirname, "..", "public", "sounds", "dispatch_siren.wav");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.concat([header, data]));

const seconds = (samples.length / SAMPLE_RATE).toFixed(2);
console.log(`Wrote ${outPath} (${seconds}s, ${(header.length + data.length) / 1024 | 0} KB)`);
