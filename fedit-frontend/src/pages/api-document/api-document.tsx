import Layout from 'components/layout/layout';
import { Route, Routes } from 'react-router-dom';
import JejuApi from './jeju-api/jeju-api';
import Vizwide3dGuide from './vizwide3d-guide/vizwide3d-guide';

export default function ApiDocument() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<p>api</p>} />
        <Route path="/jeju-api/*" element={<JejuApi />} />
        <Route path="/vizwide3d-guide/*" element={<Vizwide3dGuide />} />
      </Routes>
    </Layout>
  );
}
