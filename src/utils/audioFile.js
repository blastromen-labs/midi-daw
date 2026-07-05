const AUDIO_EXT = /\.(wav|mp3|aiff|aif|aifc|flac|ogg|m4a|aac|webm|caf|opus)$/i;

export function isAudioFile(file) {
  if (!file) return false;
  const type = file.type?.toLowerCase() ?? '';
  if (type.startsWith('audio/')) return true;
  if (type === 'application/octet-stream' && AUDIO_EXT.test(file.name)) return true;
  return AUDIO_EXT.test(file.name);
}

export function hasFileDrag(dataTransfer) {
  if (!dataTransfer) return false;
  if (dataTransfer.files?.length) return true;
  if (!dataTransfer.types?.length) return false;
  return [...dataTransfer.types].some(
    (t) =>
      t === 'Files' ||
      t === 'application/x-moz-file' ||
      t === 'public.file-url' ||
      t === 'public.data'
  );
}

/** Call on dragenter/dragover so the browser allows a subsequent drop. */
export function acceptFileDrag(e) {
  if (!hasFileDrag(e.dataTransfer)) return false;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
  return true;
}

/** Raw file from a drop payload — WebKit often only exposes this via `items`. */
export function fileFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return null;

  const { files } = dataTransfer;
  if (files?.length) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file) return file;
    }
  }

  const { items } = dataTransfer;
  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind !== 'file') continue;
      const file = items[i].getAsFile();
      if (file) return file;
    }
  }

  return null;
}

/** First audio file from an OS drag-and-drop payload, if any. */
export function audioFileFromDataTransfer(dataTransfer) {
  const file = fileFromDataTransfer(dataTransfer);
  if (!file) return null;
  if (isAudioFile(file)) return file;
  // OS drags often omit MIME type — trust a single dropped file.
  const count = Math.max(dataTransfer?.files?.length ?? 0, dataTransfer?.items?.length ?? 0);
  if (count <= 1) return file;
  return null;
}
