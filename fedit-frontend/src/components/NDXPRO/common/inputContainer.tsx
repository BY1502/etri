import React, { HTMLAttributes } from 'react';

interface IProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  contentNode: React.ReactNode | null;
  isRequire?: boolean;
  bottom?: React.ReactNode;
}

function InputContainer({
  label = '',
  contentNode,
  isRequire,
  bottom,
  className,
  style,
}: IProps) {
  return (
    <div
      className={className ? `input-container ${className}` : 'input-container'}
      style={style && style}
    >
      <label>
        <span>
          {label} {isRequire ? '*' : ''}
        </span>
        {contentNode}
      </label>
      {/* FIXME: 아래의 bottom 영역은 error message 영역으로 생각 중 스타일은 추후에 적용 */}
      {bottom && <strong>bottom</strong>}
    </div>
  );
}

export default InputContainer;
