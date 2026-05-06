import Skeleton from 'components/skeleton/skeleton';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { formatDateParts } from 'utils/date';
import ModelInformation from './model-information';
import TimeDisplay from './time-display';

interface ModelInformationViewerProps {
  reload?: boolean;
}
function ModelInformationViewer({ reload }: ModelInformationViewerProps) {
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [is3DModelLoadingComplete, setIs3DModelLoadingComplete] =
    useState<boolean>(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [modelLoadingTime, setModelLoadingTime] = useState<Date | null>(null);
  const [durationInSeconds, setDurationInSeconds] = useState<number | null>(
    null,
  );
  const [shouldLoadIframe, setShouldLoadIframe] = useState(false);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const tourId = params.get('tour_id');

  useEffect(() => {
    // Set start time when the page loads
    const initialStartTime = new Date();
    setStartTime(initialStartTime);

    const timeoutId = setTimeout(() => {
      setShouldLoadIframe(true);
    }, 3500); // Add a delay before displaying the iframe

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const eventListener = (event: MessageEvent<any>) => {
      if (event.origin === window.location.origin) return;

      let data;
      try {
        data = event.data;
      } catch {
        console.error('Invalid JSON data');
        return;
      }

      if (data === `모델 로딩 완료 : ${tourId || '03'}`) {
        const loadingTime = new Date();
        setModelLoadingTime(loadingTime);

        if (startTime) {
          const duration = (loadingTime.getTime() - startTime.getTime()) / 1000; // Duration in seconds
          setDurationInSeconds(parseFloat(duration.toFixed(2))); // Rounded to 2 decimal places
        }

        setIs3DModelLoadingComplete(true);
      }
    };

    window.addEventListener('message', eventListener);
    return () => {
      window.removeEventListener('message', eventListener);
    };
  }, [startTime]);

  const startDateTime = startTime ? formatDateParts(startTime) : null;
  const endDateTime = modelLoadingTime
    ? formatDateParts(modelLoadingTime)
    : null;

  return (
    <div className="flex h-full w-full flex-col bg-[#dddfe2]">
      {!is3DModelLoadingComplete && (
        <div className="loading-mask">
          <div className="loading-mask__spinner" />
        </div>
      )}

      <div className="flex h-full w-full flex-col gap-4 p-4 lg:flex-row">
        <div className="flex flex-grow justify-center">
          {shouldLoadIframe && (
            <iframe
              title="iframe testing"
              src={
                tourId
                  ? `http://220.124.222.87/VIZWide3D/?tour_id=${tourId}`
                  : 'http://220.124.222.87/VIZWide3D/?tour_id=03'
              }
              className="h-[calc(100vh-24px)] w-full rounded-lg shadow-card lg:h-full"
              onLoad={() => {
                setIsIframeLoading(false);
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-4 lg:w-[540px]">
          <ModelInformation
            is3DModelLoaded={is3DModelLoadingComplete}
            tourId={tourId}
          />
          <TimeDisplay
            label="⏱️ 로딩 시작 시간"
            dateTime={startDateTime}
            isVisible={is3DModelLoadingComplete}
          />
          <TimeDisplay
            label="⏱️ 로딩 완료 시간"
            dateTime={endDateTime}
            isVisible={is3DModelLoadingComplete}
          />

          <div className="flex h-[100px] flex-col rounded-lg bg-white p-4 shadow-card">
            {is3DModelLoadingComplete ? (
              <>
                <p className="text-[18px] font-bold">⏱️ 로딩 시간</p>
                <div className="flex h-full flex-col justify-center pb-[16px]">
                  <p className="text-center font-sans text-[28px] font-bold">
                    {durationInSeconds !== null
                      ? `${durationInSeconds} 초`
                      : ''}
                  </p>
                </div>
              </>
            ) : (
              <>
                <Skeleton className="h-[27px] w-1/3 text-[18px] font-medium" />
                <div className="flex h-full flex-col justify-center pb-[16px]">
                  <Skeleton className="m-auto my-[4px] h-[40px] w-2/5" />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModelInformationViewer;
