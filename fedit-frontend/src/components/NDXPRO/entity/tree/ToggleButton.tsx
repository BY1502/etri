import ArrowSVG from 'assets/images/arrow_right.svg';

import { Dispatch, SetStateAction } from 'react';

interface IProps {
  toggle: boolean;
  setToggle: Dispatch<SetStateAction<boolean>>;
}

function ToggleButton({ toggle, setToggle }: IProps) {
  const handleToggle = () => {
    setToggle((prev) => !prev);
  };
  const deg = toggle ? -90 : 0;

  return (
    <button type="button" onClick={handleToggle}>
      <img
        src={ArrowSVG}
        alt="토글 버튼"
        style={{ transform: `rotate(${deg}deg)` }}
      />
    </button>
  );
}

export default ToggleButton;
