import EditableList from 'components/NDXPRO/common/editableList';
import InputContainer from 'components/NDXPRO/common/inputContainer';
import { useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import { IModelInfo, modelInfoAtom } from 'store/dataModel/dataModelAtom';

function DataModelInfo({ EditableType }: { EditableType?: boolean }) {
  const [modelInfo, setModelInfo] = useRecoilState(modelInfoAtom);
  const [reference, setReference] = useState<string[]>();

  useEffect(() => {
    setModelInfoHandle({ reference });
  }, [reference]);

  const setModelInfoHandle = (value: IModelInfo) => {
    setModelInfo((prev) => {
      const newModelInfo = structuredClone(prev);
      return { ...newModelInfo, ...value };
    });
  };

  return (
    <div className="new-data-model-info">
      <InputContainer
        label="ID"
        isRequire
        contentNode={
          <p className="disabled-form">
            {modelInfo.id !== ''
              ? modelInfo.id
              : `urn:ngsi-ld:${modelInfo.type}:`}
          </p>
        }
      />
      <InputContainer
        label="Type"
        isRequire
        contentNode={
          EditableType ? (
            <input
              type="text"
              defaultValue={modelInfo.type}
              key={modelInfo.id}
              onChange={(e) => setModelInfoHandle({ type: e.target.value })}
            />
          ) : (
            <p className="disabled-form">{modelInfo.type}</p>
          )
        }
      />
      <InputContainer
        label="Title"
        contentNode={
          <input
            type="text"
            defaultValue={modelInfo.title}
            key={modelInfo.id}
            onChange={(e) => setModelInfoHandle({ title: e.target.value })}
          />
        }
      />
      <InputContainer
        label="Description"
        contentNode={
          <input
            type="text"
            defaultValue={modelInfo.description}
            key={modelInfo.id}
            onChange={(e) =>
              setModelInfoHandle({ description: e.target.value })
            }
          />
        }
      />
      <EditableList
        label="reference"
        setState={setReference}
        propValue={modelInfo.reference || []}
        listKey={modelInfo.id}
      />
    </div>
  );
}

export default DataModelInfo;
