/* "Design a disk": a scaling sketch, not a simulation of our hardware.
   Plain thin-disk bending modes scale as f ∝ (t / d²) · √(E / ρ), so with the same metal the first mode
   is relative to the SoundOff-style disk (14 mm, 1 mm). Notch effects below are a toy. */
export function initLab() {
  const $ = (s) => document.querySelector(s);
  const d = $('#lab-d'), t = $('#lab-t'), n = $('#lab-n');
  const disk = $('#lab-disk').getContext('2d'), spec = $('#lab-spec').getContext('2d');
  const read = $('#lab-read');

  function draw() {
    const D = +d.value, T = +t.value, N = +n.value;
    $('#o-d').textContent = D + ' mm'; $('#o-t').textContent = T + ' mm'; $('#o-n').textContent = N;

    // disk drawing (radius scales with diameter)
    disk.clearRect(0, 0, 360, 360);
    const R = (D / 16) * 160, cx = 180, cy = 180;
    const g = disk.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#eef3f4'); g.addColorStop(1, '#7f8d91');
    disk.fillStyle = g; disk.beginPath(); disk.arc(cx, cy, R, 0, 7); disk.fill();
    disk.globalCompositeOperation = 'destination-out';
    disk.beginPath(); disk.arc(cx, cy, R * 0.22, 0, 7); disk.fill();
    for (let i = 0; i < N; i++) {
      const a = (i / Math.max(N, 1)) * Math.PI * 2 + 0.4;
      disk.save(); disk.translate(cx, cy); disk.rotate(a);
      disk.fillRect(R * 0.78, -R * 0.07 - (i % 3) * R * 0.02, R * 0.3, R * (0.14 + (i % 3) * 0.04)); disk.restore();
    }
    disk.globalCompositeOperation = 'source-over';
    disk.strokeStyle = 'rgba(53,224,255,.25)'; disk.setLineDash([4, 6]); disk.beginPath(); disk.arc(cx, cy, 170, 0, 7); disk.stroke(); disk.setLineDash([]);

    // spectrum: relative frequency, 1.0 = first mode of the SoundOff-style disk
    const f0 = (T / 1) * Math.pow(14 / D, 2);
    const W = 720, H = 300, X = (f) => 30 + (f / 12) * (W - 50);
    spec.clearRect(0, 0, W, H);
    spec.strokeStyle = 'rgba(255,255,255,.12)'; spec.fillStyle = '#9FB0B3'; spec.font = '12px JetBrains Mono, monospace';
    for (let f = 0; f <= 12; f += 2) { spec.beginPath(); spec.moveTo(X(f), 20); spec.lineTo(X(f), H - 30); spec.stroke(); spec.fillText(f + '×', X(f) - 6, H - 10); }
    spec.strokeStyle = 'rgba(255,159,67,.8)'; spec.setLineDash([5, 5]); spec.beginPath(); spec.moveTo(X(1), 20); spec.lineTo(X(1), H - 30); spec.stroke(); spec.setLineDash([]);
    spec.fillStyle = '#FF9F43'; spec.fillText('SoundOff-style first mode', X(1) + 6, 32);
    const peaks = [];
    for (let m = 1; m <= 4; m++) {
      const base = f0 * Math.pow(m, 1.7) * (1 - 0.01 * N);
      peaks.push([base, 1 / m]);
      if (N > 0) peaks.push([base * (1 + 0.02 * N), 0.6 / m]);   // notches split modes (toy)
    }
    peaks.forEach(([f, a]) => {
      if (f > 12) return;
      const h = (H - 70) * a, x = X(f);
      const gg = spec.createLinearGradient(0, H - 30 - h, 0, H - 30);
      gg.addColorStop(0, '#35E0FF'); gg.addColorStop(1, 'rgba(53,224,255,.1)');
      spec.fillStyle = gg; spec.shadowColor = '#35E0FF'; spec.shadowBlur = 10; spec.fillRect(x - 2, H - 30 - h, 4, h); spec.shadowBlur = 0;
    });
    read.textContent = `First mode ≈ ${f0.toFixed(2)}× the SoundOff-style disk · scaling only, measure the real disk`;
  }
  [d, t, n].forEach((el) => el.addEventListener('input', draw));
  document.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    const p = b.dataset.p === 'soundoff' ? [14, 1, 3] : [9.5, 0.25, 3]; // 0.254 mm shim → slider's 0.25 step
    d.value = p[0]; t.value = p[1]; n.value = p[2]; draw();
  }));
  draw();
}
