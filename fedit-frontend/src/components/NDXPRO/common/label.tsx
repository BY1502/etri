interface labelType {
  type: string;
}

function Label({ type }: labelType) {
  return (
    <div className="label">
      <span className={['label-span', `label-${type}`].join(' ')}>{type}</span>
    </div>
  );
}
export default Label;
