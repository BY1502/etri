import stopImage from 'assets/images/stop.svg';

interface IProp {
  text?: string;
  closer?: any;
}

function ErrorBox({ text, closer }: IProp) {
  return (
    <div className="warning-message-box">
      <button
        type="button"
        onClick={() => {
          if (closer) {
            closer();
          }
        }}
      >
        <img src={stopImage} alt="닫기" />
      </button>
      <p>{text}</p>
    </div>
  );
}

export default ErrorBox;
