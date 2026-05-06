import { AttributeTypes, FlexableObjectType } from 'types/common';
import { NGSILDType } from 'types/entity';
import { TreeJsonType } from 'types/entityTree';

export function generateTreeListJson(attributeObj: NGSILDType) {
  const jsonForTreeList: TreeJsonType = {};

  const appendTreeItemAtTreeList = (
    target: string,
    objectValue: FlexableObjectType,
    depth: number,
    parent: string,
  ) => {
    const jsonForTreeItem = {
      target,
      type: objectValue.type,
      parent,
      children: generateChildren(target, depth, objectValue),
    };

    if (Object.keys(jsonForTreeList).includes(depth.toString())) {
      // depth가 등록된 경우
      jsonForTreeList[depth].push(jsonForTreeItem);
    } else {
      // depth가 등록되지 않은 경우
      jsonForTreeList[depth] = new Array(jsonForTreeItem);
    }
  };

  const generateChildren = (
    parent: string,
    depth: number,
    objectValue: FlexableObjectType,
  ) => {
    const children: FlexableObjectType = {};
    Object.entries(objectValue)
      .filter(([target, _]: [string, any]) => target !== 'type')
      .forEach(([target, value]: [string, any]) => {
        if (
          value.constructor === Object &&
          Object.prototype.hasOwnProperty.call(value, 'type') &&
          [AttributeTypes.Property, AttributeTypes.Relationship].includes(
            value.type,
          )
        ) {
          children[target] = `Type:${value.type}`;
          appendTreeItemAtTreeList(target, value, depth + 1, parent);
        } else {
          children[target] = value;
        }
      });

    return children;
  };

  Object.entries(attributeObj)
    .slice(3)
    .forEach(([target, value]: [string, any]) => {
      appendTreeItemAtTreeList(target, value, 0, 'root');
    });

  return jsonForTreeList;
}
