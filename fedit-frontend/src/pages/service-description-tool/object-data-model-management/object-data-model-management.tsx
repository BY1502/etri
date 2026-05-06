import ModelAside from 'components/NDXPRO/dataModel/dataModelAttributeContent/modelAside';
import AddDataModelDetail from 'components/NDXPRO/dataModel/dataModelDetail/addDataModelDetail';
import DataModelDetail from 'components/NDXPRO/dataModel/dataModelDetail/dataModelDetail';
import { Route, Routes } from 'react-router-dom';

import './object-data-model-management.scss';

export default function ObjectDataModelManagement() {
  return (
    <div className="new-data-model">
      <ModelAside />
      <Routes>
        <Route path="/" element={<AddDataModelDetail />} />
        <Route path="/:modelId/*" element={<DataModelDetail />} />
      </Routes>
    </div>
  );
}
