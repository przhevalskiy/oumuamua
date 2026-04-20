'use client';

// 3×4 sprite sheet — /agents-sheet.png (construction crew, row-major, idx 0–11)
// Row 0: [0 director/foreman, 1 clipboard/architect, 2 lumber/builder, 3 inspector-pointing]
// Row 1: [4 rope-coil,        5 small-tool,          6 hammer/builder2, 7 wrench/devops]
// Row 2: [8 welder/security,  9 crouching,           10 standing,       11 surveyor]

const SPRITE_COLS = 4;
const SPRITE_ROWS = 3;

export type SwarmRole =
  | 'foreman' | 'architect' | 'builder'
  | 'inspector' | 'security' | 'devops'
  | 'scout' | 'analyst' | 'verifier' | 'critic';

const ROLE_TO_SPRITE: Record<SwarmRole, number> = {
  foreman:   0,  // directing supervisor
  architect: 11, // surveyor — plans & measures
  builder:   2,  // carrying lumber
  inspector: 3,  // pointing/checking
  security:  8,  // welder mask — protective
  devops:    7,  // wrench — mechanical/deploy
  scout:     1,  // clipboard = scout
  analyst:   5,
  verifier:  9,
  critic:    10,
};

function spritePosition(idx: number) {
  const col = idx % SPRITE_COLS;
  const row = Math.floor(idx / SPRITE_COLS);
  const xPct = (col / (SPRITE_COLS - 1)) * 100;
  const yPct = (row / (SPRITE_ROWS - 1)) * 100;
  return { xPct, yPct };
}

export function ChibiAvatar({
  role,
  size = 32,
  spriteIdx,
  style,
}: {
  role?: SwarmRole;
  size?: number;
  spriteIdx?: number;
  style?: React.CSSProperties;
}) {
  const idx = spriteIdx ?? (role ? (ROLE_TO_SPRITE[role] ?? 0) : 0);
  const { xPct, yPct } = spritePosition(idx);

  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        overflow: 'hidden',
        backgroundImage: 'url(/agents-sheet.png)',
        backgroundSize: `${SPRITE_COLS * 100}% ${SPRITE_ROWS * 100}%`,
        backgroundPosition: `${xPct}% ${yPct}%`,
        backgroundRepeat: 'no-repeat',
        ...style,
      }}
    />
  );
}

export function spriteStyleForIdx(idx: number, size = 32): React.CSSProperties {
  const { xPct, yPct } = spritePosition(idx);
  return {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: '50%',
    overflow: 'hidden',
    backgroundImage: 'url(/agents-sheet.png)',
    backgroundSize: `${SPRITE_COLS * 100}% ${SPRITE_ROWS * 100}%`,
    backgroundPosition: `${xPct}% ${yPct}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export { ROLE_TO_SPRITE };
