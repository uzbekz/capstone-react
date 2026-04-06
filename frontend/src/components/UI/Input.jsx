import React from 'react';
import './Input.css';

const Input = ({ 
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  fullWidth = false,
  variant = 'default',
  className = '',
  ...props 
}) => {
  const baseClass = 'input';
  const variantClass = `input--${variant}`;
  const errorClass = error ? 'input--error' : '';
  const widthClass = fullWidth ? 'input--full-width' : '';
  const hasIconClass = (leftIcon || rightIcon) ? 'input--has-icon' : '';
  
  const classes = [
    baseClass,
    variantClass,
    errorClass,
    widthClass,
    hasIconClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className="input-wrapper">
      {label && (
        <label className="input__label" htmlFor={props.id}>
          {label}
        </label>
      )}
      
      <div className="input__container">
        {leftIcon && (
          <span className="input__icon input__icon--left">
            {leftIcon}
          </span>
        )}
        
        <input
          className={classes}
          {...props}
        />
        
        {rightIcon && (
          <span className="input__icon input__icon--right">
            {rightIcon}
          </span>
        )}
      </div>
      
      {(error || helperText) && (
        <div className="input__helper">
          {error ? (
            <span className="input__error">{error}</span>
          ) : (
            <span className="input__help">{helperText}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default Input;
