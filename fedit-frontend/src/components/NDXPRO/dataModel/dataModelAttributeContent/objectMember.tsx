import { ReactComponent as AddBtn } from 'assets/images/add.svg';
import { ReactComponent as FoldBtn } from 'assets/images/fold.svg';
import { ReactComponent as UnfoldBtn } from 'assets/images/unfold.svg';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';

import DataModelTreeItem from 'components/NDXPRO/dataModel/dataModelTree/dataModelTreeItem';
import DataModelMemberPopup from 'components/NDXPRO/dataModel/popupContents/dataModelMemberPopup';
import { memberToObject, ObjectMemberToArray } from 'utils/dataModelUtils';

function ObjectMember({
  memberKey,
  setMember,
  propValue,
}: {
  memberKey: any;
  setMember: Dispatch<SetStateAction<any>>;
  propValue: any;
}) {
  const [modelSelected, setModelSelected] = useState([]);
  const [openPopUp, setOpenPopUp] = useState(false);

  const [popupId, setPopupId] = useState<string | undefined>();

  const [memberValue, setMemberValue] = useState<any>([]);

  useEffect(() => {
    if (propValue === undefined) {
      setMemberValue([]);
      return;
    }
    setMemberValue(() => ObjectMemberToArray(propValue));
  }, [memberKey]);

  useEffect(() => {
    setMember(memberToObject(memberValue));
  }, [memberValue]);

  const folderHandle = (value: boolean) => {
    setMemberValue((prev: any[]) => {
      if (prev.length === 0) {
        return prev;
      }
      const newAttr = structuredClone(prev);
      newAttr.forEach((e) => {
        e.toggle = value;
      });
      return newAttr;
    });
  };

  const objectFinder = () => {
    if (modelSelected.length === 0) {
      return true;
    }
    if (modelSelected[0] !== undefined) {
      return false;
    }
    const value = memberValue.find((e: any) => e.id === modelSelected[1]);

    if (value.value.valueType === 'Object') {
      return true;
    }
    return false;
  };

  const open = () => {
    setPopupId(undefined);
    setOpenPopUp(true);
  };

  const openAddChild = () => {
    setPopupId(modelSelected[1]);
    setOpenPopUp(true);
  };

  const close = () => {
    setOpenPopUp(false);
  };

  return (
    <div className="new-data-model-tree-wrapper">
      <div className="new-data-model-tree-controller">
        <div>
          <button type="button" onClick={() => folderHandle(false)}>
            <FoldBtn />
          </button>
          <button type="button" onClick={() => folderHandle(true)}>
            <UnfoldBtn />
          </button>
        </div>
        {objectFinder() && (
          <button type="button" onClick={open}>
            <AddBtn />
          </button>
        )}
      </div>
      <div className="new-data-model-tree">
        {memberValue?.map((e: any) => (
          <DataModelTreeItem
            key={e.id}
            id={e.id}
            value={e.value}
            toggle={e.toggle}
            open={openAddChild}
            setAttributes={setMemberValue}
            modelSelected={modelSelected}
            setModelSelected={setModelSelected}
            type="objectMember"
          />
        ))}
      </div>
      {openPopUp && (
        <DataModelMemberPopup
          owner={popupId}
          closer={close}
          state={memberValue}
          setState={setMemberValue}
        />
      )}
    </div>
  );
}

export default ObjectMember;
