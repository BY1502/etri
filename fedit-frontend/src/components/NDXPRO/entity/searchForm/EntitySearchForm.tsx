import useObservedTimeInfo from 'components/NDXPRO/hooks/useObservedTimeInfo';
import useSearchCriteriaInfo from 'components/NDXPRO/hooks/useSearchCriteriaInfo';
import { useEffect } from 'react';
import {
  CriteriaInfoTypeList,
  EntitySearchInfoAction,
  EntitySearchInfoType,
  ValueType,
} from 'types/entity';
import EntityCriteriaDateTimeInput from '../EntityCriteriaDateTimeInput';
import EntitySearchCriteriaInput from './EntitySearchCriteriaInput';

interface IProps {
  searchInfo: EntitySearchInfoType;
  searchInfoAction: EntitySearchInfoAction;
  searchCriteriaInfoList: CriteriaInfoTypeList;
  isDynamic?: boolean | null;
  timePropertyList?: string[];
}

function EntitySearchForm({
  searchInfo,
  searchInfoAction,
  searchCriteriaInfoList,
  isDynamic,
  timePropertyList,
}: IProps) {
  const [observedTimeInfo, observedTimeInfoAction] = useObservedTimeInfo({
    property: '',
    startTime: '',
    endTime: '',
    timerel: undefined,
    value: '',
    valueType: '',
  });
  const [searchCriteriaInfo1, searchCriteriaInfoAction1] =
    useSearchCriteriaInfo({
      criteria: '',
      valueType: '',
      value: '',
    });
  const [searchCriteriaInfo2, searchCriteriaInfoAction2] =
    useSearchCriteriaInfo({
      criteria: '',
      valueType: '',
      value: '',
    });

  const eventHandler = {
    onSearchValueSubmit: (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      searchInfoAction.set({
        criteriaInfo1: searchCriteriaInfo1,
        criteriaInfo2: searchCriteriaInfo2,
        observedTimeInfo,
      });
    },
    resetCriteriaInfo: () => {
      if (isDynamic && timePropertyList) {
        const property = timePropertyList[0];
        const valueType = searchCriteriaInfoList.find(
          (searchCriteriaInfo) =>
            searchCriteriaInfo.criteria === timePropertyList[0],
        )?.valueType as ValueType;

        searchInfoAction.resetForDynamic(property, valueType);
      } else {
        searchInfoAction.resetForStatic();
      }
    },
  };

  useEffect(() => {
    const { observedTimeInfo, criteriaInfo1, criteriaInfo2 } = searchInfo;

    if (criteriaInfo1) {
      searchCriteriaInfoAction1.set(criteriaInfo1);
    } else {
      searchCriteriaInfoAction1.reset();
    }

    if (criteriaInfo2) {
      searchCriteriaInfoAction2.set(criteriaInfo2);
    } else {
      searchCriteriaInfoAction2.reset();
    }

    if (observedTimeInfo) {
      observedTimeInfoAction.set(observedTimeInfo);
    } else {
      observedTimeInfoAction.reset();
    }
  }, [searchCriteriaInfoList, searchInfo]);

  return (
    <form
      className="entity-search-form"
      onSubmit={eventHandler.onSearchValueSubmit}
    >
      {isDynamic && timePropertyList && (
        <EntityCriteriaDateTimeInput
          label="Observed Time Filter"
          timePropertyList={timePropertyList}
          searchCriteriaInfoList={searchCriteriaInfoList}
          observedTimeInfo={observedTimeInfo}
          observedTimeInfoAction={observedTimeInfoAction}
          searchCriteriaInfoAction={searchCriteriaInfoAction1}
        />
      )}
      <EntitySearchCriteriaInput
        label="Filter"
        searchCriteriaInfoList={searchCriteriaInfoList}
        searchCriteriaInfo={searchCriteriaInfo1}
        searchCriteriaInfoAction={searchCriteriaInfoAction1}
        observedTimeInfo={isDynamic ? observedTimeInfo : undefined}
      />
      {!isDynamic && (
        <EntitySearchCriteriaInput
          label="Filter"
          searchCriteriaInfoList={searchCriteriaInfoList}
          searchCriteriaInfo={searchCriteriaInfo2}
          searchCriteriaInfoAction={searchCriteriaInfoAction2}
        />
      )}
      <div className="button-wrapper">
        <button
          className="reset-button"
          type="button"
          onClick={eventHandler.resetCriteriaInfo}
        >
          초기화
        </button>
        <button className="submit-button" type="submit">
          필터 적용
        </button>
      </div>
    </form>
  );
}

export default EntitySearchForm;
