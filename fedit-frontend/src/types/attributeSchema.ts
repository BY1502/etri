export type AttributeSchemaType = string;

export interface AttributeForSchemaResType {
  id: string;
  isReadOnly: boolean;
  value: {
    [key: string]: string;
  };
}

export type AttributeType = string;

export interface AttributeSchemaPayload {
  attributeSchemaId?: string;
  reqBody: AttributeSchemaReqType;
}
export interface AttributeSchemaReqType {
  id: string;
  attributes: string[];
  isReadOnly?: boolean;
}
