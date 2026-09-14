import "./style.css";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { VOICES, loadModel, speak, stopSpeaking, isModelReady, unlockAudio } from "./tts.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const openScreen = document.getElementById("openScreen");
const readerScreen = document.getElementById("readerScreen");
const fileInput = document.getElementById("fileInput");
const openError = document.getElementById("openError");
const pageCanvas = document.getElementById("pageCanvas");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const readBtn = document.getElementById("readBtn");
const closeBookBtn = document.getElementById("closeBookBtn");
const pageIndicator = document.getElementById("pageIndicator");
const speakerToggle = document.getElementById("speakerToggle");
const voiceToggle = document.getElementById("voiceToggle");
const voicePickerEl = document.getElementById("voicePicker");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingBar = document.getElementById("loadingBar");
const loadingPct = document.getElementById("loadingPct");

let pdfDoc = null;
let currentPage = 1;
let totalPages = 1;
let renderTask = null;
let muted = false;
let currentVoice = VOICES[0].id;
let voicePickerOpen = false;

function buildVoicePicker() {
  VOICES.forEach((v, i) => {
    const chip = document.createElement("button");
    chip.className = "voice-chip" + (i === 0 ? " active" : "");
    chip.dataset.voice = v.id;
    chip.innerHTML = `<span class="voice-emoji">${v.emoji}</span><span>${v.label}</span>`;
    chip.addEventListener("click", () => {
      unlockAudio();
      currentVoice = v.id;
      voiceToggle.textContent = `${v.emoji} ${v.label}`;
      [...voicePickerEl.children].forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      ensureVoiceReady().then(() => speak(`Hi, I'm ${v.label}!`, currentVoice));
    });
    voicePickerEl.appendChild(chip);
  });
  voiceToggle.textContent = `${VOICES[0].emoji} ${VOICES[0].label}`;
}

function toggleVoicePicker() {
  voicePickerOpen = !voicePickerOpen;
  voicePickerEl.hidden = !voicePickerOpen;
}

function toggleMute() {
  muted = !muted;
  speakerToggle.textContent = muted ? "🔇" : "🔊";
  if (muted) stopSpeaking();
}

function setLoadingVisible(visible) {
  loadingOverlay.hidden = !visible;
}

function onModelProgress(info) {
  if (!info) return;
  let pct = 0;
  if (typeof info.progress === "number") pct = info.progress;
  else if (info.loaded && info.total) pct = (info.loaded / info.total) * 100;
  pct = Math.max(0, Math.min(100, pct));
  loadingBar.style.width = `${pct}%`;
  if (pct > 0) loadingPct.textContent = `Loading my voice… ${Math.round(pct)}%`;
}

let voiceReadyPromise = null;
function ensureVoiceReady() {
  if (isModelReady()) return Promise.resolve();
  if (voiceReadyPromise) return voiceReadyPromise;
  setLoadingVisible(true);
  voiceReadyPromise = loadModel(onModelProgress)
    .then(() => setLoadingVisible(false))
    .catch((err) => {
      console.error("Failed to load TTS model", err);
      loadingPct.textContent = "Couldn't load a voice — reading is unavailable right now.";
      setTimeout(() => setLoadingVisible(false), 2500);
    });
  return voiceReadyPromise;
}

async function openBook(file) {
  openError.textContent = "";
  try {
    const buffer = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;
    openScreen.hidden = true;
    readerScreen.hidden = false;
    await renderPage(currentPage);
  } catch (err) {
    console.error("Failed to open PDF", err);
    openError.textContent = "Couldn't open that file — please choose a PDF.";
  }
}

function closeBook() {
  stopSpeaking();
  pdfDoc = null;
  readerScreen.hidden = true;
  openScreen.hidden = false;
  fileInput.value = "";
}

async function renderPage(num) {
  if (!pdfDoc) return;
  stopSpeaking();
  readBtn.classList.remove("speaking");
  readBtn.textContent = "🔊 Read This Page";

  const page = await pdfDoc.getPage(num);
  const containerWidth = pageCanvas.parentElement.clientWidth - 20;
  const containerHeight = pageCanvas.parentElement.clientHeight - 20;
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(containerWidth / baseViewport.width, containerHeight / baseViewport.height);
  const viewport = page.getViewport({ scale: Math.max(scale, 0.1) });

  pageCanvas.width = viewport.width;
  pageCanvas.height = viewport.height;
  const ctx = pageCanvas.getContext("2d");

  if (renderTask) {
    try {
      renderTask.cancel();
    } catch {
      /* ignore */
    }
  }
  renderTask = page.render({ canvasContext: ctx, viewport });
  await renderTask.promise;

  pageIndicator.textContent = `Page ${num} of ${totalPages}`;
  prevBtn.disabled = num <= 1;
  nextBtn.disabled = num >= totalPages;
}

async function extractPageText(num) {
  const page = await pdfDoc.getPage(num);
  const content = await page.getTextContent();
  return content.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
}

async function readCurrentPage() {
  if (!pdfDoc) return;
  unlockAudio();
  const text = await extractPageText(currentPage);
  if (!text) {
    ensureVoiceReady().then(() => speak("This page doesn't have any readable text.", currentVoice));
    return;
  }
  readBtn.classList.add("speaking");
  readBtn.textContent = "🔊 Reading…";
  await ensureVoiceReady();
  await speak(text, currentVoice, {
    onEnd: () => {
      readBtn.classList.remove("speaking");
      readBtn.textContent = "🔊 Read This Page";
    },
  });
}

function goToPage(delta) {
  const target = currentPage + delta;
  if (target < 1 || target > totalPages) return;
  currentPage = target;
  renderPage(currentPage);
}

function init() {
  buildVoicePicker();

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) openBook(file);
  });

  prevBtn.addEventListener("click", () => {
    unlockAudio();
    goToPage(-1);
  });
  nextBtn.addEventListener("click", () => {
    unlockAudio();
    goToPage(1);
  });
  readBtn.addEventListener("click", () => {
    unlockAudio();
    readCurrentPage();
  });
  closeBookBtn.addEventListener("click", closeBook);
  speakerToggle.addEventListener("click", toggleMute);
  voiceToggle.addEventListener("click", () => {
    unlockAudio();
    toggleVoicePicker();
  });

  window.addEventListener("resize", () => {
    if (pdfDoc) renderPage(currentPage);
  });

  // Swipe support for touch devices
  let touchStartX = null;
  pageCanvas.parentElement.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
  });
  pageCanvas.parentElement.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      unlockAudio();
      goToPage(dx < 0 ? 1 : -1);
    }
    touchStartX = null;
  });
}

init();
