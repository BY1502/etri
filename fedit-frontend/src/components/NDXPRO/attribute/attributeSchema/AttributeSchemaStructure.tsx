import { getAttributeAtAttributeSchema } from 'apis/NDXPRO/attributeSchemaApi';
import ItemIcon from 'assets/images/entity.svg';
import RemoveIcon from 'assets/images/remove_circle.svg';

import { Dispatch, SetStateAction, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { queryStringParser } from 'utils/queryStringParser';

interface IProps {
  attributeListAtSchema: string[];
  isUpdate: boolean;
  isReadOnly: boolean;
  setIsReadOnly: Dispatch<SetStateAction<boolean>>;
  setAttributeListAtSchema: Dispatch<SetStateAction<string[]>>;
}

function AttributeSchemaStructure({
  attributeListAtSchema,
  isUpdate,
  isReadOnly,
  setIsReadOnly,
  setAttributeListAtSchema,
}: IProps) {
  const param = useParams();
  const location = useLocation();
  const queryData = queryStringParser(location.search);

  const updateAttributeAtAttributeSchema = () => {
    const { attributeSchemaId } = param;
    if (attributeSchemaId) {
      getAttributeAtAttributeSchema(attributeSchemaId).then((data) => {
        setIsReadOnly(data.isReadOnly);
        const attributeList = data.value ? Object.keys(data.value) : [];
        setAttributeListAtSchema(attributeList);
      });
    }
  };

  useEffect(() => {
    updateAttributeAtAttributeSchema();
  }, [param.attributeSchemaId]);

  useEffect(() => {
    if (queryData.refresh) {
      updateAttributeAtAttributeSchema();
    }
  }, [queryData.refresh]);

  const removeAttribute = (attributeId: string) => {
    setAttributeListAtSchema(
      attributeListAtSchema.filter((attribute) => attribute !== attributeId),
    );
  };

  return (
    <article className="schema-structure">
      <strong>Attribute Schema 구조</strong>
      <div className="schema-structure-wrapper">
        <ul>
          {attributeListAtSchema.map((attribute) => {
            return (
              <li key={attribute}>
                <div>
                  <img src={ItemIcon} alt="" />
                  <span>{attribute}</span>
                </div>
                {(isUpdate || param.attributeSchemaId === undefined) && (
                  <button
                    type="button"
                    onClick={() => removeAttribute(attribute)}
                  >
                    <img src={RemoveIcon} alt="attribute 등록 취소" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

export default AttributeSchemaStructure;
