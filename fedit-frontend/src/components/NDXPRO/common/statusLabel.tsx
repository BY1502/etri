import { ComponentProps } from 'react';
import { TranslatorStatus } from 'types/translator';

interface IProps extends ComponentProps<'span'> {
  // TODO: Type 종류 물어보기
  type: TranslatorStatus;
}

/**
 * ✅ Require Props
 * - **type**: 'DISABLE' | 'HANG' | 'DIE' | 'CREATED' | 'STOP' | 'RUN'
 *
 * ✅ className 혹은 style props를 활용해 해당 컴포넌트의 스타일을 수정할 수 있습니다.
 * - default font size: 1rem
 * - default font weight: 700
 * - default padding: 0 5px
 *
 * ❗️주의사항
 * - className으로 style을 변경하고 싶은 경우 important 처리를 해야함
 */
function StatusLabel({
  type,
  className,
  ...defaultProps
}: IProps): JSX.Element {
  return (
    <span
      id="status-label"
      className={
        className ? `status-label ${className} ${type}` : `status-label ${type}`
      }
      {...defaultProps}
    >
      {type}
    </span>
  );
}

export default StatusLabel;
