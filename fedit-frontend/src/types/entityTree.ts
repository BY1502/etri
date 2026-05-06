export interface TreeItemType {
  target: string;
  type: string;
  parent: string;
  children: { [key: string]: any };
}

export interface TreeJsonType {
  [depth: number]: TreeItemType[];
}

export interface targetInfoType {
  target: string;
  parent: string;
}

export interface TreeHistoryType {
  treeHistoryId: string;
  treeHistory: {
    [treePath: string]: boolean;
  };
}
