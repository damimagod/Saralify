# Saralify

A photo-translation tool for Indian banking forms, aimed at people who find financial paperwork hard to read in English.

- **index.html** — photograph a document; it's read with on-device OCR and translated.
- **forms.html** — a library of 14 common banking forms, translated.
- **speak.html** — type or speak text; it's translated and read aloud.

## How it works

This build runs entirely in the browser, with no backend and no API keys:

- **Translation** uses Google Translate's public endpoint (the same service behind translate.google.com, called directly). It's free and needs no key, but it's unofficial and could be rate-limited or changed by Google without notice.
- **Reading a photo** uses [Tesseract.js](https://github.com/naptha/tesseract.js), an open-source OCR engine that runs client-side.
- **Voice** uses the browser's own Web Speech API (`speechSynthesis` for playback, `SpeechRecognition` for dictation) — quality depends entirely on what's installed on the visitor's device.

**Known limits:** OCR accuracy drops on messy photos, skewed angles, or handwriting. Translation quality for the languages Google Translate added more recently (Dogri, Konkani, Manipuri, Mizo, Sanskrit, Khasi) is noticeably weaker than for its long-established languages.

## Deploying on GitHub Pages

1. Create a new repository and push these 5 files (`index.html`, `forms.html`, `speak.html`, `app.js`, `theme.css`) to its root (or to a `/docs` folder).
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch", pick your branch, and the folder (`/root` or `/docs`).
4. Save. GitHub gives you a URL like `https://<username>.github.io/<repo>/` within a minute or two.

No build step, no dependencies to install — it's static HTML/CSS/JS.
