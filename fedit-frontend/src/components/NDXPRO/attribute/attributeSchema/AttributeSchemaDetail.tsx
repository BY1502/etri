import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import AttributeSchemaForm from './AttributeSchemaForm';
import AttributeSelector from './AttributeSelector';

function AttributeSchemaDetail() {
  const param = useParams();
  const [isCreate, setIsCreate] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  const [attributeListAtSchema, setAttributeListAtSchema] = useState<string[]>(
    [],
  );

  useEffect(() => {
    setIsUpdate(false);
    if (param.attributeSchemaId === undefined) {
      setAttributeListAtSchema([]);
    }
  }, [param.attributeSchemaId]);

  return (
    <section className="attribute-schema-detail">
      <div className="attribute-schema-info">
        <h2>
          Attribute Schema {param.attributeSchemaId ? <>관리</> : <>생성</>}
        </h2>
        <div className="attribute-schema-detail-wrapper">
          <AttributeSchemaForm
            attributeListAtSchema={attributeListAtSchema}
            isCreate={isCreate}
            isUpdate={isUpdate}
            isReadOnly={isReadOnly}
            setIsReadOnly={setIsReadOnly}
            setIsCreate={setIsCreate}
            setIsUpdate={setIsUpdate}
            setAttributeListAtSchema={setAttributeListAtSchema}
          />
        </div>
      </div>
      {(isCreate || isUpdate) && (
        <AttributeSelector
          attributeListAtSchema={attributeListAtSchema}
          setAttributeListAtSchema={setAttributeListAtSchema}
        />
      )}
    </section>
  );
}

export default AttributeSchemaDetail;
