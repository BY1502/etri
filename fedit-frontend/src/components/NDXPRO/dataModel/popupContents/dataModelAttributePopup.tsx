import { useQuery } from '@tanstack/react-query';
import { getAllAttributeSchema } from 'apis/NDXPRO/attributeApi';
import { getAttributeAtAttributeSchema } from 'apis/NDXPRO/attributeSchemaApi';

import {
  modelAttributeAtom,
  modelSelectedAtom,
} from 'store/dataModel/dataModelAtom';

import InputContainer from 'components/NDXPRO/common/inputContainer';
import Modal from 'components/NDXPRO/common/modal';
import AsideList from 'components/NDXPRO/common/ModelAttributeAside/asideList';
import AsideListItem from 'components/NDXPRO/common/ModelAttributeAside/asideListItem';
import Select from 'components/NDXPRO/common/select';
import StatisticsError from 'components/NDXPRO/statistics/statisticsContent/statisticsError';
import StatisticsLoading from 'components/NDXPRO/statistics/statisticsContent/statisticsLoading';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { IDataModelAttributeFormat } from 'types/dataModelTypes';
import { AddAttributeOrMemberHandle } from 'utils/dataModelUtils';
import AddAttributeForm from './addAttributeForm';
import AddUnitCodeForm from './addUnitCodeForm';

function AttributeFromSchema({
  attributeSchemaId,
  setAttributeSchemaId,
}: {
  attributeSchemaId: string;
  setAttributeSchemaId: Dispatch<SetStateAction<string>>;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['getAllAttributeSchema'],
    queryFn: () => getAllAttributeSchema(),
  });

  useEffect(() => {
    if (data && data.length !== 0 && attributeSchemaId === '') {
      setAttributeSchemaId(data[0]);
    }
  }, [data]);

  if (isLoading) {
    return <StatisticsLoading />;
  }

  if (error || !data) {
    return <StatisticsError />;
  }

  return (
    <div className="attribute-from-schema">
      <InputContainer
        label="Attribute Schema"
        contentNode={
          <Select
            dataList={data}
            selectedValue={attributeSchemaId}
            onChange={(e: any) => {
              setAttributeSchemaId(e.target.value);
            }}
          />
        }
      />
    </div>
  );
}

function AttributeFromSchemaList({
  attributeSchemaId,
  selectedAttr,
  setSelectedAttr,
}: {
  attributeSchemaId: string;
  selectedAttr: string[];
  setSelectedAttr: Dispatch<SetStateAction<string[]>>;
}) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['getAttributeAtAttributeSchema', attributeSchemaId],
    queryFn: () => getAttributeAtAttributeSchema(attributeSchemaId),
  });

  if (isLoading) {
    return <StatisticsLoading />;
  }

  if (error || !data) {
    return <StatisticsError />;
  }

  const list = Object.entries(data.value);

  return (
    <AsideList isFetching={isFetching}>
      {list.length === 0 && <div>No Data</div>}
      {list.map(([k, v]: [string, string]) => (
        <AsideListItem
          key={v}
          text={k}
          onClick={() => setSelectedAttr([k, v])}
          active={selectedAttr[1] === v}
        />
      ))}
    </AsideList>
  );
}

function NewDataModelAttributePopup({
  owner,
  closer,
  attributeSchemaId,
  setAttributeSchemaId,
}: {
  owner?: string;
  closer: () => void;
  attributeSchemaId: string;
  setAttributeSchemaId: Dispatch<SetStateAction<string>>;
}) {
  const [attributes, setAttributes] = useRecoilState(modelAttributeAtom);
  const [selectedAttr, setSelectedAttr] = useState<string[]>([]);
  const [newAttr, setNewAttr] = useState<IDataModelAttributeFormat>({
    id: '',
    value: {},
    name: '',
    toggle: false,
  });

  const setModelSelected = useSetRecoilState(modelSelectedAtom);

  return (
    <Modal
      title={owner ? `Add child attribute` : 'Add Attribute'}
      closer={closer}
      closerText="Close"
      submit={() =>
        AddAttributeOrMemberHandle(
          owner,
          closer,
          'childAttributes',
          newAttr,
          attributes,
          setAttributes,
          setModelSelected,
        )
      }
      submitText={owner ? `Add child to ${owner}` : 'Add Attribute'}
    >
      <div className="new-data-model-popup-content attribute">
        <div className="new-data-model-popup-content-aside">
          <AttributeFromSchema
            attributeSchemaId={attributeSchemaId}
            setAttributeSchemaId={setAttributeSchemaId}
          />
          {attributeSchemaId !== '' && (
            <AttributeFromSchemaList
              attributeSchemaId={attributeSchemaId}
              selectedAttr={selectedAttr}
              setSelectedAttr={setSelectedAttr}
            />
          )}
        </div>
        <div className="add-attribute-form">
          {selectedAttr.length !== 0 && (
            <>
              {selectedAttr[0] !== 'unitCode' && (
                <AddAttributeForm
                  selectedAttr={selectedAttr}
                  newAttr={newAttr}
                  setNewAttr={setNewAttr}
                />
              )}
              {selectedAttr[0] === 'unitCode' && (
                <AddUnitCodeForm
                  selectedAttr={selectedAttr}
                  newAttr={newAttr}
                  setNewAttr={setNewAttr}
                />
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default NewDataModelAttributePopup;
