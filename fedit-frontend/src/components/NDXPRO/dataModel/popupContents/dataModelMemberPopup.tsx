import InputContainer from 'components/NDXPRO/common/inputContainer';
import Modal from 'components/NDXPRO/common/modal';
import Select from 'components/NDXPRO/common/select';
import { Dispatch, SetStateAction, useState } from 'react';
import { onlyPropertyValueList } from 'utils/dataModelInitList';
import { AddAttributeOrMemberHandle } from 'utils/dataModelUtils';

function DataModelMemberPopup({
  owner,
  closer,
  state,
  setState,
}: {
  owner?: string;
  closer: () => void;
  state: any;
  setState: Dispatch<SetStateAction<any>>;
}) {
  const [newMember, setNewMember] = useState({
    id: '',
    value: { valueType: onlyPropertyValueList[0] },
    toggle: false,
  });

  return (
    <Modal
      title={owner ? 'Add child object Member' : 'Add object member'}
      closer={closer}
      closerText="Close"
      submit={() =>
        AddAttributeOrMemberHandle(
          owner,
          closer,
          'objectMember',
          newMember,
          state,
          setState,
        )
      }
      submitText={owner ? `Add child to ${owner}` : 'Add object member'}
    >
      <div className="new-data-model-popup-content member">
        <InputContainer
          label="ID"
          contentNode={
            <input
              type="text"
              onChange={(e) => {
                setNewMember((prev) => {
                  return { ...prev, id: e.target.value };
                });
              }}
            />
          }
        />
        <InputContainer
          label="Value Type"
          contentNode={
            <Select
              dataList={onlyPropertyValueList}
              onChange={(e) => {
                setNewMember((prev) => {
                  return { ...prev, value: { valueType: e.target.value } };
                });
              }}
            />
          }
        />
      </div>
    </Modal>
  );
}

export default DataModelMemberPopup;
