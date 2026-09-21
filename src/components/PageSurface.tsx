import { useLayoutEffect } from 'react';

interface PageSurfaceProps {
  page: string;
}

export function PageSurface({ page }: PageSurfaceProps) {
  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('tpf:react-view-ready'));
      window.__TPF_RENDER__?.();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [page]);

  return (
    <section id="view" data-react-page={page} tabIndex={-1}>
      <div className="loading"><span className="spinner" />Dein Tisch wird vorbereitet …</div>
    </section>
  );
}
