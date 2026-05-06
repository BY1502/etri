import React, {
  createContext,
  Dispatch,
  SetStateAction,
  useState,
} from 'react';
import { RelationshipInfoType } from 'types/entity';

export const InfoListContext = createContext<RelationshipInfoType[]>([]);
export const SetInfoListContext = createContext<
  Dispatch<SetStateAction<RelationshipInfoType[]>> | undefined
>(undefined);

export const PathListContext = createContext<string[]>([]);
export const SetPathListContext = createContext<
  Dispatch<SetStateAction<string[]>> | undefined
>(undefined);

interface IProps {
  children: React.ReactNode;
}

export function ChildRelationshipInfoProvider({ children }: IProps) {
  const [infoList, setInfoList] = useState<RelationshipInfoType[]>([]);

  const [pathList, setPathList] = useState<string[]>([]);

  return (
    <InfoListContext.Provider value={infoList}>
      <SetInfoListContext.Provider value={setInfoList}>
        <PathListContext.Provider value={pathList}>
          <SetPathListContext.Provider value={setPathList}>
            {children}
          </SetPathListContext.Provider>
        </PathListContext.Provider>
      </SetInfoListContext.Provider>
    </InfoListContext.Provider>
  );
}
