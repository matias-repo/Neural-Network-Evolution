// Pixel-art sprite data and draw utility.
// Sprites are 10×10 pixels, displayed at SCALE px per pixel.
// Color index 0 = transparent, 1-6 = palette entry (1-based).
//
// All frames face RIGHT; flip horizontally when agent faces left.

const SPRITES = (() => {
  // ── Palettes ────────────────────────────────────────────────────────────────
  //                    1 body        2 belly       3 pink        4 dark        5 eye         6 white
  const PAL_BUNNY = ['#b8bcf0',    '#d8dcff',    '#ff88b0',    '#28244a',    '#080416',    '#ffffff'];
  const PAL_FOX   = ['#c83c18',    '#e06030',    '#f0a050',    '#180804',    '#ffe050',    '#ffffff'];

  // ── Bunny (prey) ─────────────────────────────────────────────────────────────
  //  1=body 2=belly 3=pink(ears/nose) 4=dark 5=eye-pupil 6=white(sclera)
  const bWalkA = [
    [0,0,4,1,0,0,1,4,0,0],
    [0,0,4,1,0,0,1,4,0,0],
    [0,0,4,3,0,0,3,4,0,0],
    [0,4,1,1,1,1,1,1,4,0],
    [4,1,1,6,5,1,1,1,4,0],
    [4,1,1,1,3,1,1,1,4,0],
    [0,4,1,2,1,1,2,1,4,0],
    [0,0,4,1,1,1,1,4,0,0],
    [0,4,1,0,0,0,1,4,0,0],  // legs apart (walking)
    [0,4,0,0,0,0,0,4,0,0],
  ];
  const bWalkB = [
    [0,0,4,1,0,0,1,4,0,0],
    [0,0,4,1,0,0,1,4,0,0],
    [0,0,4,3,0,0,3,4,0,0],
    [0,4,1,1,1,1,1,1,4,0],
    [4,1,1,6,5,1,1,1,4,0],
    [4,1,1,1,3,1,1,1,4,0],
    [0,4,1,2,1,1,2,1,4,0],
    [0,0,4,1,1,1,1,4,0,0],
    [0,0,4,1,0,1,4,0,0,0],  // legs together (mid-hop)
    [0,0,0,4,0,4,0,0,0,0],
  ];
  const bFearA = [
    [4,3,0,0,0,0,0,3,4,0],  // ears laid flat/back
    [0,4,3,0,0,0,3,4,0,0],
    [0,0,4,1,1,1,4,0,0,0],
    [0,4,1,1,1,1,1,1,4,0],
    [4,1,5,6,1,5,6,1,4,0],  // wide open scared eyes (two pupils)
    [4,1,1,1,3,1,1,1,4,0],
    [0,4,1,2,1,1,2,1,4,0],
    [0,0,4,1,1,1,1,4,0,0],
    [0,4,1,0,0,0,1,4,0,0],
    [0,4,0,0,0,0,0,4,0,0],
  ];
  const bFearB = [
    [4,3,0,0,0,0,0,3,4,0],
    [0,4,3,0,0,0,3,4,0,0],
    [0,0,4,1,1,1,4,0,0,0],
    [0,4,1,1,1,1,1,1,4,0],
    [4,1,5,6,1,5,6,1,4,0],
    [4,1,1,1,3,1,1,1,4,0],
    [0,4,1,2,1,1,2,1,4,0],
    [0,4,1,1,1,1,1,4,0,0],  // wider/crouched body
    [0,0,4,1,1,1,4,0,0,0],  // legs tucked together
    [0,0,0,4,0,4,0,0,0,0],
  ];

  // ── Fox (predator) ─────────────────────────────────────────────────────────
  //  1=red-orange body 2=lighter belly 3=snout 4=dark 5=yellow eye 6=white
  const fWalkA = [
    [0,0,4,1,4,4,1,4,0,0],  // pointed ears
    [0,4,1,1,1,1,1,1,4,0],
    [4,1,1,3,1,1,3,1,4,0],  // lighter cheek/muzzle
    [4,1,1,5,4,4,5,1,4,0],  // yellow eyes with dark pupils
    [0,4,3,3,3,3,3,4,0,0],  // snout/muzzle
    [0,4,1,2,1,1,2,4,0,0],
    [0,0,4,1,1,1,4,0,0,0],
    [0,0,4,2,1,2,4,0,0,0],
    [0,4,1,0,0,1,4,0,0,0],  // legs apart
    [0,4,0,0,0,0,4,0,0,0],
  ];
  const fWalkB = [
    [0,0,4,1,4,4,1,4,0,0],
    [0,4,1,1,1,1,1,1,4,0],
    [4,1,1,3,1,1,3,1,4,0],
    [4,1,1,5,4,4,5,1,4,0],
    [0,4,3,3,3,3,3,4,0,0],
    [0,4,1,2,1,1,2,4,0,0],
    [0,0,4,1,1,1,4,0,0,0],
    [0,0,4,2,1,2,4,0,0,0],
    [0,0,4,1,1,4,0,0,0,0],  // legs together
    [0,0,0,4,4,0,0,0,0,0],
  ];
  const fChaseA = [
    [0,4,1,4,4,1,4,0,0,0],  // leaning forward
    [4,1,1,1,1,1,1,4,0,0],
    [4,1,3,1,1,3,1,4,0,0],
    [4,5,4,1,1,4,5,4,0,0],  // intense eyes (wider)
    [4,3,3,3,3,3,4,0,0,0],  // snarling snout (shifted left)
    [0,4,2,1,1,2,4,0,0,0],
    [0,4,1,1,1,4,0,0,0,0],
    [0,0,4,2,2,4,0,0,0,0],
    [0,4,1,0,0,0,4,1,0,0],  // galloping – legs wide
    [0,4,0,0,0,0,0,4,0,0],
  ];
  const fChaseB = [
    [0,4,1,4,4,1,4,0,0,0],
    [4,1,1,1,1,1,1,4,0,0],
    [4,1,3,1,1,3,1,4,0,0],
    [4,5,4,1,1,4,5,4,0,0],
    [4,3,3,3,3,3,4,0,0,0],
    [0,4,2,1,1,2,4,0,0,0],
    [0,4,1,1,1,4,0,0,0,0],
    [0,0,4,2,2,4,0,0,0,0],
    [0,0,4,1,0,1,4,0,0,0],  // galloping – legs mid-stride
    [0,0,0,4,0,4,0,0,0,0],
  ];

  return {
    prey: {
      pal: PAL_BUNNY,
      walk:  [bWalkA, bWalkB],
      fear:  [bFearA, bFearB],
    },
    predator: {
      pal: PAL_FOX,
      walk:  [fWalkA, fWalkB],
      chase: [fChaseA, fChaseB],
    },
  };
})();

// Draw one sprite frame centred on (cx, cy).
// scale = screen pixels per sprite pixel.  flipX mirrors horizontally.
function drawSprite(ctx, frame, pal, cx, cy, scale, flipX) {
  const H = frame.length;
  const W = frame[0].length;
  const ox = Math.round(cx - W * scale / 2);
  const oy = Math.round(cy - H * scale / 2);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const ci = frame[py][flipX ? W - 1 - px : px];
      if (!ci) continue;
      ctx.fillStyle = pal[ci - 1];
      ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale);
    }
  }
}

// Draw sprite as a solid silhouette (used for shadow).
function drawSpriteShadow(ctx, frame, cx, cy, scale, flipX, color, alpha) {
  const H = frame.length;
  const W = frame[0].length;
  const ox = Math.round(cx - W * scale / 2);
  const oy = Math.round(cy - H * scale / 2);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const ci = frame[py][flipX ? W - 1 - px : px];
      if (!ci) continue;
      ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale);
    }
  }
  ctx.globalAlpha = 1;
}
