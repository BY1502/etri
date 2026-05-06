import { METADATA_VISUALIZATION_GRAPH } from 'apis/NDXPRO/config';
import { useState } from 'react';

function MetadataVisualizationGraph() {
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  return (
    <>
      {isIframeLoading && (
        <div className="loading-mask">
          <div className="loading-mask__spinner" />
        </div>
      )}
      <iframe
        title="metadata-visualization-graph"
        src={METADATA_VISUALIZATION_GRAPH}
        className="h-full w-full"
        onLoad={() => setIsIframeLoading(false)}
      />
    </>
  );
}
export default MetadataVisualizationGraph;
