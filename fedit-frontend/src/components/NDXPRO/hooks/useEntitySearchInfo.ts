import { useMemo, useState } from 'react';
import {
  EntitySearchInfoAction,
  EntitySearchInfoType,
  ObservedTimeInfoType,
  SearchCriteriaInfoType,
  ValueType,
} from 'types/entity';
import { convertDateTimeLocalFormat, subtractMonth } from 'utils/date';

export const INIT_ENTITY_SEARCH_INFO: EntitySearchInfoType = Object.freeze({
  observedTimeInfo: undefined,
  criteriaInfo1: undefined,
  criteriaInfo2: undefined,
});

function useEntitySearchInfo(): [EntitySearchInfoType, EntitySearchInfoAction] {
  const [searchInfo, setSearchInfo] = useState<EntitySearchInfoType>(
    INIT_ENTITY_SEARCH_INFO,
  );

  const searchInfoAction: EntitySearchInfoAction = useMemo(
    () => ({
      set: (newSearchInfo: EntitySearchInfoType) => {
        setSearchInfo(newSearchInfo);
      },
      concat: (newSearchInfo: EntitySearchInfoType) => {
        setSearchInfo((prev) => ({
          ...prev,
          ...newSearchInfo,
        }));
      },
      setCriteriaInfo1: (searchCriteriaInfo: SearchCriteriaInfoType) => {
        setSearchInfo((prev) => {
          const newSearchCriteria = { ...prev };
          newSearchCriteria.criteriaInfo1 = searchCriteriaInfo;
          return newSearchCriteria;
        });
      },
      setCriteriaInfo2: (searchCriteriaInfo: SearchCriteriaInfoType) => {
        setSearchInfo((prev) => {
          const newSearchCriteria = { ...prev };
          newSearchCriteria.criteriaInfo2 = searchCriteriaInfo;
          return newSearchCriteria;
        });
      },
      setObservedTimeInfo: (observedTimeInfo: ObservedTimeInfoType) => {
        setSearchInfo((prev) => {
          const newObservedTime = { ...prev };
          newObservedTime.observedTimeInfo = observedTimeInfo;
          return newObservedTime;
        });
      },
      setPropertyInfo: (property: string, valueType: ValueType) => {
        setSearchInfo((prev) => {
          const newObservedTime = { ...prev };
          newObservedTime.observedTimeInfo = {
            property,
            valueType,
            startTime: convertDateTimeLocalFormat(subtractMonth(new Date(), 2)),
            endTime: convertDateTimeLocalFormat(new Date()),
            timerel: 'between',
            value: '',
          };
          return newObservedTime;
        });
      },
      resetForStatic: () => {
        setSearchInfo(INIT_ENTITY_SEARCH_INFO);
      },
      resetForDynamic: (property: string, valueType: ValueType) => {
        const newSearchInfo = { ...INIT_ENTITY_SEARCH_INFO };

        newSearchInfo.observedTimeInfo = {
          property,
          valueType,
          startTime: convertDateTimeLocalFormat(subtractMonth(new Date(), 2)),
          endTime: convertDateTimeLocalFormat(new Date()),
          timerel: 'between',
          value: '',
        };

        setSearchInfo(newSearchInfo);
      },
    }),
    [],
  );

  return [searchInfo, searchInfoAction];
}

export default useEntitySearchInfo;
