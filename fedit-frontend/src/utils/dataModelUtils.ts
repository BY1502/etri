import { Dispatch, SetStateAction } from 'react';
import { SetterOrUpdater } from 'recoil';
import { IDataModelAttribute } from 'types/dataModelTypes';

export const attributesToArray = (attributeNames: any, attributes: any) => {
  const arr: any[] = [];
  Object.entries(attributes).forEach(([key, value]: any) => {
    const filteredValue = structuredClone(value);
    delete filteredValue.childAttributeNames;

    arr.push({
      id: key,
      value: !value.childAttributes
        ? value
        : {
            ...filteredValue,
            childAttributes: attributesToArray(
              value.childAttributeNames,
              value.childAttributes,
            ),
          },
      name: attributeNames[key],
      toggle: false,
    });
  });
  return arr;
};

export const ObjectMemberToArray = (objectMembers: any) => {
  const arr: any[] = [];
  Object.entries(objectMembers).forEach(([key, value]: any) => {
    arr.push({
      id: key,
      value: !value.objectMember
        ? value
        : {
            ...value,
            ...{ objectMember: ObjectMemberToArray(value.objectMember) },
          },
      toggle: false,
    });
  });
  return arr;
};

export const memberToObject = (arr: any[]) => {
  if (arr.length === 0) {
    return {};
  }
  const newObj: any = {};
  arr.forEach((e: any) => {
    newObj[e.id] = e.value;
    if (e.value.objectMember) {
      const newChildObj = structuredClone(newObj[e.id]);
      newChildObj.objectMember = memberToObject(e.value.objectMember);
      newObj[e.id] = newChildObj;
    }
  });
  return newObj;
};

export const attributesToObject = (attributes: any[]) => {
  if (!attributes) {
    return {};
  }

  const attributeNamesObj: any = {};
  attributes.forEach((e: any) => {
    attributeNamesObj[e.id] = e.name;
  });

  const attributesObj: any = {};
  attributes.forEach((e) => {
    const value = attributeFilter(e.value);
    attributesObj[e.id] = value;
    attributesObj[e.id] = {
      ...value,
      ...childAttributesToObject(attributesObj[e.id].childAttributes),
    };
  });

  return { attributeNames: attributeNamesObj, attributes: attributesObj };
};

export const childAttributesToObject = (childAttributes: any[]) => {
  if (!childAttributes) {
    return {};
  }

  const childAttributeNamesObj: any = {};
  childAttributes.forEach((e: any) => {
    childAttributeNamesObj[e.id] = e.name;
  });

  const childAttributesObj: any = {};
  childAttributes.forEach((e) => {
    const value = attributeFilter(e.value);
    childAttributesObj[e.id] = value;
  });

  return {
    childAttributeNames: childAttributeNamesObj,
    childAttributes: childAttributesObj,
  };
};

export const duplicateCheck = (arr: any[], key: string) => {
  if (arr.find((e: any) => e.id === key)) {
    return false;
  }
  return true;
};

export const childCoreCheck = (key: string) => {
  if (['unitCode', 'observedAt'].includes(key)) {
    return true;
  }
  return false;
};

export const AddAttributeOrMemberHandle = (
  owner: string | undefined,
  closer: () => void,
  attributeType: 'objectMember' | 'childAttributes',
  newItem: any,
  state: any,
  setState: Dispatch<SetStateAction<any>>,
  setModelSelected?: SetterOrUpdater<(string | undefined)[]>,
) => {
  const newState = structuredClone(state);

  if (!owner) {
    // 해당 속성이 최상위 Attribute인 경우
    if (!duplicateCheck(newState, newItem.id)) {
      alert('Duplicate Attribute exist');
      return;
    }
    if (childCoreCheck(newItem.id)) {
      alert(`${newItem.id} must be a Child attribute`);
      return;
    }
    newState.push(newItem);
  }

  if (owner) {
    // 해당 속성이 childAttribute인 경우
    const ownerObj = newState.find((e: any) => e.id === owner);

    if (!ownerObj.value[attributeType]) {
      ownerObj.value[attributeType] = [];
    }

    if (!duplicateCheck(ownerObj.value[attributeType], newItem.id)) {
      alert(`Duplicate child attribute exist in ${owner}`);
      return;
    }
    ownerObj.value[attributeType].push(newItem);
    ownerObj.toggle = true; // 하위 항목이 추가된 상위 항목을 unfold한다
  }

  setState(newState);
  closer();

  if (setModelSelected) {
    // 해당 속성 active
    setModelSelected([owner, newItem.id]);
  }
};

export const modelInfoFilter = (info: any) => {
  const newInfo = structuredClone(info);
  if (newInfo.title === '') {
    delete newInfo.title;
  }

  if (newInfo.description === '') {
    delete newInfo.description;
  }

  if (newInfo.reference && newInfo.reference.length === 0) {
    delete newInfo.reference;
  }

  return newInfo;
};

const attributeFilter = (value: IDataModelAttribute) => {
  const newValue = structuredClone(value);
  if (newValue.format === '') {
    delete newValue.format;
  }

  if (newValue.enum?.length === 0) {
    delete newValue.enum;
  }

  if (
    newValue.objectMember &&
    Object.entries(newValue.objectMember).length === 0
  ) {
    delete newValue.objectMember;
  }

  if (newValue.valid && Object.entries(newValue.valid).length === 0) {
    delete newValue.valid;
  }

  if (newValue.modelType?.length === 0) {
    delete newValue.modelType;
  }

  if (newValue.description === '') {
    delete newValue.description;
  }
  return newValue;
};
