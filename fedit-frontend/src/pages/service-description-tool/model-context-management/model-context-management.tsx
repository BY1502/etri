import Accordion from 'components/NDXPRO/context/Accordion/Accordion';
import ContextDetail from 'components/NDXPRO/context/ContextDetail';
import { NavLink, Route, Routes } from 'react-router-dom';

export default function ModelContextManagement() {
  return (
    <div className="context-all">
      <aside className="accordion-aside">
        <div className="context-title-wrapper title-wrapper">
          <div className="title">Context</div>
        </div>
        <Accordion pagePath="context" />
        {/* {isAdmin && ( */}
        <div className="accordion-aside-rectangle-button">
          <NavLink to="/service-description-tool/model-context-management/newContext">
            Add New Context{' '}
          </NavLink>
        </div>
        {/* )} */}
      </aside>
      <Routes>
        <Route path="/:contextId" element={<ContextDetail />} />
      </Routes>
    </div>
  );
}
