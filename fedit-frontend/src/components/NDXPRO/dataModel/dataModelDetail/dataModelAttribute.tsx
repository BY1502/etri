import { useCallback, useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import { modelAttributeAtom } from 'store/dataModel/dataModelAtom';

import { ReactComponent as CloseBtn } from 'assets/images/close.svg';
import DataModelAttributeContent from 'components/NDXPRO/dataModel/dataModelAttributeContent/dataModelAttributeContent';
import DataModelObservedAtContent from 'components/NDXPRO/dataModel/dataModelAttributeContent/dataModelObservedAtContent';
import DataModelUnitCodeContent from 'components/NDXPRO/dataModel/dataModelAttributeContent/dataModelUnitCodeContent';

function DataModelAttribute({
  parentId,
  id,
  onClose,
}: {
  parentId?: string;
  id?: string;
  onClose?: () => void;
}) {
  const [attribute, setAttributes] = useRecoilState(modelAttributeAtom);
  const [currentAttribute, setCurrentAttribute] = useState<any>();

  const setAttributesHandle = () => {
    if (!currentAttribute) {
      return;
    }
    if (!parentId) {
      setAttributes((prev) => {
        const newPrev: any[] = structuredClone(prev);
        newPrev.find((e) => e.id === id).value = currentAttribute.value;
        return newPrev;
      });
    }
    if (parentId !== undefined) {
      setAttributes((prev) => {
        const newPrev: any[] = structuredClone(prev);
        const parentNode = newPrev.find((e) => e.id === parentId);
        parentNode.value.childAttributes.find((e: any) => e.id === id).value =
          currentAttribute.value;
        return newPrev;
      });
    }
  };

  useEffect(() => {
    setAttributesHandle();
  }, [currentAttribute]);

  useEffect(() => {
    if (!parentId) {
      setCurrentAttribute(attribute.find((e) => e.id === id));
      return;
    }
    const parentNode = attribute.find((e) => e.id === parentId);
    if (parentNode && parentNode.value.childAttributes) {
      setCurrentAttribute(
        parentNode.value.childAttributes.find((e: any) => e.id === id),
      );
    }
  }, [parentId, id]);

  const setCurrentAttributeHandle = useCallback((valueItem: any) => {
    setCurrentAttribute((prev: any) => {
      return { ...prev, value: { ...prev.value, ...valueItem } };
    });
  }, []);

  const setCurrentAttributeValidHandle = useCallback((validItem: any) => {
    setCurrentAttribute((prev: any) => {
      const newValid = { ...prev.value.valid, ...validItem };
      const newValue = {
        value: { ...prev.value, valid: newValid },
      };
      return { ...prev, ...newValue };
    });
  }, []);

  const attributeContent = (id: string) => {
    switch (id) {
      case 'unitCode':
        return (
          <DataModelUnitCodeContent
            attribute={currentAttribute}
            setState={setCurrentAttribute}
          />
        );
      case 'observedAt':
        return (
          <DataModelObservedAtContent
            attribute={currentAttribute}
            setState={setCurrentAttributeHandle}
          />
        );
      default:
        return (
          <DataModelAttributeContent
            keyId={`${parentId ?? 'owner'}-${currentAttribute.id}`}
            value={currentAttribute.value}
            setValue={setCurrentAttributeHandle}
            setValid={setCurrentAttributeValidHandle}
          />
        );
    }
  };

  return (
    <div className="new-data-model-attribute">
      <div className="model-attribute-title">
        {parentId ? `${parentId} > ` : ''}
        {id ?? ''}
        <button type="button" onClick={onClose}>
          <CloseBtn />
        </button>
      </div>
      {id && currentAttribute && attributeContent(id)}
    </div>
  );
}

export default DataModelAttribute;
