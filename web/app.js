const $ = id => document.getElementById(id);
let file = null;
let objectURL = null;
let captions = [];
let activeIndex = -1;
const extensions = new Set(['mp4', 'mov', 'm4v', 'mp3', 'm4a', 'wav', 'webm']);

function setStatus(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function selectFile(candidate) {
  if (!candidate) return;
  const ext = candidate.name.split('.').pop().toLowerCase();
  if (!extensions.has(ext)) { setStatus('Choose MP4, MOV, M4V, MP3, M4A, WAV, or WebM.', true); return; }
  if (candidate.size > 800 * 1024 * 1024) { setStatus('Choose a file up to 800 MB.', true); return; }
  file = candidate;
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = URL.createObjectURL(file);
  const audio = ['mp3', 'm4a', 'wav'].includes(ext);
  $('player').hidden = audio;
  $('audio-player').hidden = !audio;
  const target = audio ? $('audio-player') : $('player');
  const other = audio ? $('player') : $('audio-player');
  other.pause(); other.removeAttribute('src');
  target.src = objectURL;
  $('preview').hidden = false;
  $('file-label').textContent = file.name.toUpperCase();
  $('transcribe').disabled = false;
  captions = []; render();
  setStatus(`${file.name} ready. Transcription runs on this computer.`);
}

$('media-input').addEventListener('change', event => selectFile(event.target.files[0]));
const dropzone = $('dropzone');
dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', event => { event.preventDefault(); dropzone.classList.remove('drag'); selectFile(event.dataTransfer.files[0]); });

$('transcribe').addEventListener('click', async () => {
  if (!file) return;
  const button = $('transcribe');
  button.disabled = true;
  setStatus('Transcribing… Keep this tab open. The first run also downloads the selected model.');
  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST', body: file,
      headers: {'X-File-Name': encodeURIComponent(file.name), 'X-Model-Size': $('model-size').value}
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Transcription failed.');
    captions = result.segments;
    render();
    setStatus(captions.length ? `Found ${captions.length} caption segments. Detected language: ${result.language}. Review and edit before exporting.` : 'No speech was detected. You can add captions manually.');
  } catch (error) { setStatus(error.message, true); }
  finally { button.disabled = false; }
});

function stamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00.000';
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

function seconds(input) {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})$/.exec(input.trim());
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function render() {
  const timeline = $('timeline');
  timeline.replaceChildren();
  $('caption-count').textContent = `${captions.length} CAPTION${captions.length === 1 ? '' : 'S'}`;
  $('export-srt').disabled = $('export-vtt').disabled = !captions.length;
  $('add-caption').disabled = !file;
  if (!captions.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    const quote = document.createElement('span'); quote.textContent = '—';
    const text = document.createElement('p'); text.textContent = 'Captions appear here after transcription.';
    empty.append(quote, text); timeline.append(empty); return;
  }
  captions.forEach((caption, index) => {
    const row = document.createElement('div'); row.className = 'caption' + (index === activeIndex ? ' active' : '');
    const times = document.createElement('div'); times.className = 'times';
    for (const key of ['start', 'end']) {
      const input = document.createElement('input'); input.type = 'text'; input.value = stamp(caption[key]);
      input.setAttribute('aria-label', `Caption ${index + 1} ${key} time`);
      input.addEventListener('change', () => { const value = seconds(input.value); if (Number.isFinite(value)) caption[key] = value; else setStatus('Use HH:MM:SS.mmm for timestamps.', true); input.value = stamp(caption[key]); });
      input.addEventListener('focus', () => jump(index));
      times.append(input);
    }
    const text = document.createElement('textarea'); text.value = caption.text; text.setAttribute('aria-label', `Caption ${index + 1} text`);
    text.addEventListener('input', () => caption.text = text.value);
    text.addEventListener('focus', () => jump(index));
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = `Remove caption ${index + 1}`; remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => { captions.splice(index, 1); activeIndex = -1; render(); });
    row.append(times, text, remove); timeline.append(row);
  });
}

function jump(index) {
  activeIndex = index;
  [...document.querySelectorAll('.caption')].forEach((row, i) => row.classList.toggle('active', i === index));
  const player = $('audio-player').hidden ? $('player') : $('audio-player');
  if (Number.isFinite(captions[index]?.start)) player.currentTime = captions[index].start;
}

$('add-caption').addEventListener('click', () => {
  const player = $('audio-player').hidden ? $('player') : $('audio-player');
  const start = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  captions.push({start, end: start + 2, text: ''});
  activeIndex = captions.length - 1; render();
  $('timeline').lastElementChild?.scrollIntoView({block: 'nearest'});
});

function exportCaptions(format) {
  const sorted = [...captions].sort((a, b) => a.start - b.start);
  for (const caption of sorted) {
    if (!Number.isFinite(caption.start) || !Number.isFinite(caption.end) || caption.start < 0 || caption.end <= caption.start || !caption.text.trim()) {
      setStatus('Every caption needs text and an end time later than its start time.', true); return;
    }
  }
  const lines = sorted.map((caption, i) => `${format === 'srt' ? `${i + 1}\n` : ''}${stamp(caption.start).replace('.', format === 'srt' ? ',' : '.')} --> ${stamp(caption.end).replace('.', format === 'srt' ? ',' : '.')}\n${caption.text.trim()}`).join('\n\n');
  const content = (format === 'vtt' ? 'WEBVTT\n\n' : '') + lines + '\n';
  const blob = new Blob([content], {type: format === 'srt' ? 'application/x-subrip' : 'text/vtt'});
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `${file?.name.replace(/\.[^.]+$/, '') || 'captions'}.${format}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  setStatus(`Downloaded ${link.download}.`);
}

$('export-srt').addEventListener('click', () => exportCaptions('srt'));
$('export-vtt').addEventListener('click', () => exportCaptions('vtt'));
