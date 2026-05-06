export interface ContextModelVO {
  type: string;
  title: string;
}

export interface ContextModelDTO {
  url: string;
  version: string;
  defaultUrl: string;
  '@context': object;
}

export interface ContextVersionType {
  url: string;
  version?: string;
}
export type ContextVersionResponse = ContextVersionType[];

export interface ContextVersionRequest {
  params: {
    contextUrl: string;
  };
}
