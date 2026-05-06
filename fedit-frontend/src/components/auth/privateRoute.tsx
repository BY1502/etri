// import { useUserInfo } from 'hooks/useUserInfo';
import { Navigate, Outlet } from 'react-router-dom';
// import { getCookie } from 'utils/cookie';

function PrivateRoute() {
  //   const { user } = useUserInfo();
  const user = true;
  const refreshToken = true;
  // const refreshToken = getCookie('refreshToken');

  if (!user || !refreshToken) {
    return <Navigate to="/login" />;
  }

  return <Outlet />;
}

export default PrivateRoute;
