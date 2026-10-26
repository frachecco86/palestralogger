export function Footer({ className }: { className?: string }) {
  return (
    <footer className={`mx-auto w-full max-w-md px-4 pb-2 pt-7 text-center ${className ?? ''}`}>
      <p className="text-[9.5px] uppercase tracking-[0.22em] text-faint/80">
        <span className="font-semibold text-muted/90">CHECCO</span>{' '}
        <span className="normal-case tracking-[0.1em]">digital creaction</span>{' '}
        <span className="tabular tracking-[0.16em]">2026</span>
      </p>
    </footer>
  )
}
