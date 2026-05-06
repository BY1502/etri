import PrivateRoute from 'components/auth/privateRoute';
import Base from 'pages/base/base';
import Join from 'pages/base/join/join';
import Login from 'pages/base/login/login';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

function App() {
  return (
    <div className="app h-svh" id="app">
      <BrowserRouter basename="/fedit">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/join" element={<Join />} />
          <Route element={<PrivateRoute />}>
            <Route path="/*" element={<Base />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
