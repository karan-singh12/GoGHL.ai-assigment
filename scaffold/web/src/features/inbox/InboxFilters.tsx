import clsx from 'clsx';
import { INBOX_FILTERS, type InboxFilter } from '../../domain/types';

const LABEL: Record<InboxFilter, string> = { open: 'Open', mine: 'Mine', closed: 'Closed', all: 'All' };

export function InboxFilters({ value, onChange }: { value: InboxFilter; onChange: (f: InboxFilter) => void }) {
  return (
    <div className="tabs" role="tablist" aria-label="Filter conversations">
      {INBOX_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          role="tab"
          aria-selected={value === f}
          className={clsx('tab', value === f && 'tab--active')}
          onClick={() => onChange(f)}
        >
          {LABEL[f]}
        </button>
      ))}
    </div>
  );
}
