import Layout from 'components/layout/layout';
import { Route, Routes } from 'react-router-dom';
import DigitalTwinMetadataRegistration from './digital-twin-metadata-registration';
import DigitalTwinSearch from './digital-twin-search';
import MetadataVisualizationGraph from './metadata-visualization-graph';

export default function DigitalTwinMetadataManagement() {
  return (
    <Layout>
      <Routes>
        <Route path="/digital-twin-search" element={<DigitalTwinSearch />} />
        <Route
          path="/digital-twin-metadata-registration"
          element={<DigitalTwinMetadataRegistration />}
        />
        <Route
          path="/metadata-visualization-graph"
          element={<MetadataVisualizationGraph />}
        />
        <Route
          path="/digital-twin-metadata-management"
          element={<DigitalTwinMetadataManagement />}
        />
      </Routes>
    </Layout>
  );
}
