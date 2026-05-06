import InputContainer from 'components/NDXPRO/common/inputContainer';
import Select from 'components/NDXPRO/common/select';
import React, { useEffect } from 'react';

import { AttributeTypeEnum } from 'types/attribute';
import { SelectData } from 'types/common';
import {
  CriteriaInfoTypeList,
  ObservedTimeInfoType,
  SearchCriteriaInfoAction,
  SearchCriteriaInfoType,
} from 'types/entity';
import InequlityInput from './InequlityInput';

interface IProps {
  label: string;
  searchCriteriaInfoList: CriteriaInfoTypeList;
  searchCriteriaInfo: SearchCriteriaInfoType;
  searchCriteriaInfoAction: SearchCriteriaInfoAction;
  observedTimeInfo?: ObservedTimeInfoType;
  disabled?: boolean;
}

function EntitySearchCriteriaInput({
  label,
  searchCriteriaInfoList,
  searchCriteriaInfo,
  searchCriteriaInfoAction,
  observedTimeInfo,
  disabled,
}: IProps) {
  const dataList: SelectData[] = searchCriteriaInfoList
    .filter((attribute) => attribute.criteria !== observedTimeInfo?.property)
    .map((attribute) => {
      let label: string;

      if (attribute.criteria.includes('_id.id')) {
        label = 'Entity ID';
      } else if (attribute.criteria.includes('_id.servicePath')) {
        label = 'Provider';
      } else if (attribute.criteria.includes('.observedAt')) {
        label = 'Observed Time';
      } else {
        label = `${attribute.criteria} / ${attribute.valueType}`;
      }

      return {
        label,
        value: attribute.criteria,
      };
    });

  useEffect(() => {
    const targetCriteria = searchCriteriaInfoList.find(
      (attribute) => attribute.criteria === searchCriteriaInfo.criteria,
    );

    searchCriteriaInfoAction.set({
      criteria: targetCriteria?.criteria || '',
      valueType: targetCriteria?.valueType || '',
      value: searchCriteriaInfo.value,
    });
  }, [searchCriteriaInfo.criteria]);

  const eventHandler = {
    onChangeValue: (event: React.ChangeEvent<HTMLInputElement>) => {
      searchCriteriaInfoAction.setValue(event.target.value);
    },
    onChangeSelectValue: (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedValue = event.target.value;

      const targetCriteria = searchCriteriaInfoList.find(
        (attribute) => attribute.criteria === selectedValue,
      );

      searchCriteriaInfoAction.set({
        criteria: targetCriteria?.criteria || '',
        valueType: targetCriteria?.valueType || '',
        value: '',
      });
    },
  };

  return (
    <div className="horizontal-input-layout">
      <InputContainer
        label={label}
        contentNode={
          <Select
            selectedValue={searchCriteriaInfo.criteria}
            onChange={eventHandler.onChangeSelectValue}
            name="criteria1"
            dataList={dataList}
            placeholder="--"
            disabled={disabled}
          />
        }
      />
      <div className="horizontal-input-layout">
        {searchCriteriaInfo && searchCriteriaInfo.valueType.length !== 0 ? (
          <>
            {(() => {
              switch (searchCriteriaInfo?.valueType) {
                case AttributeTypeEnum.String:
                case AttributeTypeEnum.Enum:
                  return (
                    <InputContainer
                      contentNode={
                        <input
                          type="text"
                          placeholder="search..."
                          value={searchCriteriaInfo.value}
                          onChange={eventHandler.onChangeValue}
                        />
                      }
                    />
                  );
                case AttributeTypeEnum.DateTime:
                  return (
                    <InputContainer
                      contentNode={
                        <input
                          type="datetime-local"
                          value={searchCriteriaInfo.value}
                          onChange={eventHandler.onChangeValue}
                        />
                      }
                    />
                  );
                case AttributeTypeEnum.Integer:
                case AttributeTypeEnum.Double:
                  return (
                    <InequlityInput
                      value={searchCriteriaInfo.value}
                      setValue={searchCriteriaInfoAction.setValue}
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
  );
}

export default EntitySearchCriteriaInput;
