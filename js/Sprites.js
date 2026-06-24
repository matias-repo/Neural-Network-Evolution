// Pixel-art sprite data and draw utilities.
// All frames are 10×10 pixels in side-profile facing RIGHT.
// Flip horizontally when the agent faces left.
// Color index 0 = transparent, 1-6 = palette entry (1-based).

const SPRITES = (() => {

  // ── Palettes ─────────────────────────────────────────────────────────────────
  //                    1 fur-main     2 belly-light  3 nose/inner-ear  4 outline      5 eye          6 tail/accent
  const PAL_RABBIT = ['#b0b8d0',    '#d0d8f0',     '#b84870',        '#0e0e1c',     '#060412',     '#eceeff'];
  const PAL_FOX    = ['#b83010',    '#e0a040',     '#d06020',        '#120804',     '#cc9810',     '#f0ecd8'];

  // ── Rabbit (prey) ─────────────────────────────────────────────────────────────
  // Side profile facing RIGHT. Head (ears, eye, nose) at right; white tail at left.
  // Rows 0-2 = upright ears; 3-6 = round body; 7-9 = legs.

  const bWalkA = [            // stride: hind leg back, front leg forward
    [0,0,0,0,0,4,3,4,0,0],   // r0  ear tip
    [0,0,0,0,4,1,3,1,4,0],   // r1  ear
    [0,0,0,0,4,1,3,1,4,0],   // r2  ear
    [0,0,4,1,1,1,1,1,4,0],   // r3  upper body / head base
    [0,6,4,1,2,1,1,5,4,0],   // r4  tail(6), belly, eye(5)
    [0,6,4,1,2,2,1,1,3,4],   // r5  tail, belly, pink nose(3) at tip
    [0,6,4,1,1,1,1,1,4,0],   // r6  tail, lower body
    [0,0,4,1,1,1,1,4,0,0],   // r7  narrowing body
    [0,4,1,4,0,0,4,1,4,0],   // r8  hind leg (L), front leg (R)
    [0,4,4,0,0,0,0,4,4,0],   // r9  feet
  ];
  const bWalkB = [            // stride: legs tucked / landing
    [0,0,0,0,0,4,3,4,0,0],
    [0,0,0,0,4,1,3,1,4,0],
    [0,0,0,0,4,1,3,1,4,0],
    [0,0,4,1,1,1,1,1,4,0],
    [0,6,4,1,2,1,1,5,4,0],
    [0,6,4,1,2,2,1,1,3,4],
    [0,6,4,1,1,1,1,1,4,0],
    [0,0,4,1,1,1,1,4,0,0],
    [0,4,4,4,0,4,4,4,0,0],   // r8  legs closer together
    [0,0,4,4,0,0,4,4,0,0],   // r9
  ];

  const bFearA = [            // scared: ears swept flat back, both eyes visible
    [0,4,3,1,4,0,0,0,0,0],   // r0  ear laid back toward tail
    [4,1,3,1,4,0,0,0,0,0],   // r1
    [4,1,1,1,1,4,1,1,4,0],   // r2  head forming
    [0,4,1,1,1,1,1,1,4,0],   // r3
    [0,6,4,1,5,1,5,1,3,4],   // r4  both eyes wide (scared), nose
    [0,6,4,1,2,2,1,1,4,0],   // r5  tail, belly
    [0,6,4,1,1,1,1,1,4,0],   // r6
    [0,0,4,1,1,1,1,4,0,0],   // r7
    [0,4,1,4,0,0,4,1,4,0],   // r8
    [0,4,4,0,0,0,0,4,4,0],   // r9
  ];
  const bFearB = [            // scared + crouched
    [0,4,3,1,4,0,0,0,0,0],
    [4,1,3,1,4,0,0,0,0,0],
    [4,1,1,1,1,4,1,1,4,0],
    [0,4,1,1,1,1,1,1,4,0],
    [0,6,4,1,5,1,5,1,3,4],
    [0,6,4,1,2,2,2,1,4,0],
    [0,6,4,1,1,2,1,1,4,0],
    [0,0,4,1,1,1,1,4,0,0],
    [0,4,4,4,0,0,4,4,0,0],   // r8  legs tucked/crouched
    [0,0,4,4,0,0,4,4,0,0],
  ];

  // ── Fox (predator) ─────────────────────────────────────────────────────────────
  // Side profile facing RIGHT. Pointed snout at right; bushy tail (with white tip) at left.
  // Triangular ear at rows 0-1, cols 5-7 (above head).

  const fWalkA = [            // stride A
    [0,0,0,0,0,4,1,4,0,0],   // r0  triangular ear
    [0,0,0,0,4,1,1,4,0,0],   // r1  ear body
    [1,4,0,0,4,1,5,4,0,0],   // r2  bushy tail (1), body, amber eye(5)
    [1,1,4,4,1,1,1,3,4,0],   // r3  tail, body, cream muzzle start(3)
    [1,1,4,1,1,2,1,3,6,4],   // r4  tail, belly(2), muzzle, white snout tip(6)
    [3,1,4,1,2,2,1,1,4,0],   // r5  lighter tail fur(3), belly
    [6,4,4,1,1,1,1,4,0,0],   // r6  white tail tip(6), lower body
    [0,0,4,1,1,1,4,0,0,0],   // r7  body base
    [0,4,1,4,0,4,1,4,0,0],   // r8  hind leg (L), front leg (R)
    [0,4,4,0,0,0,4,4,0,0],   // r9  feet
  ];
  const fWalkB = [            // stride B
    [0,0,0,0,0,4,1,4,0,0],
    [0,0,0,0,4,1,1,4,0,0],
    [1,4,0,0,4,1,5,4,0,0],
    [1,1,4,4,1,1,1,3,4,0],
    [1,1,4,1,1,2,1,3,6,4],
    [3,1,4,1,2,2,1,1,4,0],
    [6,4,4,1,1,1,1,4,0,0],
    [0,0,4,1,1,1,4,0,0,0],
    [0,4,4,4,0,4,4,4,0,0],   // r8  different stride
    [0,0,4,4,0,0,4,4,0,0],
  ];

  const fChaseA = [           // galloping chase, leaned forward
    [0,0,0,0,4,1,4,0,0,0],   // r0  ear more forward/flattened
    [0,0,0,4,1,1,4,0,0,0],   // r1
    [1,4,0,4,1,5,1,4,0,0],   // r2  tail, head leaned forward, eye
    [1,1,4,1,1,1,3,3,4,0],   // r3  tail, body, prominent muzzle
    [1,1,4,1,2,1,3,6,4,0],   // r4  tail, belly, snout tip
    [3,1,4,1,2,2,1,4,0,0],   // r5  tail, belly
    [6,4,4,1,1,1,4,0,0,0],   // r6  body shorter / leaned
    [0,4,1,4,1,4,1,4,0,0],   // r7  wide gallop stance
    [4,1,4,0,4,0,4,1,4,0],   // r8  galloping legs spread
    [4,4,0,0,0,0,0,4,4,0],   // r9  feet wide
  ];
  const fChaseB = [           // galloping phase 2: legs tucked (mid-leap)
    [0,0,0,0,4,1,4,0,0,0],
    [0,0,0,4,1,1,4,0,0,0],
    [1,4,0,4,1,5,1,4,0,0],
    [1,1,4,1,1,1,3,3,4,0],
    [1,1,4,1,2,1,3,6,4,0],
    [3,1,4,1,2,2,1,4,0,0],
    [6,4,4,1,1,1,4,0,0,0],
    [0,0,4,4,4,4,4,0,0,0],   // r7  legs tucked under body
    [0,0,0,4,4,4,4,0,0,0],   // r8
    [0,0,0,0,4,4,0,0,0,0],   // r9  minimal ground contact
  ];

  return {
    prey: {
      pal:  PAL_RABBIT,
      walk: [bWalkA, bWalkB],
      fear: [bFearA, bFearB],
    },
    predator: {
      pal:   PAL_FOX,
      walk:  [fWalkA, fWalkB],
      chase: [fChaseA, fChaseB],
    },
  };
})();

// ── Draw utilities ─────────────────────────────────────────────────────────────

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
