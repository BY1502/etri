import Layout from 'components/layout/layout';
import { Route, Routes } from 'react-router-dom';
import AnnouncementRegister from './announcement-register/announcement-register';
import Announcement from './announcement/announcement';
import AnnouncementDetail from './announcement/announcement-management/announcement-detail/announcement-detail';
import AnnouncementManagement from './announcement/announcement-management/announcement-management';
import './notice-board-management.scss';

export default function NoticeBoardManagement() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<p>notice-board-management</p>} />
        <Route path="/announcement/*" element={<Announcement />} />
        <Route
          path="/announcement-management/*"
          element={<AnnouncementManagement />}
        />
        <Route
          path="announcement-management/:no"
          element={<AnnouncementDetail />}
        />
        <Route
          path="announcement-register"
          element={<AnnouncementRegister />}
        />
      </Routes>
    </Layout>
  );
}
