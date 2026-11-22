// Educational models only. No participant recordings or trained decoder weights.
export function seededRandom(seed = 17041) {
  let state = seed >>> 0;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
}
export function angularError(a, b) {
  const na = Math.hypot(...a), nb = Math.hypot(...b);
  if (na < 1e-8 || nb < 1e-8) return null;
  return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / na / nb))) * 180 / Math.PI;
}
export function directionPosterior(bearing, spread, rotation = 0) {
  const angle = (bearing + rotation) * Math.PI / 180;
  const center = [0.82 * Math.cos(angle), 0.82 * Math.sin(angle)];
  const points = [];
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) {
    if (!x && !y) continue;
    const gx = x / 3, gy = y / 3;
    points.push({x: gx, y: gy, q: Math.exp(-((gx-center[0])**2 + (gy-center[1])**2) / (2 * spread**2))});
  }
  const total = points.reduce((s, p) => s + p.q, 0);
  let mx = 0, my = 0, maximum = 0;
  for (const p of points) {
    p.q /= total;
    const norm = Math.hypot(p.x, p.y);
    mx += p.q * p.x / norm; my += p.q * p.y / norm;
    maximum = Math.max(maximum, p.q);
  }
  return {points, mean: [mx, my], r: Math.min(1, Math.hypot(mx, my)), exact: maximum**2,
    error: angularError([mx, my], [Math.cos(bearing*Math.PI/180), Math.sin(bearing*Math.PI/180)])};
}
export function simulateAdmission({gapRate = 0.004, serviceMs = 50, decoupled = false, seed = 17041} = {}) {
  const random = seededRandom(seed), trialBins = 500, trials = 120, steps = trials * trialBins;
  const queue = [], serviceBins = Math.max(1, Math.ceil(serviceMs / 10));
  let epoch = 1, capture = null, job = null, history = 0;
  let delivered = 0, completed = 0, rejected = 0, stale = 0, resets = 0, skipped = 0, neutral = 0;
  let workerEpoch = 0, rawPrefix = 0, usablePrefix = 0, opportunities = 0, invalid = 0;
  const budgets = new Set([5, 10, 25, 50, 100]);
  for (let i = 0; i < steps; i++) {
    if (job && i >= job.finish) {
      if (job.epoch !== workerEpoch) { workerEpoch = job.epoch; rawPrefix = 0; usablePrefix = 0; }
      rawPrefix++; if (job.valid && rawPrefix <= 100) usablePrefix++;
      if (budgets.has(rawPrefix) && usablePrefix >= 2 && job.epoch === epoch) opportunities++;
      job = null;
    }
    if (!job) {
      while (queue.length && queue[0].epoch !== epoch) { queue.shift(); stale++; }
      if (queue.length) { job = {...queue.shift(), finish: i + serviceBins}; delivered++; }
    }
    if (i % trialBins === 0) {
      if (queue.length >= 4) { capture = null; epoch++; rejected++; }
      else capture = {epoch, valid: true};
    }
    const gap = random() < gapRate;
    if (gap) {
      history = 0; resets++;
      if (capture) capture.valid = false;
      if (!decoupled) epoch++;
    } else history++;
    if (i % 2 === 1) { if (gap) skipped++; else if (history < 30) neutral++; }
    if ((i + 1) % trialBins === 0) {
      completed++;
      if (capture) {
        if (capture.epoch !== epoch) rejected++;
        else { queue.push({...capture}); if (!capture.valid) invalid++; }
      }
      capture = null; history = 0;
    }
  }
  return {completed, delivered, rejected, stale, resets, skipped, neutral, opportunities, invalid,
    pending: queue.length + Number(Boolean(job)), scheduled: steps/2};
}
