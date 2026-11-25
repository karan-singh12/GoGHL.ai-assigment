export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-label={label}>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="center-fill">
      <Spinner size={28} label={label} />
    </div>
  );
}
