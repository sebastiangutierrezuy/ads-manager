import Link from 'next/link';
import { METRIC_CONFIG } from '@/lib/metrics';

const TAB_ORDER = ['spend', 'reach', 'clicks', 'results'];

export default function MetricTabs({ current = 'reach', basePath, searchParams = {} }) {
  return (
    <div className="metric-tabs">
      {TAB_ORDER.map(id => {
        const params = new URLSearchParams();
        // Preservamos period / since / until si están en la URL
        for (const key of ['period', 'since', 'until']) {
          if (searchParams[key]) params.set(key, searchParams[key]);
        }
        if (id !== 'reach') params.set('metric', id);
        const qs = params.toString();
        const href = qs ? `${basePath}?${qs}` : basePath;
        return (
          <Link
            key={id}
            href={href}
            className={`metric-tab ${current === id ? 'active' : ''}`}
            scroll={false}
            prefetch={false}
          >
            {METRIC_CONFIG[id].label}
          </Link>
        );
      })}
    </div>
  );
}
