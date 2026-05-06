import Layout from 'components/layout/layout';
import ActiveEntityTabProvider from 'contexts/ActiveEntityTabProvider';
import EntityRouteInfoProvider from 'contexts/EntityRouteInfoProvider';
import TreeHistoryProvider from 'contexts/TreeHistoryProvider';
import { Route, Routes } from 'react-router-dom';
import Agent from './agent/agent';
import EntityManagement from './entity-management/entity-management';
import ModelContextManagement from './model-context-management/model-context-management';
import ModelManagement from './model-management/model-management';
import ModelSchemaManagement from './model-schema-management/model-schema-management';
import ObjectDataModelManagement from './object-data-model-management/object-data-model-management';
import './service-description-tool.scss';
import ServiceLogicTool from './service-logic-tool/service-logic-tool';
import Statistics from './statistics/statistics';

export default function ServiceDescriptionTool() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<p>service-description-tool</p>} />
        <Route
          path="/object-data-model-management/*"
          element={<ObjectDataModelManagement />}
        />
        <Route path="/model-management/*" element={<ModelManagement />} />
        <Route
          path="/model-schema-management/*"
          element={<ModelSchemaManagement />}
        />
        <Route
          path="/model-context-management/*"
          element={<ModelContextManagement />}
        />
        <Route
          path="/entity-management/*"
          element={
            <ActiveEntityTabProvider>
              <EntityRouteInfoProvider>
                <TreeHistoryProvider>
                  <EntityManagement />
                </TreeHistoryProvider>
              </EntityRouteInfoProvider>
            </ActiveEntityTabProvider>
          }
        />
        <Route path="/statistics/*" element={<Statistics />} />
        <Route path="/agent/*" element={<Agent />} />
        <Route path="/service-logic-tool/*" element={<ServiceLogicTool />} />
      </Routes>
    </Layout>
  );
}
