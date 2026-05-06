import React, { useEffect, useRef, useState } from 'react';

interface IProps {
  label: string;
  propValue?: string;
  setState?: any;
  placeholder?: string;
  isError?: boolean;
  isRequired?: boolean;
  isUnable?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}

function Input({
  label,
  propValue,
  setState,
  placeholder,
  isError,
  isRequired,
  isUnable,
  inputRef,
}: IProps) {
  const id = useRef(Math.random() * 10);
  const [inputState, setInputState] = useState('');

  const onChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputState(e.target.value);
    setState(e.target.value);
  };

  useEffect(() => {
    if (propValue !== undefined && propValue !== null) {
      setInputState(propValue);
    } else {
      setInputState('');
    }
  }, [propValue]);

  return (
    <fieldset className="input-wrapper">
      <label htmlFor={`input-${id.current}`}>
        {label} {isRequired ? '*' : ''}
        <input
          type="text"
          id={`input-${id.current}`}
          value={inputState}
          onChange={onChangeInput}
          required={isRequired}
          placeholder={placeholder === undefined ? '없음' : placeholder}
          ref={inputRef}
          readOnly={isUnable}
        />
      </label>
      {isError && <strong className="error">필수 값을 입력해주세요.</strong>}
    </fieldset>
  );
}

export default Input;
