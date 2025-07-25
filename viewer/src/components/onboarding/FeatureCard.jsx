import React from 'react';

const FeatureCard = () => {
  return (
    <div className="grid md:grid-cols-3 gap-6 mb-4">
      {[
        {
          color: 'green',
          title: 'Open Source BI-As-Code',
          description: "We're committed to OSS. BI-as-code made easy. Extend your lineage into BI.",
          iconPath:
            'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        },
        {
          color: 'purple',
          title: 'Leverage Insights Faster',
          description:
            "10x your data team's productivity. Fast UI and zero noise for stakeholders.",
          iconPath:
            'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
        },
        {
          color: 'orange',
          title: 'Data Centric Collaboration',
          description: 'Unlock data-centric collaboration across your organization.',
          iconPath:
            'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z',
        },
      ].map(({ color, title, description, iconPath }, idx) => (
        <div key={idx} className="bg-white rounded-xl p-6 shadow-lg">
          <div
            className={`w-12 h-12 bg-${color}-100 rounded-lg flex items-center justify-center mb-4`}
          >
            <svg
              className={`w-6 h-6 text-${color}-600`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path d={iconPath} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
            </svg>
          </div>
          <h4 className="text-lg font-semibold text-gray-800 mb-2">{title}</h4>
          <p className="text-gray-600 text-sm">{description}</p>
        </div>
      ))}
    </div>
  );
};

export default FeatureCard;
