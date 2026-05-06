import {
  EntityRouteInfoContext,
  EntitySetRouteInfoContext,
  INIT_ENTITY_ROUTE_INFO,
} from 'contexts/EntityRouteInfoProvider';
import { useContext, useMemo } from 'react';
import { EntityRouteInfo } from 'types/entity';

interface RouteInfoActionType {
  setContextId: (contextId: string | undefined) => void;
  setModelId: (modelId: string | undefined) => void;
  setEntityId: (entityId: string | undefined) => void;
  setHistoryId: (historyId: string | undefined) => void;
  reset: () => void;
  set: (newRouteInfo: EntityRouteInfo) => void;
}

export function useEntityRouteInfo(): EntityRouteInfo {
  return useContext(EntityRouteInfoContext);
}

export function useEntityRouteInfoAction() {
  const setRouteInfo = useContext(EntitySetRouteInfoContext);

  const routeInfoAction: RouteInfoActionType = useMemo(
    () => ({
      setContextId: (contextId: string | undefined) => {
        if (setRouteInfo === undefined) return;
        setRouteInfo((prev) => ({
          ...prev,
          contextId,
        }));
      },
      setModelId: (modelId: string | undefined) => {
        if (setRouteInfo === undefined) return;
        setRouteInfo((prev) => ({
          ...prev,
          modelId,
        }));
      },
      setEntityId: (entityId: string | undefined) => {
        if (setRouteInfo === undefined) return;
        setRouteInfo((prev) => ({
          ...prev,
          entityId,
        }));
      },
      setHistoryId: (historyId: string | undefined) => {
        if (setRouteInfo === undefined) return;
        setRouteInfo((prev) => ({
          ...prev,
          historyId,
        }));
      },
      reset: () => {
        if (setRouteInfo === undefined) return;
        setRouteInfo(INIT_ENTITY_ROUTE_INFO);
      },
      set: (newRouteInfo: EntityRouteInfo) => {
        if (setRouteInfo === undefined) return;
        setRouteInfo(newRouteInfo);
      },
    }),
    [],
  );

  return routeInfoAction;
}
