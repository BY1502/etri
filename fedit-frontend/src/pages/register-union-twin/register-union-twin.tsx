import Layout from 'components/layout/layout';
import './register-union-twin.scss';

export default function RegisterUnionTwin() {
  return (
    <Layout>
      <div className="register-union-twin">
        <div>
          <p>연합트윈 대시보드</p>
        </div>
        <div className="register-union-twin__container">
          <p>등록된 연합트윈이 없습니다.</p>
          <button type="button">연합트윈 등록</button>
        </div>
      </div>
    </Layout>
  );
}
