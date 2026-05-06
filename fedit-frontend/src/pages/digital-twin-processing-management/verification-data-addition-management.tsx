import { VERIFICATION_DATA_ADDITION_MANAGEMENT } from 'apis/NDXPRO/config';
import { useState } from 'react';

function VerificationDataAdditionManagement() {
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  return (
    <>
      {isIframeLoading && (
        <div className="loading-mask">
          <div className="loading-mask__spinner" />
        </div>
      )}
      <iframe
        title="union-object-sync-engine-management"
        src={VERIFICATION_DATA_ADDITION_MANAGEMENT}
        className="h-full w-full"
        onLoad={() => setIsIframeLoading(false)}
      />
    </>
  );
}
export default VerificationDataAdditionManagement;
