export function DesktopNavigation() {
  return (
    <aside className="studio" aria-label="Vorschau-Navigation">
      <a className="wordmark" href="#home"><span className="brand-icon">♠</span><span>TOKEN<br /><strong>POKER FARM</strong></span></a>
      <div className="studio-copy"><span className="eyebrow">TELEGRAM MINI APP · 01</span><h1>Dein Spiel.<br />Dein Fortschritt.</h1><p>Poker im Mittelpunkt.<br />Ein Account, der mit dir wächst.</p></div>
      <nav id="studio-nav" />
      <div className="studio-note"><span className="live-dot" /> LOKALE ENTWICKLUNGSVORSCHAU<p>Spielablauf mit Demo-Gegnern.<br />Keine Echtgeld- oder Token-Funktionen.</p></div>
    </aside>
  );
}

export function DesignNote() {
  return (
    <aside className="design-note">
      <span className="eyebrow">STYLE 02 / AURORA</span>
      <div className="swatches"><i /><i /><i /></div>
      <p>Ein ruhiger Tisch.<br />Klare Entscheidungen.</p>
      <span className="note-line" />
      <small>Chips zum Spielen.<br />AP für deinen Fortschritt.<br />Immer getrennt.</small>
    </aside>
  );
}
