import EntityContextList from 'components/NDXPRO/entity/EntityContextList';
import EntityDetail from 'components/NDXPRO/entity/EntityDetail';
import EntitySelector from 'components/NDXPRO/entity/EntitySelector';
import { useEntityRouteInfo } from 'components/NDXPRO/hooks/useEntityRouteInfo';
import useEntityTabList from 'components/NDXPRO/hooks/useEntityTabList';
import { ChildRelationshipInfoProvider } from 'contexts/ChildRelationshipInfoProvider';
import { Route, Routes } from 'react-router-dom';

function EntityManagement() {
  const [entityTabList, entityTabListAction] = useEntityTabList();
  const routeInfo = useEntityRouteInfo();

  const isReadyEntitySelector = () => {
    return routeInfo.contextId && routeInfo.modelId;
  };

  return (
    <div className="entity">
      <aside className="accordion-aside">
        <h2>Entity</h2>
        <EntityContextList />
      </aside>
      {isReadyEntitySelector() && (
        <EntitySelector appendEntityTabList={entityTabListAction.append} />
      )}
      <Routes>
        <Route
          path="/:contextId/:modelId/:entityId"
          element={
            <ChildRelationshipInfoProvider>
              <EntityDetail
                entityTabList={entityTabList}
                appendEntityTabList={entityTabListAction.append}
                removeEntityTabList={entityTabListAction.remove}
              />
            </ChildRelationshipInfoProvider>
          }
        />
        <Route
          path="/:contextId/:modelId/:entityId/:historyId"
          element={
            <ChildRelationshipInfoProvider>
              <EntityDetail
                entityTabList={entityTabList}
                appendEntityTabList={entityTabListAction.append}
                removeEntityTabList={entityTabListAction.remove}
              />
            </ChildRelationshipInfoProvider>
          }
        />
      </Routes>
    </div>
  );
}

export default EntityManagement;
