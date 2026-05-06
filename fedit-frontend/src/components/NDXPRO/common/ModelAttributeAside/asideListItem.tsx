import { useNavigate } from 'react-router-dom';

function AsideListItem({
  link,
  text,
  active,
  isReady,
  label,
  onClick,
}: {
  link?: string;
  text: string;
  active: boolean;
  isReady?: boolean;
  label?: string;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <button
      className={`aside-list-item ${active ? 'active' : ''}`}
      type="button"
      onClick={() => {
        if (link && !onClick) {
          navigate(`${link}`);
        }
        if (onClick && !link) {
          onClick();
        }
      }}
    >
      {text}
      {isReady && <span>Ready</span>}
      {label && <span>{label}</span>}
    </button>
  );
}

export default AsideListItem;
