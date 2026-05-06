import { useState } from 'react';

export default function Vizwide3dGuide() {
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
        title="vizwide3d-guide"
        src="https://www.softhills.net/SHDC/VIZWide3D/vizwide3d.html"
        onLoad={() => setIsIframeLoading(false)}
      />
    </>
  );
}
