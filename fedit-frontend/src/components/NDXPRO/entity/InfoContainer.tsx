import PathTitle from 'components/NDXPRO/common/pathTitle';
import React from 'react';

interface IProps {
  className?: string;
  title: string;
  path: string[];
  children: React.ReactNode;
}

function InfoContainer({ className, title, path, children }: IProps) {
  return (
    <div
      className={className ? `info-containter ${className}` : 'info-containter'}
    >
      <div className="title-wrapper">
        <h3>{title}</h3>
        <PathTitle path={path} />
      </div>
      {children}
    </div>
  );
}

export default InfoContainer;
