import { KokoroTTS } from "kokoro-js";
import { env as ortEnv } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// Force single-threaded WASM with no WebGPU. A direct Node.js run of this
// exact model produced perfect audio, but the in-browser run came out
// garbled — meaning inference itself is silently computing wrong numbers in
// the browser, not erroring. That points at Safari's WebGPU or
// multi-threaded/SIMD WASM paths, both of which have known correctness bugs
// (as opposed to just being slow). Trading speed for correctness here is
// the right call for a kids' app.
ortEnv.backends.onnx.wasm.numThreads = 1;
ortEnv.backends.onnx.wasm.simd = false;

// Picked for Kokoro's own quality grades (A / A- / B- / C+) — the previous
// bf_lily (D) and am_michael (C+) picks could come out mumbled enough to be
// mistaken for a different language entirely.
export const VOICES = [
  { id: "af_heart", label: "Sunny", emoji: "🐝" },
  { id: "af_bella", label: "Bella", emoji: "🦋" },
  { id: "am_fenrir", label: "Buddy", emoji: "🐻" },
  { id: "bf_emma", label: "Emma", emoji: "🦉" },
];

let ttsInstance = null;
let loadingPromise = null;
const audioCache = new Map(); // `${voice}::${text}` -> AudioBuffer
let audioCtx = null;
let currentSource = null;
let speakQueue = Promise.resolve();

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

export function isModelReady() {
  return ttsInstance !== null;
}

// Safari only allows an AudioContext to start/resume synchronously inside a
// user-gesture handler (a click), not after any `await`. Model loading and
// generation are async, so by the time we'd otherwise create/resume the
// context it's too late and Safari silently refuses to play anything. Call
// this at the very top of every click handler, before any await, so the
// context is unlocked while the click is still "live".
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();
}

export async function loadModel(onProgress) {
  if (ttsInstance) return ttsInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      ttsInstance = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: "q8",
        device: "wasm",
        progress_callback: onProgress,
      });
    } catch (err) {
      loadingPromise = null;
      throw err;
    }
    return ttsInstance;
  })();

  return loadingPromise;
}

// Kokoro's own RawAudio.toBlob()/the <audio> element route through the
// browser's WAV file decoder, which Safari handles unreliably (it can
// misread the byte layout entirely, producing fast, warbly, pitch-shifted
// noise that sounds nothing like the intended language). Building an
// AudioBuffer directly from the raw PCM samples and playing it through the
// Web Audio API skips file-format decoding altogether, sidestepping that.
async function synthesize(text, voice) {
  const key = `${voice}::${text}`;
  if (audioCache.has(key)) return audioCache.get(key);
  const tts = await loadModel();
  const audio = await tts.generate(text, { voice });
  const ctx = getAudioContext();
  const buffer = ctx.createBuffer(1, audio.audio.length, audio.sampling_rate);
  buffer.copyToChannel(Float32Array.from(audio.audio), 0);
  audioCache.set(key, buffer);
  return buffer;
}

function playBuffer(buffer, { onStart, onEnd } = {}) {
  return new Promise((resolve) => {
    const ctx = getAudioContext();
    if (currentSource) {
      try {
        currentSource.stop();
      } catch {
        /* already stopped */
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    currentSource = source;
    const finish = () => {
      onEnd?.();
      resolve();
    };
    source.onended = finish;
    onStart?.();
    const start = () => source.start();
    if (ctx.state === "suspended") {
      ctx.resume().then(start).catch(finish);
    } else {
      start();
    }
  });
}

/** Queues text to be spoken in order; safe to call multiple times in a row. */
export function speak(text, voice, callbacks = {}) {
  if (!text) return speakQueue;
  speakQueue = speakQueue.then(async () => {
    try {
      const buffer = await synthesize(text, voice);
      await playBuffer(buffer, callbacks);
    } catch (err) {
      console.error("TTS failed", err);
      callbacks.onEnd?.();
    }
  });
  return speakQueue;
}

export function stopSpeaking() {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      /* already stopped */
    }
  }
  speakQueue = Promise.resolve();
}
