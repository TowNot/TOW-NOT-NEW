/** Shared fire-dispatch runtime counters for /api/sources/status. */

export type FireDispatchRuntimeStats = {
  listening: boolean;
  lastAudioAt: string | null;
  lastTranscriptAt: string | null;
  lastTranscript: string | null;
  lastKeywords: string[] | null;
  lastSkipReason: string | null;
  lastError: string | null;
  lastPostedAt: string | null;
  activeFeeds: string[];
  counts: {
    audioSegments: number;
    sttOk: number;
    deadAir: number;
    emptyTranscript: number;
    noKeyword: number;
    discarded: number;
    posted: number;
  };
};

const fireRuntime: FireDispatchRuntimeStats = {
  listening: false,
  lastAudioAt: null,
  lastTranscriptAt: null,
  lastTranscript: null,
  lastKeywords: null,
  lastSkipReason: null,
  lastError: null,
  lastPostedAt: null,
  activeFeeds: [],
  counts: {
    audioSegments: 0,
    sttOk: 0,
    deadAir: 0,
    emptyTranscript: 0,
    noKeyword: 0,
    discarded: 0,
    posted: 0,
  },
};

const activeFeedLabels = new Set<string>();

export function getFireDispatchRuntime(): FireDispatchRuntimeStats {
  return {
    ...fireRuntime,
    listening: activeFeedLabels.size > 0,
    activeFeeds: [...activeFeedLabels],
    counts: { ...fireRuntime.counts },
    lastKeywords: fireRuntime.lastKeywords ? [...fireRuntime.lastKeywords] : null,
  };
}

export function registerActiveFeed(label: string): void {
  activeFeedLabels.add(label);
  fireRuntime.listening = true;
}

export function unregisterActiveFeed(label: string): void {
  activeFeedLabels.delete(label);
  fireRuntime.listening = activeFeedLabels.size > 0;
}

export function noteAudioSegment(): void {
  fireRuntime.lastAudioAt = new Date().toISOString();
  fireRuntime.counts.audioSegments += 1;
}

export function noteFireDispatchPosted(): void {
  fireRuntime.counts.posted += 1;
  fireRuntime.lastPostedAt = new Date().toISOString();
  fireRuntime.lastSkipReason = null;
  fireRuntime.lastError = null;
}

export function noteFireDispatchSkip(reason: string): void {
  fireRuntime.lastSkipReason = reason;
  if (reason.startsWith("dead_air")) fireRuntime.counts.deadAir += 1;
  else if (reason === "empty_transcript") fireRuntime.counts.emptyTranscript += 1;
  else if (reason.startsWith("no_keyword") || reason.startsWith("negative_keyword")) {
    fireRuntime.counts.noKeyword += 1;
  }
}

export function noteFireDispatchTranscript(transcript: string): void {
  fireRuntime.counts.sttOk += 1;
  fireRuntime.lastTranscriptAt = new Date().toISOString();
  fireRuntime.lastTranscript = transcript.slice(0, 240);
}

export function noteFireDispatchDiscard(error: string): void {
  fireRuntime.counts.discarded += 1;
  fireRuntime.lastError = error;
  fireRuntime.lastSkipReason = "stt_discarded";
}
