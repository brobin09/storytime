# Storytime

A simple picture-book reader for kids. Open any PDF from your device, flip
through pages, and have a page read aloud on demand — fully on-device TTS,
no uploads, works offline after the first load.

- **Nothing leaves your device**: the PDF you open is read directly in the
  browser with `pdf.js`; it's never uploaded anywhere.
- **Real pages, not OCR**: pages render as images exactly as the PDF laid
  them out, so illustrations look right.
- **Read aloud on demand**: tap "Read This Page" to hear that page's text
  read by an on-device [Kokoro TTS](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
  voice (same engine as the [Spell & Discover](../spelling-app) app) — no
  server, no API key.
- **Kid-friendly navigation**: big tap-to-turn arrows, swipe support on
  touch devices, one clear action at a time.
- Installable as a PWA (works offline, add to home screen).

## Requirements

- [Node.js](https://nodejs.org/) 18+

## Getting started

```bash
git clone <this-repo-url>
cd storybook-reader
npm install
npm run dev
```

Open the URL Vite prints (defaults to `http://localhost:5766`), then tap
"Open a Book" and pick any PDF.

The first time you tap "Read This Page," the app downloads the Kokoro voice
model (~90MB) — after that it's cached in the browser and loads instantly.

## Building for production

```bash
npm run build
npm run preview
```

`npm run build` outputs a static site in `dist/` that can be hosted
anywhere (GitHub Pages, Netlify, Vercel, a plain static file server) — no
backend required.

## Notes

- If a PDF has no extractable text layer (e.g. it's fully scanned images
  with no OCR), "Read This Page" will say so — this reader doesn't run OCR
  itself.
- Audio plays via the Web Audio API (not the `<audio>` tag) for reliable
  playback across browsers, including Safari.
