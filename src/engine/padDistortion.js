// Cached waveshaper curves for per-pad drum distortion (amount 0–1).

const curveCache = new Map();

export function getDistortionCurve(amount) {
  const key = Math.round(amount * 1000);
  let curve = curveCache.get(key);
  if (curve) return curve;

  const samples = 256;
  curve = new Float32Array(samples);
  const drive = 1 + amount * 48;
  const norm = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = norm > 0 ? Math.tanh(drive * x) / norm : x;
  }
  curveCache.set(key, curve);
  return curve;
}
