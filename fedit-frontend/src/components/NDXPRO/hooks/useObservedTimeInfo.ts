import { useMemo, useState } from 'react';
import {
  ObservedTimeInfoAction,
  ObservedTimeInfoType,
  TimerelType,
} from 'types/entity';

function useObservedTimeInfo(
  initValue: ObservedTimeInfoType,
): [ObservedTimeInfoType, ObservedTimeInfoAction] {
  const [observedTimeInfo, setObservedTimeInfo] =
    useState<ObservedTimeInfoType>(initValue);

  const observedTimeInfoAction: ObservedTimeInfoAction = useMemo(() => {
    return {
      reset: () => setObservedTimeInfo(initValue),
      set: (newInfo: ObservedTimeInfoType) => setObservedTimeInfo(newInfo),
      setStartTime: (startTime: string, timerel: TimerelType) => {
        setObservedTimeInfo((prev) => {
          return {
            ...prev,
            startTime,
            timerel,
          };
        });
      },
      setEndTime: (endTime: string, timerel: TimerelType) => {
        setObservedTimeInfo((prev) => {
          return {
            ...prev,
            endTime,
            timerel,
          };
        });
      },
      setValue: (value: string) => {
        setObservedTimeInfo((prev) => {
          return {
            ...prev,
            value,
          };
        });
      },
    };
  }, []);

  return [observedTimeInfo, observedTimeInfoAction];
}

export default useObservedTimeInfo;
