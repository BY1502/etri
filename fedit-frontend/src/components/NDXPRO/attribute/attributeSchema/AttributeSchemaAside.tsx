import { NavLink } from 'react-router-dom';
// import { isAdminUser } from 'utils/auth';
import AttributeSchemaList from './AttributeSchemaList';

function AttributeSchemaAside() {
  return (
    <aside className="accordion-aside">
      <div className="title-wrapper">
        <h2>Attribute Schema</h2>
      </div>
      <AttributeSchemaList />
      {/* {isAdminUser() && ( */}
      <NavLink
        to="new-attribute-schema?refresh=false"
        className="aside-rectangle-anchor"
      >
        새 속성 그룹 생성
      </NavLink>
      {/* )} */}
    </aside>
  );
}

export default AttributeSchemaAside;
