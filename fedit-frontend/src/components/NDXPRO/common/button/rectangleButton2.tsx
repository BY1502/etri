import { ComponentProps } from 'react';

interface IProps extends ComponentProps<'button'> {
  type: 'button' | 'submit' | 'reset';
  theme: 'yellow' | 'green' | 'red' | 'blue' | 'gray' | 'deep-gray';
}

/**
 * ✅ Require Props
 * - **type**: button | submit | reset
 * - **theme**: yellow | green | red | blue | gray | deep-gray;
 *
 * ✅ you can customize this component style with className or style props.
 *
 * - default font size: 1.2rem
 * - default font weight: 500
 * - default padding: 6px 10px
 */
function RectangleButton2({
  type,
  theme,
  style,
  children,
  ...defaultProps
}: IProps): JSX.Element {
  return (
    <button
      id="rectangle-button-2"
      type={type}
      style={
        style
          ? { ...style, backgroundColor: `var(--${theme})` }
          : { backgroundColor: `var(--${theme})` }
      }
      {...defaultProps}
    >
      {children}
    </button>
  );
}

export default RectangleButton2;
