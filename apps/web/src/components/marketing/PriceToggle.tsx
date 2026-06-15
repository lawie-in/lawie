'use client';

interface PriceToggleProps {
  period: 'monthly' | 'yearly';
  onChange: (period: 'monthly' | 'yearly') => void;
}

export default function PriceToggle({ period, onChange }: PriceToggleProps) {
  return (
    <div className="price-toggle">
      <button
        type="button"
        data-period="monthly"
        className={period === 'monthly' ? 'is-active' : ''}
        onClick={() => onChange('monthly')}
      >
        Monthly
      </button>
      <button
        type="button"
        data-period="yearly"
        className={period === 'yearly' ? 'is-active' : ''}
        onClick={() => onChange('yearly')}
      >
        Annual <span className="save-badge">Save 2 months</span>
      </button>
    </div>
  );
}
