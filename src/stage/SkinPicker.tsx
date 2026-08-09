/**
 * SkinPicker — minimal per-color skin selection panel (PLAN-PHASE-4 §5.4).
 *
 * Stage-layer DOM overlay. One row per color, a button per TOKEN_SKINS entry.
 * Calls cosmeticsStore.setSkin on click. Highlight the active skin.
 */

import { useState } from 'react';
import { useCosmetics } from '../store/cosmeticsStore';
import { TOKEN_SKINS } from '../theme/tokenSkins';
import type { Color } from '../oracle/board/track';

const COLORS: Color[] = ['red', 'green', 'yellow', 'blue'];
const COLOR_HEX: Record<Color, string> = {
  red: '#e74c3c', green: '#2ecc71', yellow: '#f1c40f', blue: '#3498db',
};

export function SkinPicker() {
  const skins = useCosmetics((s) => s.skins);
  const setSkin = useCosmetics((s) => s.setSkin);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '6px 12px', border: 'none', borderRadius: 8,
          background: '#555', color: 'white', cursor: 'pointer', fontSize: 14,
        }}
      >
        🎨 Skins
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(20,20,20,0.95)', borderRadius: 12, padding: 16,
          color: 'white', fontFamily: 'system-ui', fontSize: 13,
          display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'auto',
        }}>
          {COLORS.map((color) => (
            <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: COLOR_HEX[color], fontWeight: 700, width: 50, textTransform: 'capitalize' }}>
                {color}
              </span>
              {Object.values(TOKEN_SKINS).map((skin) => (
                <button
                  key={skin.id}
                  onClick={() => setSkin(color, skin.id)}
                  style={{
                    padding: '4px 10px', border: 'none', borderRadius: 6,
                    background: skins[color] === skin.id ? COLOR_HEX[color] : '#333',
                    color: 'white', cursor: 'pointer', fontSize: 12,
                    fontWeight: skins[color] === skin.id ? 700 : 400,
                  }}
                >
                  {skin.label}
                </button>
              ))}
            </div>
          ))}
          <button
            onClick={() => setOpen(false)}
            style={{ marginTop: 4, padding: '4px', background: 'transparent', color: '#888', border: 'none', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}
