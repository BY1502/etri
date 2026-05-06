interface IProps {
  path: any[];
}

function PathTitle({ path }: IProps) {
  return (
    <ul className="path-title-wrapper">
      {path.map((item, idx) => {
        const keys = item + idx;
        return (
          <li key={keys}>
            {idx !== path.length - 1 ? (
              <span>/{item}</span>
            ) : (
              <strong>/{item}</strong>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default PathTitle;
