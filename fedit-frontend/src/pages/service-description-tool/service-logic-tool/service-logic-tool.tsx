import { SERVICELOGICTOOL_URL } from 'apis/NDXPRO/config';
import { useState } from 'react';

export default function ServiceLogicTool() {
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  return (
    <>
      {isIframeLoading && (
        <div className="loading-mask">
          <div className="loading-mask__spinner" />
        </div>
      )}
      <iframe
        title="service-logic-tool"
        src={SERVICELOGICTOOL_URL}
        className="predictor-creator-tool"
        onLoad={() => setIsIframeLoading(false)}
      />
    </>
  );
}
