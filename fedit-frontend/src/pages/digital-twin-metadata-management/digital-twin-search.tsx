import { DIGITALSEARCH_URL } from 'apis/NDXPRO/config';
import { useState } from 'react';

export default function DigitalTwinSearch() {
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  return (
    <>
      {isIframeLoading && (
        <div className="loading-mask">
          <div className="loading-mask__spinner" />
        </div>
      )}
      <iframe
        title="digital-twin-search"
        src={DIGITALSEARCH_URL}
        className="h-full w-full"
        onLoad={() => setIsIframeLoading(false)}
      />
    </>
  );
}
