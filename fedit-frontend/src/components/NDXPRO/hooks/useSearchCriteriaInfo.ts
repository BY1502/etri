import { useMemo, useState } from 'react';
import {
  SearchCriteriaInfoAction,
  SearchCriteriaInfoType,
  ValueType,
} from 'types/entity';

function useSearchCriteriaInfo(
  initValue: SearchCriteriaInfoType,
): [SearchCriteriaInfoType, SearchCriteriaInfoAction] {
  const [searchCriteriaInfo, setSearchCriteriaInfo] =
    useState<SearchCriteriaInfoType>(initValue);

  const searchCriteriaInfoAction: SearchCriteriaInfoAction = useMemo(() => {
    return {
      reset: () => {
        setSearchCriteriaInfo(initValue);
      },
      set: (newSearchCriteriaInfo: SearchCriteriaInfoType) => {
        setSearchCriteriaInfo(newSearchCriteriaInfo);
      },
      setValue: (newValue: string) => {
        setSearchCriteriaInfo((prev) => {
          return {
            ...prev,
            value: newValue,
          };
        });
      },
      setCriteria: ({
        criteria,
        valueType,
      }: {
        criteria: string;
        valueType: ValueType | '';
      }) => {
        setSearchCriteriaInfo((prev) => {
          return {
            ...prev,
            criteria,
            valueType,
          };
        });
      },
    };
  }, []);

  return [searchCriteriaInfo, searchCriteriaInfoAction];
}

export default useSearchCriteriaInfo;
