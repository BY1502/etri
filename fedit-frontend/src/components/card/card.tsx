import { NavLink } from 'react-router-dom';
import './card.scss';

interface CardProps {
  path: string;
  icon: string;
  title: string;
  subtitle?: string;
}

export default function card({ path, icon, title, subtitle }: CardProps) {
  return (
    <NavLink to={path} className="card">
      <div className="card__icon-div">
        <img className="card__icon" src={icon} alt="icon" />
      </div>
      <p className="card__subtitle">{subtitle}</p>
      <p className="card__title">{title}</p>
    </NavLink>
  );
}
