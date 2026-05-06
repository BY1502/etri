import stopImage from 'assets/images/stop.svg';

function ErrorContent({ errMsg = '잘못된 접근입니다.' }) {
  return (
    <div className="error-content">
      <div>
        <img src={stopImage} alt="stop" />
      </div>
      <strong>{errMsg}</strong>
    </div>
  );
}

export default ErrorContent;
