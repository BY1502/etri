import { useState } from 'react';

export default function JejuApi() {
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  return (
    <>
      {isIframeLoading && (
        <div className="loading-mask">
          <div className="loading-mask__spinner" />
        </div>
      )}
      <iframe
        className="h-full w-full"
        title="jeju-api"
        src="http://dev.jinwoosi.co.kr:8083/swagger-ui/index.html#/AirQuality/find_23"
        onLoad={() => setIsIframeLoading(false)}
      />
    </>
  );
}
