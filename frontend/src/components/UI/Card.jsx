import React from 'react';
import './Card.css';

const Card = ({ 
  children, 
  variant = 'default',
  padding = 'md',
  shadow = 'md',
  hover = false,
  className = '',
  onClick,
  ...props 
}) => {
  const baseClass = 'card';
  const variantClass = `card--${variant}`;
  const paddingClass = `card--padding-${padding}`;
  const shadowClass = `card--shadow-${shadow}`;
  const hoverClass = hover ? 'card--hover' : '';
  const interactiveClass = onClick ? 'card--interactive' : '';
  
  const classes = [
    baseClass,
    variantClass,
    paddingClass,
    shadowClass,
    hoverClass,
    interactiveClass,
    className
  ].filter(Boolean).join(' ');

  const Component = onClick ? 'div' : 'div';

  return (
    <Component
      className={classes}
      onClick={onClick}
      {...props}
    >
      {children}
    </Component>
  );
};

export default Card;
