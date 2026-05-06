import { useQuery } from '@tanstack/react-query';
import { getAttrData } from 'apis/NDXPRO/attributeApi';
import { getUnitCodeGroup } from 'apis/NDXPRO/modelApi';
import InputContainer from 'components/NDXPRO/common/inputContainer';
import Select from 'components/NDXPRO/common/select';
import DataModelUnitCodeContent from 'components/NDXPRO/dataModel/dataModelAttributeContent/dataModelUnitCodeContent';
import StatisticsError from 'components/NDXPRO/statistics/statisticsContent/statisticsError';
import StatisticsLoading from 'components/NDXPRO/statistics/statisticsContent/statisticsLoading';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { IDataModelAttributeFormat } from 'types/dataModelTypes';

function AddUnitCodeForm({
  selectedAttr,
  newAttr,
  setNewAttr,
}: {
  selectedAttr: string[];
  newAttr: IDataModelAttributeFormat;
  setNewAttr: Dispatch<SetStateAction<IDataModelAttributeFormat>>;
}) {
  const [unitCodeGroup, setUnitCodeGroup] = useState([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['getAttrData', selectedAttr[0]],
    queryFn: () => getAttrData(selectedAttr[0]),
  });

  useEffect(() => {
    if (!data || !unitCodeGroup) {
      return;
    }
    getUnitCodeGroup().then((res) => {
      setUnitCodeGroup(res);
      setUnitCodeValue(res[0]);
    });
  }, [data]);

  const setUnitCodeValue = (value: string) => {
    setNewAttr((prev: IDataModelAttributeFormat) => {
      return {
        ...prev,
        id: data.id,
        name: `${data.type}:${data.id}`,
        value: {
          ...prev.value,
          type: value,
          valueType: data.valueType ?? '',
          format: data.format ?? '',
        },
      };
    });
  };

  if (isLoading) {
    return <StatisticsLoading />;
  }

  if (error || !data) {
    return <StatisticsError />;
  }

  return (
    <>
      <InputContainer
        label="Unitcode Type"
        contentNode={
          <Select
            dataList={unitCodeGroup}
            defaultValue={newAttr.value.type}
            onChange={(e: any) => setUnitCodeValue(e.target.value)}
          />
        }
      />
      <div className="form-wrapper">
        <InputContainer
          label="ID"
          contentNode={<p className="disabled-form">{data.id}</p>}
        />
        <InputContainer
          label="Type"
          contentNode={<p className="disabled-form">{data.type}</p>}
        />
        <DataModelUnitCodeContent attribute={newAttr} setState={setNewAttr} />
        <InputContainer
          label="Title"
          contentNode={<p className="disabled-form">{data.title}</p>}
        />
        <InputContainer
          label="Description"
          contentNode={<p className="disabled-form">{data.description}</p>}
        />
      </div>
    </>
  );
}

export default AddUnitCodeForm;
