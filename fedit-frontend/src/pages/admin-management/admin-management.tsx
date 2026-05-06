import Layout from 'components/layout/layout';
import { Route, Routes } from 'react-router-dom';
import './admin-management.scss';
import AdminsGroup from './admins-group/admins-group';
import AdminsList from './admins-list/admins-list';
import AdminsRoles from './admins-roles/admins-roles';

export default function AdminManagement() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<p>admin-management</p>} />
        <Route path="/admins-list" element={<AdminsList />} />
        <Route path="/admins-group" element={<AdminsGroup />} />
        <Route path="/admins-roles" element={<AdminsRoles />} />
      </Routes>
    </Layout>
  );
}
