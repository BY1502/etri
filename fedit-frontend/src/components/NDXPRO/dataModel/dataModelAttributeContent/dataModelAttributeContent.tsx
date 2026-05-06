import EditableList from 'components/NDXPRO/common/editableList';
import InputContainer from 'components/NDXPRO/common/inputContainer';
import Select from 'components/NDXPRO/common/select';
import React, { useEffect, useState } from 'react';
import { IDataModelAttribute } from 'types/dataModelTypes';
import { GeoPropertyValueList } from 'utils/dataModelInitList';
import ObjectMember from './objectMember';

function DataModelAttributeContent({
  keyId,
  value,
  setValue,
  setValid,
}: {
  keyId: string;
  value: IDataModelAttribute;
  setValue: (value: any) => void;
  setValid: (valid: any) => void;
}) {
  const [modelTypeValue, setModelTypeValue] = useState<string[]>();
  const [enumValue, setEnumValue] = useState<string[]>();

  const [member, setMember] = useState<any>();

  // onChange
  useEffect(() => {
    setValue({ enum: enumValue });
  }, [enumValue]);

  useEffect(() => {
    setValue({ modelType: modelTypeValue });
  }, [modelTypeValue]);

  useEffect(() => {
    setValue({ objectMember: member });
  }, [member]);

  const numberFormatter = (num: string) => {
    if (Number(num) <= -2147483647) {
      return -2147483647;
    }
    if (Number(num) >= 2147483647) {
      return 2147483647;
    }
    return num !== '' ? Number(num) : undefined;
  };

  return (
    <div className="model-attribute-content">
      <InputContainer
        label="Type"
        contentNode={<p className="disabled-form">{value.type}</p>}
      />
      <InputContainer
        label="Description"
        contentNode={<p className="disabled-form">{value.description}</p>}
      />
      <InputContainer
        label="Value Type"
        contentNode={
          value.type === 'GeoProperty' && value.format === 'GeoJSON' ? (
            <Select
              dataList={GeoPropertyValueList}
              defaultValue={value.valueType}
              onChange={(e: any) => {
                setValue({ valueType: e.target.value });
              }}
              selectKey={value.valueType}
            />
          ) : (
            <p className="disabled-form">{value.valueType}</p>
          )
        }
      />
      {value.format !== undefined && (
        <InputContainer
          label="Format"
          contentNode={<p className="disabled-form">{value.format}</p>}
        />
      )}
      {/* {value.valueType && lengthValueType.includes(value.valueType) && (
        <div className="content-valid">
          <InputContainer
            label="MinLength"
            content={
              <input
                type="number"
                defaultValue={value.valid?.minLength}
                key={keyId}
                onChange={(e) =>
                  setValid({
                    minLength: numberFormatter(e.target.value),
                  })
                }
              />
            }
          />
          <InputContainer
            label="MaxLength"
            content={
              <input
                type="number"
                defaultValue={value.valid?.maxLength}
                key={keyId}
                onChange={(e) =>
                  setValid({ maxLength: numberFormatter(e.target.value) })
                }
              />
            }
          />
        </div>
      )}
      {value.valueType && numberValueType.includes(value.valueType) && (
        <div className="content-valid">
          <InputContainer
            label="Minimum"
            content={
              <input
                type="number"
                defaultValue={value.valid?.minimum}
                key={keyId}
                onChange={(e) =>
                  setValid({ minimum: numberFormatter(e.target.value) })
                }
              />
            }
          />
          <InputContainer
            label="Maximum"
            content={
              <input
                type="number"
                defaultValue={value.valid?.maximum}
                key={keyId}
                onChange={(e) =>
                  setValid({ maximum: numberFormatter(e.target.value) })
                }
              />
            }
          />
        </div>
      )} */}
      {value.type === 'Relationship' && (
        <EditableList
          label="model Type"
          setState={setModelTypeValue}
          propValue={value.modelType || []}
          listKey={keyId}
        />
      )}
      <EditableList
        label="Enum"
        setState={setEnumValue}
        propValue={value.enum}
        listKey={keyId}
      />
      {value.valueType === 'Object' && (
        <>
          <span className="input-label-style">Object Member</span>
          <ObjectMember
            memberKey={keyId}
            setMember={setMember}
            propValue={value.objectMember}
          />
        </>
      )}
    </div>
  );
}

export default React.memo(DataModelAttributeContent);
