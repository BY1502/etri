import AttributeAside from 'components/NDXPRO/attribute/attributeAside';
import AttributeDetail from 'components/NDXPRO/attribute/attributeDetail';
import { Route, Routes } from 'react-router-dom';

export default function ModelManagement() {
  return (
    <div className="attribute">
      <AttributeAside pagePath="attribute" />
      <Routes>
        <Route path="/:attrId" element={<AttributeDetail />} />
      </Routes>
    </div>
  );
}
