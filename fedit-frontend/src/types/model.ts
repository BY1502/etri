export interface IDataModelListItem {
  dataModelId: string;
  type: string;
  isReady: boolean;
}

//* Model Detail DTO
export interface DataModelGetResponse {
  attributeNames: { [key: string]: string };
  attributes: { [key: string]: any };
  createdAt: string;
  description: string;
  id: string;
  isDynamic: boolean;
  isReady: boolean;
  isUsing: boolean;
  modifiedAt: string;
  reference: string[];
  required: string[];
  title: string;
  type: string;
  observation: string[];
}

export interface modelProps {
  isEditPage: boolean;
  isUsing?: boolean;
  isReady?: boolean;
  useSetIsEditPage?: (bool: boolean) => void;
  removeModel?: () => void;
  addOrUpdateModel?: () => Promise<void>;
}

export interface modelAttrIProps {
  mapData: any;
  attrItem: string[];
  isEditPage: boolean;
  uri?: string;
  id?: string;
  setAttrFormInit: () => void;
  addNewCoreAttrtoModel?: any;
  addNewAttrtoModel?: (
    parent: any,
    name: any,
    attrId: string,
    jsonData: any,
    isRequiredAttr: boolean,
  ) => void;
  removeAttr: () => void;
  isEditable: boolean;
  isUsing?: boolean;
  isReady?: boolean;
}
