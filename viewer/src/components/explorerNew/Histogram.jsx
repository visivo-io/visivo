import React from 'react';

const Histogram = ({ data }) => {
  if (!data || !data.buckets || data.buckets.length === 0) return null;

  const { buckets, total_count } = data;
  const maxCount = Math.max(...buckets.map(b => b.count));
  const isCategorical = buckets[0].value !== undefined;

  return (
    <div>
      <h4 className="text-xs font-medium text-secondary-600 uppercase tracking-wide mb-2">
        {isCategorical ? 'Top Values' : 'Distribution'}
      </h4>
      <div className="space-y-1">
        {buckets.map((bucket, i) => {
          const label = isCategorical ? String(bucket.value) : bucket.range;
          const pct = total_count > 0 ? ((bucket.count / total_count) * 100).toFixed(1) : '0.0';
          const barWidth = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;

          return (
            <div key={i} className="group">
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-secondary-600 truncate max-w-[160px]" title={label}>
                  {label}
                </span>
                <span className="text-secondary-400 ml-2 whitespace-nowrap">
                  {bucket.count.toLocaleString()} ({pct}%)
                </span>
              </div>
              <div className="h-3 w-full bg-secondary-100 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-primary-400 rounded-sm transition-all duration-200 group-hover:bg-primary-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {total_count != null && (
        <p className="text-xs text-secondary-400 mt-2">
          Total: {total_count.toLocaleString()} values
        </p>
      )}
    </div>
  );
};

export default Histogram;
