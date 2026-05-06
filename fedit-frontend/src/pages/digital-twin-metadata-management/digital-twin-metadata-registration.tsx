import { DIGITALTWINMETADATAREGISTRATION_URL } from 'apis/NDXPRO/config';
import { useState } from 'react';

function DigitalTwinMetadataRegistration() {
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  return (
    <>
      {isIframeLoading && (
        <div className="loading-mask">
          <div className="loading-mask__spinner" />
        </div>
      )}
      <iframe
        title="digital-twin-metadata-registration"
        src={DIGITALTWINMETADATAREGISTRATION_URL}
        className="h-full w-full"
        onLoad={() => setIsIframeLoading(false)}
      />
    </>
  );
}
export default DigitalTwinMetadataRegistration;
