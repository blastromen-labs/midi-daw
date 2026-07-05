const AUDIO_EXT = /\.(wav|mp3|aiff|aif|flac|ogg|m4a|aac|webm)$/i;

export function isAudioFile(file) {
  if (!file) return false;
  if (file.type?.startsWith('audio/')) return true;
  return AUDIO_EXT.test(file.name);
}

/** First audio file from an OS drag-and-drop payload, if any. */
export function audioFileFromDataTransfer(dataTransfer) {
  if (!dataTransfer?.files?.length) return null;
  for (const file of dataTransfer.files) {
    if (isAudioFile(file)) return file;
  }
  return null;
}
