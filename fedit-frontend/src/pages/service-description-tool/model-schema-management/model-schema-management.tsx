import AttributeSchemaAside from 'components/NDXPRO/attribute/attributeSchema/AttributeSchemaAside';
import AttributeSchemaDetail from 'components/NDXPRO/attribute/attributeSchema/AttributeSchemaDetail';
import { Route, Routes } from 'react-router-dom';

export default function ModelSchemaManagement() {
  return (
    <div className="attribute-schema">
      <AttributeSchemaAside />
      <Routes>
        <Route
          path="new-attribute-schema"
          element={<AttributeSchemaDetail />}
        />
        <Route path=":attributeSchemaId" element={<AttributeSchemaDetail />} />
      </Routes>
    </div>
  );
}
