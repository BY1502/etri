import React, {
  createContext,
  Dispatch,
  SetStateAction,
  useState,
} from 'react';
import { EntityRouteInfo } from 'types/entity';

export const INIT_ENTITY_ROUTE_INFO: EntityRouteInfo = Object.freeze({
  contextId: undefined,
  modelId: undefined,
  entityId: undefined,
  historyId: undefined,
});

export const EntityRouteInfoContext = createContext<EntityRouteInfo>(
  INIT_ENTITY_ROUTE_INFO,
);

export const EntitySetRouteInfoContext = createContext<
  Dispatch<SetStateAction<EntityRouteInfo>> | undefined
>(undefined);

interface IProps {
  children: React.ReactNode;
}

function EntityRouteInfoProvider({ children }: IProps) {
  const [routeInfo, setRouteInfo] = useState<EntityRouteInfo>(
    INIT_ENTITY_ROUTE_INFO,
  );

  return (
    <EntityRouteInfoContext.Provider value={routeInfo}>
      <EntitySetRouteInfoContext.Provider value={setRouteInfo}>
        {children}
      </EntitySetRouteInfoContext.Provider>
    </EntityRouteInfoContext.Provider>
  );
}

export default EntityRouteInfoProvider;
