import { UNION_OBJECT_SYNC_ENGINE_MANAGEMENT } from 'apis/NDXPRO/config';
import { useState } from 'react';

function UnionObjectSyncEngineManagement() {
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
        src={UNION_OBJECT_SYNC_ENGINE_MANAGEMENT}
        className="h-full w-full"
        onLoad={() => setIsIframeLoading(false)}
      />
    </>
  );
}
export default UnionObjectSyncEngineManagement;
