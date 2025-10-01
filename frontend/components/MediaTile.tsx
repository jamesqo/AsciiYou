import React from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export const MediaTile: React.FC<Props> = ({ children, className = "media-tile", style }) => {
  // Enforce exactly one child and that it's a valid React element
  const child = React.Children.only(children) as React.ReactElement;
  return (
    <div className={className} style={style}>
      {child}
    </div>
  );
};


