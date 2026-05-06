import InputContainer from 'components/NDXPRO/common/inputContainer';
import { Dispatch, SetStateAction, useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';
import { getUnitCode } from 'apis/NDXPRO/modelApi';
import StatisticsError from 'components/NDXPRO/statistics/statisticsContent/statisticsError';
import StatisticsLoading from 'components/NDXPRO/statistics/statisticsContent/statisticsLoading';
import {
  IDataModelAttribute,
  IDataModelAttributeFormat,
} from 'types/dataModelTypes';

interface IUnitCode {
  code: string;
  symbol: string;
  groupName: string;
}

function DataModelUnitCodeContent({
  attribute,
  setState,
}: {
  attribute: IDataModelAttributeFormat;
  setState: Dispatch<SetStateAction<IDataModelAttributeFormat>>;
}) {
  const { id, value }: { id: string; value: IDataModelAttribute } = attribute;

  const {
    data: unitCodeData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['getUnitCode', value.type],
    queryFn: () => getUnitCode(value.type),
    enabled: ![
      'Property',
      'GeoProperty',
      'Relationship',
      '',
      undefined,
      null,
    ].includes(value.type),
  });

  const setEnum = (value: string[]) => {
    setState((prev: IDataModelAttributeFormat) => {
      return {
        ...prev,
        id,
        value: {
          ...prev.value,
          enum: value,
        },
      };
    });
  };

  useEffect(() => {
    if (!unitCodeData || !setEnum) {
      return;
    }
    const codeEnum = unitCodeData.map((e: IUnitCode) => {
      return e.code;
    });
    setEnum(codeEnum);
  }, [unitCodeData]);

  if (isLoading) {
    return <StatisticsLoading />;
  }

  if (error) {
    return <StatisticsError />;
  }

  return (
    <div className="model-attribute-content">
      <InputContainer
        label="Unitcode Type"
        contentNode={<p className="disabled-form">{value.type}</p>}
      />
      <InputContainer
        label="Value Type"
        contentNode={<p className="disabled-form">{value.valueType}</p>}
      />
      {value.format !== undefined && (
        <InputContainer
          label="Format"
          contentNode={<p className="disabled-form">{value.format}</p>}
        />
      )}
      <InputContainer
        label="Unitcode"
        contentNode={
          <ul className="unitcode-list">
            {unitCodeData &&
              unitCodeData.map((e: IUnitCode) => (
                <li className="disabled-form" key={e.code}>
                  {e.symbol}
                </li>
              ))}
          </ul>
        }
      />
    </div>
  );
}

export default DataModelUnitCodeContent;
