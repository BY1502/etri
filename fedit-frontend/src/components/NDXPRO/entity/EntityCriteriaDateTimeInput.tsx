import InputContainer from 'components/NDXPRO/common/inputContainer';
import Select from 'components/NDXPRO/common/select';
import React, { useEffect } from 'react';
import { AttributeTypeEnum } from 'types/attribute';
import { SelectData } from 'types/common';
import {
  CriteriaInfoTypeList,
  ObservedTimeInfoAction,
  ObservedTimeInfoType,
  SearchCriteriaInfoAction,
  TimerelType,
} from 'types/entity';
import { convertDateTimeLocalFormat, subtractMonth } from 'utils/date';
import InequlityInput from './searchForm/InequlityInput';

interface IProps {
  label: string;
  timePropertyList: string[];
  searchCriteriaInfoList: CriteriaInfoTypeList;
  observedTimeInfo: ObservedTimeInfoType;
  observedTimeInfoAction: ObservedTimeInfoAction;
  searchCriteriaInfoAction: SearchCriteriaInfoAction;
}

function EntityCriteriaDateTimeInput({
  label,
  timePropertyList,
  searchCriteriaInfoList,
  observedTimeInfo,
  observedTimeInfoAction,
  searchCriteriaInfoAction,
}: IProps) {
  const dataList: SelectData[] = searchCriteriaInfoList
    .filter((attribute) => timePropertyList.includes(attribute.criteria))
    .map((attribute) => {
      return {
        label: `${attribute.criteria} / ${attribute.valueType}`,
        value: attribute.criteria,
      };
    });

  const generateTimerel = (startTime: string, endTime: string) => {
    if (
      startTime.length !== 0 &&
      endTime.length !== 0 &&
      new Date(startTime) > new Date(endTime)
    ) {
      throw new Error('시작 시점은 종료 시점 이전으로 설정해주세요.');
    }

    let timerel: TimerelType;
    if (startTime.length !== 0 && endTime.length !== 0) {
      timerel = 'between';
    } else if (startTime.length !== 0) {
      timerel = 'after';
    } else if (endTime.length !== 0) {
      timerel = 'before';
    }
    return timerel;
  };

  const eventHandler = {
    onChangeStartTime: (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const inputStartTime = event.target.value;
        const { endTime } = observedTimeInfo;
        const timerel: TimerelType = generateTimerel(inputStartTime, endTime);

        observedTimeInfoAction.setStartTime(inputStartTime, timerel);
      } catch (error) {
        alert((error as Error).message);
      }
    },
    onChangeEndTime: (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const inputEndTime = event.target.value;
        const { startTime } = observedTimeInfo;
        const timerel: TimerelType = generateTimerel(startTime, inputEndTime);

        observedTimeInfoAction.setEndTime(inputEndTime, timerel);
      } catch (error) {
        alert((error as Error).message);
      }
    },
    onChangeSelectValue: (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedValue = event.target.value;

      const targetProperty = searchCriteriaInfoList.find(
        (attribute) => attribute.criteria === selectedValue,
      );

      searchCriteriaInfoAction.reset();
      observedTimeInfoAction.set({
        property:
          targetProperty?.criteria || searchCriteriaInfoList[0].criteria,
        valueType:
          targetProperty?.valueType || searchCriteriaInfoList[0].valueType,
        startTime: convertDateTimeLocalFormat(subtractMonth(new Date(), 2)),
        endTime: convertDateTimeLocalFormat(new Date()),
        timerel: 'between',
        value: '',
      });
    },
    onChangeValue: (event: React.ChangeEvent<HTMLInputElement>) => {
      observedTimeInfoAction.setValue(event.target.value);
    },
    onChangeInequlityValue: (newValue: string) => {
      observedTimeInfoAction.setValue(newValue);
    },
  };

  useEffect(() => {
    const targetSearchCriteriaInfo = searchCriteriaInfoList.find(
      (searchCriteriaInfo) =>
        searchCriteriaInfo.criteria === observedTimeInfo.property,
    );
    if (targetSearchCriteriaInfo) {
      observedTimeInfoAction.set({
        ...observedTimeInfo,
        property: targetSearchCriteriaInfo.criteria,
        valueType: targetSearchCriteriaInfo.valueType,
      });
    }
  }, [observedTimeInfo.property]);

  return (
    <div className="criteria-date-time-input">
      <div className="horizontal-input-layout">
        <InputContainer
          label={label}
          contentNode={
            <Select
              selectedValue={observedTimeInfo.property}
              onChange={eventHandler.onChangeSelectValue}
              name="criteria1"
              dataList={dataList}
              defaultValue={observedTimeInfo.property}
            />
          }
        />
        <div className="horizontal-input-layout">
          {observedTimeInfo.property &&
          observedTimeInfo.valueType.length !== 0 ? (
            <>
              {(() => {
                switch (observedTimeInfo?.valueType) {
                  case AttributeTypeEnum.String:
                  case AttributeTypeEnum.Enum:
                    return (
                      <InputContainer
                        contentNode={
                          <input
                            type="text"
                            placeholder="search..."
                            value={observedTimeInfo.value}
                            onChange={eventHandler.onChangeValue}
                          />
                        }
                      />
                    );
                  case AttributeTypeEnum.Integer:
                  case AttributeTypeEnum.Double:
                    return (
                      <InequlityInput
                        value={observedTimeInfo.value}
                        setValue={eventHandler.onChangeInequlityValue}
                      />
                    );
                  default:
                    return (
                      <InputContainer
                        contentNode={
                          <input
                            type="text"
                            value=""
                            placeholder="검색 기능이 지원되지 않습니다."
                            disabled
                          />
                        }
                      />
                    );
                }
              })()}
            </>
          ) : (
            <InputContainer
              contentNode={<input type="text" value="" disabled />}
            />
          )}
        </div>
      </div>
      <div className="datetime-input-wrapper">
        <input
          type="datetime-local"
          title={observedTimeInfo.startTime}
          value={observedTimeInfo.startTime}
          onChange={eventHandler.onChangeStartTime}
        />
        ~
        <input
          type="datetime-local"
          title={observedTimeInfo.endTime}
          value={observedTimeInfo.endTime}
          onChange={eventHandler.onChangeEndTime}
        />
      </div>
    </div>
  );
}

export default EntityCriteriaDateTimeInput;
