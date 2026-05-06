import Layout from 'components/layout/layout';
import { Route, Routes } from 'react-router-dom';
import UnionObjectSyncEngineManagement from './union-object-sync-engine-management';
import VerificationDataAdditionManagement from './verification-data-addition-management';

export default function DigitalTwinProcessingManagement() {
  return (
    <Layout>
      <Routes>
        <Route
          path="/union-object-sync-engine-management"
          element={<UnionObjectSyncEngineManagement />}
        />
        <Route
          path="/verification-data-addition-management"
          element={<VerificationDataAdditionManagement />}
        />
      </Routes>
    </Layout>
  );
}
