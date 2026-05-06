import InputContainer from 'components/NDXPRO/common/inputContainer';
import { IDataModelAttribute } from 'types/dataModelTypes';

function DataModelObservedAtContent({
  attribute,
  setState,
}: {
  attribute: {
    id: string;
    value: any;
    toggle: boolean;
  };
  setState: (value: IDataModelAttribute) => void;
}) {
  const { id, value }: { id: string; value: IDataModelAttribute } = attribute;
  return (
    <div className="model-attribute-content">
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
    </div>
  );
}

export default DataModelObservedAtContent;
