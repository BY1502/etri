interface ButtonProps {
  type: string;
  text: string;
  onClick?: () => void;
  isDisabled?: boolean;
}

interface ToggleProps {
  text: string;
  setState: any;
  propValue?: boolean;
  isDisabled?: boolean;
}

export function RectangleButton({
  type,
  text,
  onClick,
  isDisabled = false,
}: ButtonProps) {
  return (
    <button
      className={['rectangle-button', `rectangle-button-${type}`].join(' ')}
      type="button"
      onClick={onClick}
      disabled={isDisabled}
    >
      <span className="rectangle-button-span">{text}</span>
    </button>
  );
}
export function ToogleButton({
  setState,
  text,
  propValue,
  isDisabled = false,
}: ToggleProps) {
  return (
    <div className="toggle-div">
      <span className="toggle-label">{text}</span>

      <button
        className={
          propValue ? 'active toggle-btn-div' : 'non-active toggle-btn-div'
        }
        type="button"
        onClick={() => {
          setState(!propValue);
        }}
        disabled={isDisabled}
      >
        <div
          className={propValue ? 'active toggle-btn' : 'non-active toggle-btn'}
        />
      </button>
    </div>
  );
}
