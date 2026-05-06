import Layout from 'components/layout/layout';
import { Route, Routes } from 'react-router-dom';
import './user-management.scss';
import UsersList from './users-list/user-list';

export default function UserManagement() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<p>user-management</p>} />
        <Route path="/users-list" element={<UsersList />} />
      </Routes>
    </Layout>
  );
}
