import { ReactComponent as AddBtn } from 'assets/images/add.svg';
import { useState } from 'react';
import { useRecoilState } from 'recoil';

import {
  modelAttributeAtom,
  modelSelectedAtom,
} from 'store/dataModel/dataModelAtom';

import { ReactComponent as FoldBtn } from 'assets/images/fold.svg';
import { ReactComponent as UnfoldBtn } from 'assets/images/unfold.svg';

import DataModelTreeItem from 'components/NDXPRO/dataModel/dataModelTree/dataModelTreeItem';
import DataModelAttributePopup from 'components/NDXPRO/dataModel/popupContents/dataModelAttributePopup';

function DataModelTree() {
  const [modelSelected, setModelSelected] = useRecoilState(modelSelectedAtom);
  const [attributes, setAttributes] = useRecoilState(modelAttributeAtom);
  const [openPopUp, setOpenPopUp] = useState(false);

  const [popupId, setPopupId] = useState<string | undefined>();
  const [attributeSchemaId, setAttributeSchemaId] = useState<string>('');

  const folderHandle = (value: boolean) => {
    setAttributes((prev) => {
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
        <button type="button" onClick={open}>
          <AddBtn />
        </button>
      </div>
      <div className="new-data-model-tree">
        {attributes?.map((e) => (
          <DataModelTreeItem
            key={e.id}
            id={e.id}
            value={e.value}
            toggle={e.toggle}
            open={openAddChild}
            setAttributes={setAttributes}
            modelSelected={modelSelected}
            setModelSelected={setModelSelected}
          />
        ))}
      </div>
      {openPopUp && (
        <DataModelAttributePopup
          owner={popupId}
          closer={close}
          attributeSchemaId={attributeSchemaId}
          setAttributeSchemaId={setAttributeSchemaId}
        />
      )}
    </div>
  );
}

export default DataModelTree;
