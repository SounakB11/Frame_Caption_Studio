# Frame Caption Studio

A local caption workflow for video and audio. Import footage, transcribe speech, correct text and timestamps beside a media preview, then export SRT or WebVTT subtitles.

## Why I built it

As someone interested in videography and cinematography, I wanted a caption tool that keeps the editing step visible. Automatic transcription is a useful draft; the final wording, timing, names, and punctuation still need a human pass.

## Features

- Local speech transcription with [faster-whisper](https://github.com/SYSTRAN/faster-whisper) running on CPU; choose tiny, base, or small model.
- MP4, MOV, M4V, MP3, M4A, WAV, and WebM input up to 150 MB.
- Preview media and jump to a caption's start time by selecting its text or timestamps.
- Edit, add, and remove caption segments, with timestamp validation on export.
- Download corrected captions as SRT or WebVTT.
- Loopback-only local server (`127.0.0.1`); each uploaded file is removed from temporary storage after processing. No account or API key.

## Run on macOS

Requires Python 3.10 or newer and an internet connection **on first use** to download the chosen transcription model. The packaged PyAV decoder used by faster-whisper handles supported media formats; a separate FFmpeg command-line installation is not required for this app.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

Open **http://127.0.0.1:8765**. Choose a short clip for the first run and select the **Tiny** model if you want the quickest trial. Click **Transcribe file**, correct the captions, and download SRT or VTT. Press Control-C in Terminal to stop the server.

## Architecture

The browser uploads the selected file to a Python standard-library HTTP server bound to loopback. The server validates size, extension, and model choice, writes a temporary media file, runs faster-whisper, returns caption segments as JSON, and removes the temporary file. The browser keeps the editing state in memory and generates exports directly. Files and captions are not stored in a database or sent to a third-party API by this app. The first model download connects to the model host.

## Limits and next improvements

- Speech transcription quality varies with background music, names, accents, and language. Review every caption against the source.
- Captions are based on model segments, which may be long. A future version could split long captions using word timestamps and reading-speed rules.
- A local browser session does not persist edits. Export before closing or refreshing.
- There is no speaker identification or burned-in video rendering. The current deliverable is a subtitle file for an editor or video platform.
- There is a 150 MB upload cap, and CPU transcription can take several minutes for long footage.

## Portfolio summary

**Frame Caption Studio** — Built a local video-caption workflow with CPU speech transcription, an editable timestamped timeline, synchronized media preview, and SRT/VTT export. Designed around a real post-production step: reviewing machine-generated captions before delivery.

## Attribution

Transcription uses the open-source faster-whisper implementation. This repository contains the application and editing workflow, not the transcription model itself. Review upstream model and package licenses before redistributing model weights.
