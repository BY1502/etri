import { INIT_ENTITY_SEARCH_INFO } from 'components/NDXPRO/hooks/useEntitySearchInfo';
import React, {
  createContext,
  Dispatch,
  SetStateAction,
  useState,
} from 'react';
import { EntityTabType } from 'types/entity';

export const ActiveEntityTabContext = createContext<EntityTabType>({
  title: '',
  subTitle: undefined,
  contextId: '',
  modelId: '',
  entityId: '',
  historyId: undefined,
  detailId: '',
  searchInfo: INIT_ENTITY_SEARCH_INFO,
});

export const SetActiveEntityTabContext = createContext<
  Dispatch<SetStateAction<EntityTabType>> | undefined
>(undefined);

interface IProps {
  children: React.ReactNode;
}

function ActiveEntityTabProvider({ children }: IProps) {
  const [activeEntityTab, setActiveEntityTab] = useState<EntityTabType>({
    title: '',
    subTitle: undefined,
    contextId: '',
    modelId: '',
    entityId: '',
    historyId: undefined,
    detailId: '',
    searchInfo: INIT_ENTITY_SEARCH_INFO,
  });
  return (
    <ActiveEntityTabContext.Provider value={activeEntityTab}>
      <SetActiveEntityTabContext.Provider value={setActiveEntityTab}>
        {children}
      </SetActiveEntityTabContext.Provider>
    </ActiveEntityTabContext.Provider>
  );
}

export default ActiveEntityTabProvider;
