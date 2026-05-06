import { useQuery } from '@tanstack/react-query';
import { getAttrData } from 'apis/NDXPRO/attributeApi';
import InputContainer from 'components/NDXPRO/common/inputContainer';
import Select from 'components/NDXPRO/common/select';
import StatisticsError from 'components/NDXPRO/statistics/statisticsContent/statisticsError';
import StatisticsLoading from 'components/NDXPRO/statistics/statisticsContent/statisticsLoading';
import { Dispatch, SetStateAction, useEffect } from 'react';
import { IDataModelAttributeFormat } from 'types/dataModelTypes';
import { GeoPropertyValueList } from 'utils/dataModelInitList';

function AddAttributeForm({
  selectedAttr,
  newAttr,
  setNewAttr,
}: {
  selectedAttr: string[];
  newAttr: IDataModelAttributeFormat;
  setNewAttr: Dispatch<SetStateAction<IDataModelAttributeFormat>>;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['getAttrData', selectedAttr[0]],
    queryFn: () => getAttrData(selectedAttr[0]),
  });

  useEffect(() => {
    if (!data) {
      return;
    }
    setNewAttr((prev) => {
      return {
        ...prev,
        id: data.id,
        name: `${data.type}:${data.id}`,
        value:
          selectedAttr[0] === 'observedAt'
            ? {
                valueType: data.valueType ?? '',
                format: data.format ?? '',
              }
            : {
                type: 'Property',
                valueType: data.valueType ?? '',
                description: data.description ?? '',
                format: data.format ?? '',
              },
      };
    });
  }, [data]);

  useEffect(() => {
    if (newAttr.value.type === 'GeoProperty') {
      setNewAttr((prev) => {
        return {
          ...prev,
          value: { ...prev.value, valueType: GeoPropertyValueList[0] as any },
        };
      });
    }
  }, [newAttr.value.type]);

  if (isLoading) {
    return <StatisticsLoading />;
  }

  if (error || !data) {
    return <StatisticsError />;
  }

  return (
    <>
      {selectedAttr[0] !== 'observedAt' && (
        <InputContainer
          label="Attribute Type"
          contentNode={
            <Select
              dataList={['Property', 'GeoProperty', 'Relationship']}
              defaultValue={newAttr.value.type}
              onChange={(e: any) => {
                setNewAttr((prev) => {
                  return {
                    ...prev,
                    value: { ...prev.value, type: e.target.value },
                  };
                });
              }}
            />
          }
        />
      )}
      <div className="form-wrapper">
        <InputContainer
          label="ID"
          contentNode={<p className="disabled-form">{data.id}</p>}
        />
        <InputContainer
          label="Type"
          contentNode={<p className="disabled-form">{data.type}</p>}
        />
        <InputContainer
          label="Value Type"
          contentNode={
            newAttr.value.type === 'GeoProperty' &&
            data.format === 'GeoJSON' ? (
              <Select
                dataList={GeoPropertyValueList}
                defaultValue={newAttr.value.valueType}
                onChange={(e: any) => {
                  setNewAttr((prev) => {
                    return {
                      ...prev,
                      value: { ...prev.value, valueType: e.target.value },
                    };
                  });
                }}
                selectKey={data.valueType}
              />
            ) : (
              <p className="disabled-form">{data.valueType}</p>
            )
          }
        />
        <InputContainer
          label="Title"
          contentNode={<p className="disabled-form">{data.title}</p>}
        />
        <InputContainer
          label="Description"
          contentNode={<p className="disabled-form">{data.description}</p>}
        />
        <InputContainer
          label="Format"
          contentNode={<p className="disabled-form">{data.format}</p>}
        />
      </div>
    </>
  );
}

export default AddAttributeForm;
