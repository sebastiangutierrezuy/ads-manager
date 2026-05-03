'use client';

import { useState } from 'react';

const PAGE_SIZE = 6;

export default function AdGrid({ children }) {
  const all = Array.isArray(children) ? children : [children];
  const [visible, setVisible] = useState(PAGE_SIZE);

  const shown = all.slice(0, visible);
  const remaining = all.length - visible;
  const hasMore = remaining > 0;

  return (
    <>
      <div className="ad-list-grid">{shown}</div>
      {hasMore && (
        <div className="ad-load-more-wrap">
          <button
            type="button"
            className="ad-load-more"
            onClick={() => setVisible(v => v + PAGE_SIZE)}
          >
            Cargar más {remaining > PAGE_SIZE ? `(${PAGE_SIZE} de ${remaining} restantes)` : `(${remaining} restantes)`}
          </button>
        </div>
      )}
    </>
  );
}
